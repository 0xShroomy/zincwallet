// lib/lightwalletd.js
// Using Tatum FreeRPC for testnet instead of gRPC
const ZCASH_RPC_ENDPOINTS = {
  mainnet: null, // Use Blockchair for mainnet
  testnet: 'https://zcash-testnet.gateway.tatum.io'
};

/**
 * Fetch balance from Tatum RPC for testnet t-addresses
 * Uses listunspent RPC method to get UTXOs and calculate balance
 */
export async function getLightwalletdBalance(address, network = 'testnet') {
  const rpcEndpoint = ZCASH_RPC_ENDPOINTS[network];
  
  if (!rpcEndpoint) {
    return {
      success: true,
      balance: 0,
      transactions: 0,
      error: 'No RPC endpoint for this network'
    };
  }
  
  try {
    console.log(`[Tatum RPC] Fetching balance for ${address} on ${network}`);
    
    // Get API key from environment variable based on network
    const apiKey = network === 'testnet' 
      ? process.env.TATUM_TESTNET_API_KEY || ''
      : process.env.TATUM_MAINNET_API_KEY || '';
    
    // Call listunspent RPC to get UTXOs for the address
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
    
    // Add API key if available (optional for now, but recommended)
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }
    
    const response = await fetch(rpcEndpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'listunspent',
        params: [0, 9999999, [address]], // min confirmations, max confirmations, addresses
        id: 1
      }),
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`Tatum RPC returned ${response.status}`);
    }
    
    const data = await response.json();
    
    // Check for RPC error
    if (data.error) {
      throw new Error(`RPC Error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    
    // Calculate total balance from UTXOs
    let totalBalance = 0;
    let utxoCount = 0;
    
    if (data.result && Array.isArray(data.result)) {
      utxoCount = data.result.length;
      totalBalance = data.result.reduce((sum, utxo) => {
        // UTXO amount is in ZEC, convert to zatoshis (1 ZEC = 100,000,000 zatoshis)
        const zatoshis = Math.round((utxo.amount || 0) * 100000000);
        return sum + zatoshis;
      }, 0);
    }
    
    console.log(`[Tatum RPC] ✓ Balance: ${totalBalance} zatoshis (${utxoCount} UTXOs)`);
    
    return {
      success: true,
      balance: totalBalance,
      transactions: utxoCount,
      source: rpcEndpoint
    };
    
  } catch (error) {
    console.error('[Tatum RPC] Error:', error);
    // Fallback: return 0 balance but don't fail
    return {
      success: true,
      balance: 0,
      transactions: 0,
      source: rpcEndpoint,
      error: error.message
    };
  }
}

/**
 * Fetch transactions from Tatum RPC for testnet
 * Uses listunspent to get UTXO-based transaction history
 */
export async function getLightwalletdTransactions(address, network = 'testnet', limit = 50) {
  const rpcEndpoint = ZCASH_RPC_ENDPOINTS[network];
  
  if (!rpcEndpoint) {
    return {
      success: true,
      transactions: [],
      error: 'No RPC endpoint for this network'
    };
  }
  
  try {
    console.log(`[Tatum RPC] Fetching transactions for ${address} on ${network}`);
    
    // Get API key from environment variable based on network
    const apiKey = network === 'testnet' 
      ? process.env.TATUM_TESTNET_API_KEY || ''
      : process.env.TATUM_MAINNET_API_KEY || '';
    
    // Prepare headers
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
    
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }
    
    // Get UTXOs which contain transaction info
    const response = await fetch(rpcEndpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'listunspent',
        params: [0, 9999999, [address]],
        id: 1
      }),
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      throw new Error(`Tatum RPC returned ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(`RPC Error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    
    // Transform UTXOs to transaction format
    const transactions = [];
    if (data.result && Array.isArray(data.result)) {
      for (const utxo of data.result.slice(0, limit)) {
        transactions.push({
          txid: utxo.txid,
          vout: utxo.vout,
          amount: Math.round((utxo.amount || 0) * 100000000), // Convert to zatoshis
          confirmations: utxo.confirmations || 0,
          spendable: utxo.spendable !== false
        });
      }
    }
    
    console.log(`[Tatum RPC] ✓ Found ${transactions.length} transactions`);
    
    return {
      success: true,
      transactions: transactions,
      source: rpcEndpoint
    };
    
  } catch (error) {
    console.error('[Tatum RPC] Transactions error:', error);
    return {
      success: true,
      transactions: [],
      source: rpcEndpoint,
      error: error.message
    };
  }
}
