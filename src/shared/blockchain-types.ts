/**
 * Lightwalletd API Client
 * Connects to Zcash lightwalletd servers for balance queries and transaction submission
 */

export interface UTXO {
  txid: string;
  vout: number;
  address: string;
  script: string;
  satoshis: number;
  height: number;
}

export interface AddressBalance {
  address: string;
  balance: number; // in zatoshis (1 ZEC = 100,000,000 zatoshis)
  transactions: number;
}

export interface Transaction {
  txid: string;
  height: number;
  timestamp: number;
  value: number;
  fee: number;
}

/**
 * Lightwalletd server endpoints
 * Using public infrastructure
 */
const LIGHTWALLETD_SERVERS = [
  'https://mainnet.lightwalletd.com:9067',
  'https://zcash.mysideoftheweb.com:9067',
  'https://zec.rocks:443',
];

let currentServer = LIGHTWALLETD_SERVERS[0];

/**
 * Make RPC call to lightwalletd
 */
async function rpcCall(method: string, params: any[] = []): Promise<any> {
  const response = await fetch(currentServer, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`Lightwalletd request failed: ${response.statusText}`);
  }

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Lightwalletd error: ${data.error.message}`);
  }

  return data.result;
}

/**
 * Get address balance
 */
export async function getAddressBalance(address: string): Promise<AddressBalance> {
  try {
    const result = await rpcCall('getaddressbalance', [{ addresses: [address] }]);
    
    return {
      address,
      balance: result.balance || 0,
      transactions: result.transactions || 0,
    };
  } catch (error) {
    console.error('[Lightwalletd] Failed to get balance:', error);
    // Return zero balance on error
    return {
      address,
      balance: 0,
      transactions: 0,
    };
  }
}

/**
 * Get UTXOs for an address
 */
export async function getAddressUtxos(address: string): Promise<UTXO[]> {
  try {
    const result = await rpcCall('getaddressutxos', [{ addresses: [address] }]);
    
    if (!Array.isArray(result)) {
      return [];
    }

    return result.map((utxo: any) => ({
      txid: utxo.txid,
      vout: utxo.outputIndex,
      address: utxo.address,
      script: utxo.script,
      satoshis: utxo.satoshis,
      height: utxo.height || 0,
    }));
  } catch (error) {
    console.error('[Lightwalletd] Failed to get UTXOs:', error);
    return [];
  }
}

/**
 * Get transaction history for an address
 */
export async function getAddressTransactions(
  address: string,
  limit = 10
): Promise<Transaction[]> {
  try {
    const result = await rpcCall('getaddresstxids', [
      { addresses: [address], start: 0, end: 999999999 },
    ]);

    if (!Array.isArray(result)) {
      return [];
    }

    // Fetch details for each transaction
    const transactions: Transaction[] = [];
    
    for (const txid of result.slice(0, limit)) {
      try {
        const tx = await rpcCall('getrawtransaction', [txid, 1]);
        
        transactions.push({
          txid: tx.txid,
          height: tx.height || 0,
          timestamp: tx.time || 0,
          value: calculateTxValue(tx, address),
          fee: tx.fee || 0,
        });
      } catch (error) {
        console.warn(`[Lightwalletd] Failed to fetch tx ${txid}:`, error);
      }
    }

    return transactions.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('[Lightwalletd] Failed to get transactions:', error);
    return [];
  }
}

/**
 * Calculate transaction value relative to an address
 */
function calculateTxValue(tx: any, address: string): number {
  let value = 0;

  // Add received value
  if (tx.vout) {
    for (const output of tx.vout) {
      if (output.scriptPubKey?.addresses?.includes(address)) {
        value += output.value * 100000000; // Convert to zatoshis
      }
    }
  }

  // Subtract sent value
  if (tx.vin) {
    for (const input of tx.vin) {
      if (input.address === address && input.value) {
        value -= input.value * 100000000;
      }
    }
  }

  return Math.round(value);
}

/**
 * Broadcast a raw transaction
 */
export async function sendRawTransaction(txHex: string): Promise<string> {
  try {
    const txid = await rpcCall('sendrawtransaction', [txHex]);
    return txid;
  } catch (error) {
    console.error('[Lightwalletd] Failed to broadcast transaction:', error);
    throw error;
  }
}

/**
 * Get current blockchain height
 */
export async function getBlockchainInfo(): Promise<{ height: number; bestblockhash: string }> {
  try {
    const info = await rpcCall('getblockchaininfo', []);
    return {
      height: info.blocks || 0,
      bestblockhash: info.bestblockhash || '',
    };
  } catch (error) {
    console.error('[Lightwalletd] Failed to get blockchain info:', error);
    throw error;
  }
}

/**
 * Change server (fallback mechanism)
 */
export function switchServer(serverIndex?: number): string {
  if (serverIndex !== undefined && serverIndex < LIGHTWALLETD_SERVERS.length) {
    currentServer = LIGHTWALLETD_SERVERS[serverIndex];
  } else {
    const currentIndex = LIGHTWALLETD_SERVERS.indexOf(currentServer);
    const nextIndex = (currentIndex + 1) % LIGHTWALLETD_SERVERS.length;
    currentServer = LIGHTWALLETD_SERVERS[nextIndex];
  }
  
  console.log('[Lightwalletd] Switched to server:', currentServer);
  return currentServer;
}
