/**
 * Lightwalletd Client - Plain JavaScript
 * Queries Zcash blockchain for balance and UTXOs
 */

'use strict';

self.LightwalletdClient = (function() {
  
  // Public lightwalletd servers
  const SERVERS = [
    'https://mainnet.lightwalletd.com:9067',
    'https://zcash.mysideoftheweb.com:9067',
  ];
  
  let currentServer = SERVERS[0];
  
  /**
   * Make JSON-RPC call to lightwalletd
   */
  async function rpcCall(method, params = []) {
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
      throw new Error(`Lightwalletd error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(`RPC error: ${data.error.message}`);
    }
    
    return data.result;
  }
  
  /**
   * Get address balance
   */
  async function getBalance(address) {
    try {
      console.log('[Lightwalletd] Fetching balance for:', address);
      
      const result = await rpcCall('getaddressbalance', [{ addresses: [address] }]);
      
      console.log('[Lightwalletd] Balance result:', result);
      
      return {
        balance: result.balance || 0,
        transactions: result.transactions || 0,
      };
    } catch (error) {
      console.error('[Lightwalletd] Balance fetch failed:', error);
      
      // Try fallback: use block explorer API
      return getFallbackBalance(address);
    }
  }
  
  /**
   * Fallback: Use Zcash block explorer API
   */
  async function getFallbackBalance(address) {
    try {
      console.log('[Lightwalletd] Trying fallback API...');
      
      // Use zcha.in explorer API
      const response = await fetch(`https://api.zcha.in/v2/mainnet/accounts/${address}`);
      
      if (!response.ok) {
        throw new Error('Fallback API failed');
      }
      
      const data = await response.json();
      
      console.log('[Lightwalletd] Fallback result:', data);
      
      return {
        balance: data.balance || 0,
        transactions: data.totalRecv ? 1 : 0,
      };
    } catch (error) {
      console.error('[Lightwalletd] Fallback also failed:', error);
      
      // Return zero balance if all methods fail
      return {
        balance: 0,
        transactions: 0,
      };
    }
  }
  
  /**
   * Get UTXOs for address (for building transactions)
   */
  async function getUtxos(address) {
    try {
      console.log('[Lightwalletd] Fetching UTXOs for:', address);
      
      const result = await rpcCall('getaddressutxos', [{ addresses: [address] }]);
      
      if (!Array.isArray(result)) {
        return [];
      }
      
      return result.map(utxo => ({
        txid: utxo.txid,
        vout: utxo.outputIndex,
        script: utxo.script,
        satoshis: utxo.satoshis,
        height: utxo.height || 0,
      }));
    } catch (error) {
      console.error('[Lightwalletd] UTXO fetch failed:', error);
      return [];
    }
  }
  
  /**
   * Get blockchain info (current height)
   */
  async function getBlockchainInfo() {
    try {
      const info = await rpcCall('getblockchaininfo', []);
      return {
        height: info.blocks || 0,
        bestblockhash: info.bestblockhash || '',
      };
    } catch (error) {
      console.error('[Lightwalletd] Blockchain info failed:', error);
      return { height: 0, bestblockhash: '' };
    }
  }
  
  /**
   * Broadcast raw transaction
   */
  async function sendRawTransaction(txHex) {
    try {
      const txid = await rpcCall('sendrawtransaction', [txHex]);
      console.log('[Lightwalletd] Transaction broadcast successful:', txid);
      return txid;
    } catch (error) {
      console.error('[Lightwalletd] Broadcast failed:', error);
      throw error;
    }
  }
  
  return {
    getBalance,
    getUtxos,
    getBlockchainInfo,
    sendRawTransaction,
  };
  
})();

console.log('[Lightwalletd] Client loaded');
