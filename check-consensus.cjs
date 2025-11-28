require('dotenv').config({ path: '.env.local' });

async function checkConsensus() {
  const TATUM_API_KEY = process.env.TATUM_API_KEY;
  if (!TATUM_API_KEY) {
    console.error('No Tatum API key found');
    return;
  }

  console.log('Fetching blockchain info...');
  
  try {
    const response = await fetch('https://api.tatum.io/v3/blockchain/node/ZEC', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TATUM_API_KEY
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getblockchaininfo',
        params: []
      })
    });

    const data = await response.json();
    if (data.error) {
      console.error('Error:', data.error);
      return;
    }

    console.log('Current Block Height:', data.result.blocks);
    console.log('Consensus:', JSON.stringify(data.result.consensus, null, 2));
    
    // Check upgrades
    const upgrades = data.result.upgrades;
    if (upgrades) {
        console.log('Upgrades:', JSON.stringify(upgrades, null, 2));
        
        // Find active upgrade
        const height = data.result.blocks;
        let currentUpgrade = null;
        for (const [id, info] of Object.entries(upgrades)) {
            if (info.activationHeight <= height) {
                if (!currentUpgrade || info.activationHeight > currentUpgrade.activationHeight) {
                    currentUpgrade = { id, ...info };
                }
            }
        }
        console.log('Active Upgrade:', currentUpgrade);
    }
    
  } catch (err) {
    console.error('Failed:', err);
  }
}

checkConsensus();
