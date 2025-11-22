// Vercel serverless function to fetch Zcash transaction history
// Keeps API key secure on server-side
// Supports both mainnet (Blockchair) and testnet (Lightwalletd)

import { getLightwalletdTransactions } from '../lib/lightwalletd.js';

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

  const { address, network = 'mainnet', limit = 50 } = req.query;
  
  if (!address) {
    return res.status(400).json({ error: 'Address parameter required' });
  }

  // Check cache first (include network in cache key)
  const cacheKey = `${network}:${address}_${limit}`;
  const cached = txCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[Transactions] Cache HIT for ${network} - ${address}`);
    return res.status(200).json({
      ...cached.data,
      cached: true
    });
  }

  // Route to appropriate API based on network
  if (network === 'testnet') {
    console.log(`[Testnet] Fetching transactions for ${address}`);
    const result = await getLightwalletdTransactions(address, 'testnet', limit);
    
    // Cache the result
    txCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
    
    return res.status(200).json(result);
  }

  // Mainnet: Use Blockchair
  try {
    // Get API key from environment (secure!)
    const blockchairKey = process.env.BLOCKCHAIR_API_KEY;
    
    if (!blockchairKey) {
      throw new Error('BLOCKCHAIR_API_KEY not configured');
    }

    // Blockchair API - Use dashboards endpoint with calls
    // This returns full transaction details including timestamps
    const apiUrl = `https://api.blockchair.com/zcash/dashboards/address/${address}?key=${blockchairKey}&transaction_details=true&limit=${limit}`;
    
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

    const currentBlockHeight = data.context?.state || 0;
    const transactions_details = data.data?.transactions || {};
    
    console.log('[Transactions] Full response structure:', {
      hasData: !!data.data,
      hasAddress: !!addressData,
      addressKeys: Object.keys(addressData || {}),
      txArray: addressData.transactions,
      txDetailsKeys: Object.keys(transactions_details),
      contextState: currentBlockHeight
    });
    
    // If no transactions, return empty but log it
    if (!addressData.transactions || addressData.transactions.length === 0) {
      console.log('[Transactions] No transactions found in address data');
    }

    // Transform to our format
    // Blockchair returns transactions as objects with all data included
    const transactions = (addressData.transactions || []).map((tx, index) => {
      console.log(`[Transactions] Processing tx ${index}:`, typeof tx, tx);
      
      // Check if tx is an object (new format) or string (old format)
      if (typeof tx === 'string') {
        // Old format: just txid string
        // Try to find in UTXOs first (for received funds)
        const txUtxos = (addressData.utxo || []).filter(u => u.transaction_hash === tx);
        
        if (txUtxos.length > 0) {
          // Found in UTXOs - this is received funds
          const firstUtxo = txUtxos[0];
          const balanceChange = txUtxos.reduce((sum, u) => sum + (u.value || 0), 0);
          
          return {
            txid: tx,
            type: 'received',
            amount: Math.abs(balanceChange),
            timestamp: firstUtxo.time || 0,
            confirmations: firstUtxo.block_id ? Math.max(0, currentBlockHeight - firstUtxo.block_id) : 0,
            blockId: firstUtxo.block_id
          };
        } else {
          // Not in UTXOs - could be spent or we need to use transactions endpoint
          // For now, skip transactions without UTXO data
          console.log(`[Transactions] Skipping tx ${tx.slice(0,8)} - no UTXO data`);
          return null;
        }
      } else {
        // New format: tx is an object with all data
        const timestamp = tx.time ? Math.floor(new Date(tx.time).getTime() / 1000) : 0;
        const balanceChange = tx.balance_change || 0;
        
        return {
          txid: tx.hash,
          type: balanceChange > 0 ? 'received' : 'sent',
          amount: Math.abs(balanceChange),
          timestamp: timestamp,
          confirmations: tx.block_id ? Math.max(0, currentBlockHeight - tx.block_id) : 0,
          blockId: tx.block_id
        };
      }
    });
    
    console.log('[Transactions] Before filter:', transactions.map(tx => tx ? ({
      txid: tx.txid?.slice(0, 8),
      timestamp: tx.timestamp,
      amount: tx.amount,
      willPass: tx.timestamp > 0 && tx.amount > 0
    }) : null));
    
    const filteredTransactions = transactions
      .filter(tx => tx !== null)  // Remove nulls first
      .filter(tx => tx.timestamp > 0 && tx.amount > 0);  // Then filter invalid

    console.log(`[Transactions] ✓ Fetched ${filteredTransactions.length} transactions`);

    const result = {
      success: true,
      transactions: filteredTransactions,
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
