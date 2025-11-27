// Vercel serverless function to broadcast Zcash transactions
// Sends signed transactions to the network

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { txHex, network = 'mainnet' } = req.body;
  
  if (!txHex) {
    return res.status(400).json({ error: 'txHex parameter required' });
  }

  // Tatum API keys from environment
  const TATUM_KEY = network === 'testnet' 
    ? process.env.TATUM_TESTNET_API_KEY
    : process.env.TATUM_MAINNET_API_KEY;
  
  if (!TATUM_KEY) {
    return res.status(500).json({ 
      success: false,
      error: 'Tatum API key not configured' 
    });
  }
  
  // Use Tatum Gateway RPC endpoint for Zcash
  const tatumUrl = network === 'testnet'
    ? 'https://zcash-testnet.gateway.tatum.io'
    : 'https://zcash-mainnet.gateway.tatum.io';
  
  const explorers = [
    {
      url: tatumUrl,
      method: 'POST',
      format: 'tatum-rpc',
      apiKey: TATUM_KEY
    }
  ];

  for (const explorer of explorers) {
    try {
      console.log(`Broadcasting to: ${explorer.url}`);
      
      const response = await fetch(explorer.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-api-key': explorer.apiKey,
          'User-Agent': 'ZincWallet/1.0'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'sendrawtransaction',
          params: [txHex]
        }),
        signal: AbortSignal.timeout(15000) // 15 second timeout for broadcast
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`Broadcast failed with ${response.status}: ${errorText}`);
        continue;
      }

      const data = await response.json();
      
      // Tatum RPC format: { result: "txid", error: null }
      if (explorer.format === 'tatum-rpc') {
        if (data.result) {
          return res.status(200).json({
            success: true,
            txid: data.result,
            source: 'Tatum Zcash RPC'
          });
        } else if (data.error) {
          console.log(`Tatum RPC error: ${JSON.stringify(data.error)}`);
          return res.status(400).json({
            success: false,
            error: data.error.message || 'Transaction broadcast failed',
            details: data.error
          });
        }
      }

    } catch (error) {
      console.log(`Broadcast error: ${error.message}`);
      continue;
    }
  }

  // All broadcast attempts failed
  return res.status(503).json({
    success: false,
    error: 'Failed to broadcast transaction to any explorer'
  });
}
