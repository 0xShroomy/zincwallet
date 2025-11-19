/**
 * Lightwalletd Client - Plain JavaScript
 * Queries Zcash blockchain for balance and UTXOs
 */

'use strict';

self.LightwalletdClient = (function() {
  
  // Network configuration
  let currentNetwork = 'mainnet'; // Start with mainnet by default
  
  // PROXY CONFIGURATION
  // Vercel proxy endpoint for Zcash blockchain data
  const PROXY_URL = 'https://vercel-proxy-boutbouwt.vercel.app/api';
  
  const NETWORKS = {
    mainnet: {
      // Using Vercel proxy to avoid CORS issues
      proxyUrl: PROXY_URL,
      name: 'Mainnet',
    },
    testnet: {
      // Testnet support (can add testnet endpoints to proxy later)
      proxyUrl: PROXY_URL,
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
   * Get address balance via Vercel proxy
   */
  async function getBalance(address) {
    console.log(`[Lightwalletd] Fetching ${NETWORKS[currentNetwork].name} balance for:`, address);
    
    const proxyUrl = NETWORKS[currentNetwork].proxyUrl;
    
    if (!proxyUrl || proxyUrl.includes('YOUR-VERCEL-APP')) {
      console.error('[Lightwalletd] ❌ PROXY NOT CONFIGURED!');
      console.error('[Lightwalletd] Please deploy the Vercel proxy and update PROXY_URL in lightwalletd-client.js');
      return { balance: 0, transactions: 0 };
    }
    
    try {
      const apiUrl = `${proxyUrl}/balance?address=${address}`;
      console.log('[Lightwalletd] Querying proxy:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        console.error(`[Lightwalletd] Proxy returned ${response.status}`);
        const errorData = await response.json().catch(() => ({}));
        console.error('[Lightwalletd] Error:', errorData);
        return { balance: 0, transactions: 0 };
      }
      
      const data = await response.json();
      
      if (data.success) {
        console.log('[Lightwalletd] ✓ Balance:', data.balance, 'zatoshis =', (data.balance / 100000000).toFixed(8), 'ZEC');
        console.log('[Lightwalletd] ✓ Source:', data.source);
        return {
          balance: data.balance,
          transactions: data.transactions
        };
      } else {
        console.error('[Lightwalletd] Proxy error:', data.error);
        return { balance: 0, transactions: 0 };
      }
      
    } catch (error) {
      console.error('[Lightwalletd] Failed to fetch balance:', error.message);
      return { balance: 0, transactions: 0 };
    }
  }
  
  /**
   * Get UTXOs for address via Vercel proxy
   */
  async function getUtxos(address) {
    console.log(`[Lightwalletd] Fetching UTXOs for ${address}`);
    
    const proxyUrl = NETWORKS[currentNetwork].proxyUrl;
    
    if (!proxyUrl || proxyUrl.includes('YOUR-VERCEL-APP')) {
      console.error('[Lightwalletd] ❌ PROXY NOT CONFIGURED!');
      return [];
    }
    
    try {
      const apiUrl = `${proxyUrl}/utxos?address=${address}`;
      console.log('[Lightwalletd] Querying proxy:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        console.error(`[Lightwalletd] Proxy returned ${response.status}`);
        return [];
      }
      
      const data = await response.json();
      
      if (data.success && Array.isArray(data.utxos)) {
        console.log('[Lightwalletd] ✓ Found', data.utxos.length, 'UTXOs');
        console.log('[Lightwalletd] ✓ Source:', data.source);
        return data.utxos;
      } else {
        console.error('[Lightwalletd] Proxy error:', data.error);
        return [];
      }
      
    } catch (error) {
      console.error('[Lightwalletd] Failed to fetch UTXOs:', error.message);
      return [];
    }
  }
  
  /**
   * Get blockchain info (current height)
   */
  async function getBlockchainInfo() {
    console.log('[Lightwalletd] Fetching blockchain info');
    
    for (const explorerBase of NETWORKS[currentNetwork].explorers) {
      try {
        const apiUrl = `${explorerBase}/status`;
        const response = await fetch(apiUrl);
        
        if (response.ok) {
          const data = await response.json();
          return {
            height: data.info?.blocks || data.blocks || 0,
            bestblockhash: data.info?.bestblockhash || data.bestblockhash || '',
          };
        }
      } catch (error) {
        continue;
      }
    }
    
    return { height: 0, bestblockhash: '' };
  }
  
  /**
   * Broadcast transaction via Vercel proxy
   */
  async function broadcastTransaction(txHex) {
    console.log(`[Lightwalletd] Broadcasting transaction (${txHex.length} bytes)`);
    
    const proxyUrl = NETWORKS[currentNetwork].proxyUrl;
    
    if (!proxyUrl || proxyUrl.includes('YOUR-VERCEL-APP')) {
      throw new Error('Proxy not configured. Please deploy Vercel proxy first.');
    }
    
    try {
      const apiUrl = `${proxyUrl}/broadcast`;
      console.log('[Lightwalletd] Broadcasting via proxy:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ txHex })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[Lightwalletd] Broadcast failed:', errorData);
        throw new Error(errorData.error || `Proxy returned ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.txid) {
        console.log('[Lightwalletd] ✓ Transaction broadcast successful!');
        console.log('[Lightwalletd] ✓ TXID:', data.txid);
        console.log('[Lightwalletd] ✓ Source:', data.source);
        return data.txid;
      } else {
        throw new Error(data.error || 'Broadcast failed');
      }
      
    } catch (error) {
      console.error('[Lightwalletd] Broadcast error:', error.message);
      throw error;
    }
  }
  
  return {
    getBalance,
    getUtxos,
    getBlockchainInfo,
    broadcastTransaction,
    setNetwork,
    getNetwork,
  };
  
})();

console.log('[Lightwalletd] Client loaded');
