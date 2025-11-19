// Vercel serverless function to fetch Zcash address balance
// Avoids CORS issues by proxying requests server-side

// Simple in-memory cache (resets when function cold-starts)
const balanceCache = new Map();
const CACHE_TTL = 30000; // 30 seconds

export default async function handler(req, res) {
  // Enable CORS for your extension - MUST be first
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { address } = req.query;
  
  if (!address) {
    return res.status(400).json({ error: 'Address parameter required' });
  }

  // Check cache first
  const cached = balanceCache.get(address);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[Cache HIT] ${address}`);
    return res.status(200).json({
      ...cached.data,
      cached: true
    });
  }

  // Try multiple explorers in order
  // For Blockchair: Add your free API key as environment variable BLOCKCHAIR_API_KEY
  // eslint-disable-next-line no-undef
  const blockchairKey = process.env.BLOCKCHAIR_API_KEY || '';
  const blockchairUrl = blockchairKey 
    ? `https://api.blockchair.com/zcash/dashboards/address/${address}?key=${blockchairKey}`
    : `https://api.blockchair.com/zcash/dashboards/address/${address}`;
  
  const explorers = [
    {
      url: blockchairUrl,
      format: 'blockchair'
    },
    {
      url: `https://api.zcha.in/v2/mainnet/accounts/${address}`,
      format: 'zchain'
    }
  ];

  for (const explorer of explorers) {
    try {
      console.log(`Trying explorer: ${explorer.url}`);
      
      const response = await fetch(explorer.url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ZincWallet/1.0'
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (!response.ok) {
        console.log(`Explorer returned ${response.status}`);
        continue;
      }

      const data = await response.json();
      
      // Parse different API formats
      let balance = 0;
      let txCount = 0;
      
      if (explorer.format === 'blockchair') {
        // Blockchair format
        if (data.data && data.data[address]) {
          const addrData = data.data[address].address;
          balance = addrData.balance || 0;
          txCount = addrData.transaction_count || 0;
        }
      } else if (explorer.format === 'insight') {
        // Insight API format
        balance = Math.round((data.balance || 0) * 100000000);
        txCount = data.txApperances || data.transactions || 0;
      } else if (explorer.format === 'zchain') {
        // zcha.in format
        balance = (data.totalReceived || 0) - (data.totalSent || 0);
        txCount = data.txCount || 0;
      }

      const result = {
        success: true,
        balance,
        transactions: txCount,
        source: explorer.url
      };
      
      // Cache successful result
      balanceCache.set(address, {
        data: result,
        timestamp: Date.now()
      });
      
      return res.status(200).json(result);

    } catch (error) {
      console.log(`Explorer failed: ${error.message}`);
      continue;
    }
  }

  // All explorers failed
  return res.status(503).json({
    success: false,
    error: 'All Zcash explorers are unavailable',
    balance: 0,
    transactions: 0
  });
}
