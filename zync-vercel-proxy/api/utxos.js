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

  // API keys from environment
  const BLOCKCHAIR_KEY = process.env.BLOCKCHAIR_API_KEY || 'A___EsSizQQ9Y2ukrBGc1X6tGbsogmFz';
  const TATUM_KEY = network === 'testnet' 
    ? process.env.TATUM_TESTNET_API_KEY
    : process.env.TATUM_MAINNET_API_KEY;
  
  // Select explorers based on network
  // Priority: Tatum (has scriptPubKey) > Blockchair (fallback)
  const explorers = network === 'testnet'
    ? [
        // For testnet, use Tatum RPC
        {
          url: 'https://zcash-testnet.gateway.tatum.io',
          format: 'tatum-rpc',
          apiKey: TATUM_KEY
        }
      ]
    : [
        // Mainnet: Try Tatum first (has proper scriptPubKey), then Blockchair fallback
        ...(TATUM_KEY ? [{
          url: 'https://zcash-mainnet.gateway.tatum.io',
          format: 'tatum-rpc',
          apiKey: TATUM_KEY
        }] : []),
        {
          url: `https://api.blockchair.com/zcash/dashboards/address/${address}?key=${BLOCKCHAIR_KEY}`,
          format: 'blockchair'
        }
      ];

  for (const explorer of explorers) {
    try {
      console.log(`Fetching UTXOs from: ${explorer.url} (format: ${explorer.format})`);
      
      // Tatum RPC format: use listunspent method
      if (explorer.format === 'tatum-rpc') {
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
            method: 'listunspent',
            params: [1, 9999999, [address]] // minconf, maxconf, addresses
          }),
          signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
          console.log(`Tatum RPC returned ${response.status}`);
          continue;
        }

        const data = await response.json();
        
        if (data.result && Array.isArray(data.result)) {
          return res.status(200).json({
            success: true,
            utxos: data.result.map(utxo => ({
              txid: utxo.txid,
              vout: utxo.vout,
              address: utxo.address || address,
              scriptPubKey: utxo.scriptPubKey, // Tatum provides this!
              value: Math.round(utxo.amount * 100000000), // Convert ZEC to zatoshis
              satoshis: Math.round(utxo.amount * 100000000),
              height: utxo.height || 0,
              confirmations: utxo.confirmations || 0
            })),
            source: 'Tatum RPC'
          });
        }
        continue;
      }
      
      // For non-RPC explorers, use GET
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
      
      // Blockchair format
      if (explorer.format === 'blockchair' && data.data && data.data[address]) {
        const addressData = data.data[address];
        if (addressData.utxo && Array.isArray(addressData.utxo)) {
          return res.status(200).json({
            success: true,
            utxos: addressData.utxo.map(utxo => ({
              txid: utxo.transaction_hash,
              vout: utxo.index,
              address: address,
              scriptPubKey: utxo.script_hex,
              value: utxo.value,
              satoshis: utxo.value,
              height: utxo.block_id,
              confirmations: addressData.address?.transaction_count || 0
            })),
            source: explorer.url
          });
        }
      }
      
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
