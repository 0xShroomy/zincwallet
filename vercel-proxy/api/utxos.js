// Vercel serverless function to fetch UTXOs for a Zcash address
// Required for building transactions

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { address, network = 'mainnet' } = req.query;
  
  if (!address) {
    return res.status(400).json({ error: 'Address parameter required' });
  }

  // Select explorers based on network
  const explorers = network === 'testnet'
    ? [
        // For testnet, we'll use Tatum RPC listunspent
        {
          url: null,  // Will use Tatum RPC
          format: 'tatum'
        }
      ]
    : [
        // Mainnet explorers
        {
          url: `https://insight.zcash.com/api/addr/${address}/utxo`,
          format: 'insight'
        },
        {
          url: `https://zcashnetwork.info/api/addr/${address}/utxo`,
          format: 'insight'
        }
      ];

  for (const explorer of explorers) {
    try {
      console.log(`Fetching UTXOs from: ${explorer.url}`);
      
      const response = await fetch(explorer.url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ZincWallet/1.0'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        console.log(`Explorer returned ${response.status}`);
        continue;
      }

      const data = await response.json();
      
      // Insight API format (array of UTXOs)
      if (Array.isArray(data)) {
        return res.status(200).json({
          success: true,
          utxos: data.map(utxo => ({
            txid: utxo.txid,
            vout: utxo.vout,
            address: utxo.address,
            scriptPubKey: utxo.scriptPubKey,
            amount: utxo.amount,
            satoshis: utxo.satoshis || Math.round(utxo.amount * 100000000),
            height: utxo.height,
            confirmations: utxo.confirmations
          })),
          source: explorer.url
        });
      }

    } catch (error) {
      console.log(`Explorer failed: ${error.message}`);
      continue;
    }
  }

  // All explorers failed
  return res.status(503).json({
    success: false,
    error: 'Unable to fetch UTXOs from any explorer',
    utxos: []
  });
}
