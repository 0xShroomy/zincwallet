/**
 * Get current Zcash block height
 */

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { network = 'mainnet' } = req.query;

  // Tatum API key from environment
  const TATUM_API_KEY = process.env.TATUM_API_KEY;
  
  if (!TATUM_API_KEY) {
    return res.status(500).json({ 
      error: 'Tatum API key not configured' 
    });
  }

  try {
    // Call Tatum's getblockchaininfo RPC
    const tatumUrl = 'https://api.tatum.io/v3/blockchain/node/ZEC';
    
    const response = await fetch(tatumUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TATUM_API_KEY
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'getblockchaininfo',
        params: []
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`Tatum API error: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error));
    }

    const blockHeight = data.result?.blocks;
    const consensus = data.result?.consensus;

    if (!blockHeight) {
      throw new Error('Block height not found in response');
    }

    return res.status(200).json({
      blockHeight,
      consensus,
      network,
      source: 'tatum'
    });

  } catch (error) {
    console.error('[Blockheight] Error:', error);
    
    return res.status(500).json({ 
      error: 'Failed to fetch block height',
      details: error.message 
    });
  }
}
