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
  const PROXY_URL = 'https://vercel-proxy-loghorizon.vercel.app/api';
  
  const NETWORKS = {
    mainnet: {
      // Using Vercel proxy to avoid CORS issues
      proxyUrl: PROXY_URL,
      name: 'Mainnet',
      explorer: 'https://mainnet.zcashexplorer.app',
    },
    testnet: {
      // Testnet support (can add testnet endpoints to proxy later)
      proxyUrl: PROXY_URL,
      name: 'Testnet',
      explorer: 'https://testnet.zcashexplorer.app',
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
      console.error('[Lightwalletd] Please deploy the Vercel proxy and update PROXY_URL in blockchain-client.js');
      return { balance: 0, transactions: 0 };
    }
    
    try {
      const apiUrl = `${proxyUrl}/balance?address=${address}&network=${currentNetwork}`;
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
    
    // Try proxy first
    if (proxyUrl && !proxyUrl.includes('YOUR-VERCEL-APP')) {
      try {
        const apiUrl = `${proxyUrl}/utxos?address=${address}`;
        console.log('[Lightwalletd] Querying proxy:', apiUrl);
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.success && Array.isArray(data.utxos)) {
            console.log('[Lightwalletd] ✓ Found', data.utxos.length, 'UTXOs via proxy');
            console.log('[Lightwalletd] ✓ Source:', data.source);
            return data.utxos;
          }
        }
        
        console.warn(`[Lightwalletd] Proxy failed (${response.status}), falling back to direct Blockchair`);
      } catch (error) {
        console.warn('[Lightwalletd] Proxy error, falling back to direct Blockchair:', error.message);
      }
    }
    
    // Fallback: Direct Blockchair API
    try {
      const blockchairUrl = `https://api.blockchair.com/zcash/dashboards/address/${address}?key=A___EsSizQQ9Y2ukrBGc1X6tGbsogmFz`;
      console.log('[Lightwalletd] Querying Blockchair directly:', blockchairUrl);
      
      const response = await fetch(blockchairUrl);
      if (!response.ok) {
        console.error('[Lightwalletd] Blockchair returned', response.status);
        return [];
      }
      
      const data = await response.json();
      const addressData = data.data?.[address];
      
      if (!addressData || !addressData.utxo) {
        console.log('[Lightwalletd] No UTXOs found');
        return [];
      }
      
      // Convert Blockchair UTXO format
      const utxos = addressData.utxo.map(utxo => ({
        txid: utxo.transaction_hash,
        vout: utxo.index,
        value: utxo.value,
        scriptPubKey: utxo.script_hex,
        height: utxo.block_id
      }));
      
      console.log('[Lightwalletd] ✓ Found', utxos.length, 'UTXOs via Blockchair');
      return utxos;
      
    } catch (error) {
      console.error('[Lightwalletd] Blockchair fallback failed:', error.message);
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
   * Broadcast transaction via Vercel proxy with Blockchair fallback
   */
  async function broadcastTransaction(txHex) {
    console.log(`[Lightwalletd] Broadcasting transaction (${txHex.length} bytes)`);
    
    const proxyUrl = NETWORKS[currentNetwork].proxyUrl;
    
    // Try proxy first
    if (proxyUrl && !proxyUrl.includes('YOUR-VERCEL-APP')) {
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
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.success && data.txid) {
            console.log('[Lightwalletd] ✓ Transaction broadcast successful via proxy!');
            console.log('[Lightwalletd] ✓ TXID:', data.txid);
            console.log('[Lightwalletd] ✓ Source:', data.source);
            return data.txid;
          }
        }
        
        console.warn(`[Lightwalletd] Proxy broadcast failed (${response.status}), falling back to Blockchair`);
      } catch (error) {
        console.warn('[Lightwalletd] Proxy error, falling back to Blockchair:', error.message);
      }
    }
    
    // Fallback: Direct Blockchair push API
    try {
      const blockchairUrl = `https://api.blockchair.com/zcash/push/transaction?key=A___EsSizQQ9Y2ukrBGc1X6tGbsogmFz`;
      console.log('[Lightwalletd] Broadcasting via Blockchair:', blockchairUrl);
      
      const response = await fetch(blockchairUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: txHex
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Lightwalletd] Blockchair returned', response.status, errorText);
        throw new Error(`Blockchair broadcast failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.data && data.data.transaction_hash) {
        const txid = data.data.transaction_hash;
        console.log('[Lightwalletd] ✓ Transaction broadcast successful via Blockchair!');
        console.log('[Lightwalletd] ✓ TXID:', txid);
        return txid;
      } else if (data.context && data.context.error) {
        throw new Error(`Blockchair error: ${data.context.error}`);
      } else {
        throw new Error('Broadcast failed: Unknown error');
      }
      
    } catch (error) {
      console.error('[Lightwalletd] Broadcast failed:', error.message);
      throw error;
    }
  }
  
  /**
   * Get explorer URL for current network
   */
  function getExplorerUrl() {
    return NETWORKS[currentNetwork].explorer;
  }
  
  /**
   * Get transaction URL in explorer
   */
  function getTransactionUrl(txid) {
    return `${NETWORKS[currentNetwork].explorer}/tx/${txid}`;
  }
  
  /**
   * Get address URL in explorer
   */
  function getAddressUrl(address) {
    return `${NETWORKS[currentNetwork].explorer}/address/${address}`;
  }
  
  return {
    getBalance,
    getUtxos,
    getBlockchainInfo,
    broadcastTransaction,
    setNetwork,
    getNetwork,
    getExplorerUrl,
    getTransactionUrl,
    getAddressUrl,
  };
  
})();

console.log('[Lightwalletd] Client loaded');
