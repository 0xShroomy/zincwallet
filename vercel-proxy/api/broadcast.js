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

  const { txHex } = req.body;
  
  if (!txHex) {
    return res.status(400).json({ error: 'txHex parameter required' });
  }

  // Try multiple explorers for broadcasting
  const explorers = [
    {
      url: 'https://insight.zcash.com/api/tx/send',
      method: 'POST',
      format: 'insight'
    },
    {
      url: 'https://zcashnetwork.info/api/tx/send',
      method: 'POST',
      format: 'insight'
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
          'User-Agent': 'ZincWallet/1.0'
        },
        body: JSON.stringify({ rawtx: txHex }),
        signal: AbortSignal.timeout(15000) // 15 second timeout for broadcast
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`Broadcast failed with ${response.status}: ${errorText}`);
        continue;
      }

      const data = await response.json();
      
      // Insight API returns { txid: "..." }
      if (data.txid) {
        return res.status(200).json({
          success: true,
          txid: data.txid,
          source: explorer.url
        });
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
