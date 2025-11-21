// Vercel serverless function to fetch Zcash transaction history
// Keeps API key secure on server-side

// Simple in-memory cache
const txCache = new Map();
const CACHE_TTL = 30000; // 30 seconds

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { address, limit = 50 } = req.query;
  
  if (!address) {
    return res.status(400).json({ error: 'Address parameter required' });
  }

  // Check cache first
  const cacheKey = `${address}_${limit}`;
  const cached = txCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[Transactions] Cache HIT for ${address}`);
    return res.status(200).json({
      ...cached.data,
      cached: true
    });
  }

  try {
    // Get API key from environment (secure!)
    const blockchairKey = process.env.BLOCKCHAIR_API_KEY;
    
    if (!blockchairKey) {
      throw new Error('BLOCKCHAIR_API_KEY not configured');
    }

    const apiUrl = `https://api.blockchair.com/zcash/dashboards/address/${address}?key=${blockchairKey}&limit=${limit}`;
    
    console.log(`[Transactions] Fetching from Blockchair for ${address}`);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ZyncWallet/1.0'
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`Blockchair API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Parse Blockchair response
    const addressData = data.data?.[address];
    if (!addressData) {
      throw new Error('Invalid Blockchair response');
    }

    // Transform to our format
    const transactions = (addressData.transactions || []).map(txid => {
      // Find transaction details in UTXO data
      const txDetails = addressData.utxo?.find(u => u.transaction_hash === txid) || {};
      
      return {
        txid: txid,
        type: txDetails.value > 0 ? 'received' : 'sent',
        amount: Math.abs(txDetails.value || 0),
        timestamp: txDetails.time ? new Date(txDetails.time).getTime() / 1000 : Date.now() / 1000,
        confirmations: txDetails.block_id ? (data.context?.state || 0) - txDetails.block_id : 0,
        blockId: txDetails.block_id
      };
    });

    console.log(`[Transactions] ✓ Fetched ${transactions.length} transactions`);

    const result = {
      success: true,
      transactions: transactions,
      source: 'blockchair'
    };

    // Cache the result
    txCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error('[Transactions] Error:', error.message);
    
    return res.status(503).json({
      success: false,
      error: error.message,
      transactions: []
    });
  }
}
