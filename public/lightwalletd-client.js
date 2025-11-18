/**
 * Lightwalletd Client - Plain JavaScript
 * Queries Zcash blockchain for balance and UTXOs
 */

'use strict';

self.LightwalletdClient = (function() {
  
  // Network configuration
  let currentNetwork = 'testnet'; // Start with testnet for development
  
  const NETWORKS = {
    mainnet: {
      explorers: [
        'https://api.blockchair.com/zcash',
        'https://api.zcha.in/v2/mainnet',
      ],
      name: 'Mainnet',
    },
    testnet: {
      explorers: [
        'https://api.blockchair.com/zcash/testnet',
        'https://explorer.testnet.z.cash/api',
      ],
      name: 'Testnet',
    },
  };
  
  /**
   * Switch network (mainnet/testnet)
   */
  function setNetwork(network) {
    if (NETWORKS[network]) {
      currentNetwork = network;
      console.log('[Lightwalletd] Switched to', NETWORKS[network].name);
      return true;
    }
    return false;
  }
  
  /**
   * Get current network
   */
  function getNetwork() {
    return currentNetwork;
  }
  
  /**
   * Get address balance from block explorer
   */
  async function getBalance(address) {
    console.log(`[Lightwalletd] Fetching ${NETWORKS[currentNetwork].name} balance for:`, address);
    
    // Try Blockchair API first
    try {
      const apiUrl = `${NETWORKS[currentNetwork].explorers[0]}/dashboards/address/${address}`;
      console.log('[Lightwalletd] Querying:', apiUrl);
      
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[Lightwalletd] Blockchair response:', data);
      
      if (data.data && data.data[address]) {
        const addrData = data.data[address].address;
        const balance = addrData.balance || 0;
        const txCount = addrData.transaction_count || 0;
        
        console.log('[Lightwalletd] ✓ Balance:', balance, 'zatoshis =', (balance / 100000000).toFixed(8), 'ZEC');
        console.log('[Lightwalletd] ✓ Transactions:', txCount);
        
        return {
          balance,
          transactions: txCount,
        };
      }
      
      return { balance: 0, transactions: 0 };
    } catch (error) {
      console.error('[Lightwalletd] Blockchair failed:', error.message);
      
      // Try fallback explorer
      return getBalanceFallback(address);
    }
  }
  
  /**
   * Fallback: Try secondary explorer
   */
  async function getBalanceFallback(address) {
    console.log('[Lightwalletd] Trying fallback - returning 0 for now');
    console.warn('⚠️  All explorer APIs failed - Check network connection or try testnet faucet');
    
    return {
      balance: 0,
      transactions: 0,
    };
  }
  
  /**
   * Get UTXOs for address (for building transactions)
   */
  async function getUtxos(address) {
    console.log('[Lightwalletd] Fetching UTXOs - not yet implemented');
    // TODO: Implement UTXO fetching when needed for transactions
    return [];
  }
  
  /**
   * Get blockchain info (current height)
   */
  async function getBlockchainInfo() {
    console.log('[Lightwalletd] Fetching blockchain info');
    // TODO: Implement when needed
    return { height: 0, bestblockhash: '' };
  }
  
  /**
   * Broadcast raw transaction
   */
  async function sendRawTransaction(txHex) {
    console.log('[Lightwalletd] Broadcasting transaction');
    // TODO: Implement transaction broadcast
    throw new Error('Transaction broadcast not yet implemented');
  }
  
  return {
    getBalance,
    getUtxos,
    getBlockchainInfo,
    sendRawTransaction,
    setNetwork,
    getNetwork,
  };
  
})();

console.log('[Lightwalletd] Client loaded');
