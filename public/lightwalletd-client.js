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
      // Public Zcash insight API servers
      explorers: [
        'https://insight.zcash.com/api',
        'https://zcashnetwork.info/api',
        'https://api.blockchair.com/zcash',
      ],
      name: 'Mainnet',
    },
    testnet: {
      // Public testnet explorers with API access
      explorers: [
        'https://explorer.testnet.z.cash/api',
        'https://testnet.zcash.community/api',
        'https://api.blockchair.com/zcash/testnet',
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
   * Uses Insight API format (compatible with most Zcash explorers)
   */
  async function getBalance(address) {
    console.log(`[Lightwalletd] Fetching ${NETWORKS[currentNetwork].name} balance for:`, address);
    
    // Try each explorer in order
    for (const explorerBase of NETWORKS[currentNetwork].explorers) {
      try {
        // Try Insight API format first: /addr/{address}
        const apiUrl = `${explorerBase}/addr/${address}`;
        console.log('[Lightwalletd] Querying:', apiUrl);
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });
        
        if (!response.ok) {
          console.warn(`[Lightwalletd] ${explorerBase} returned ${response.status}`);
          continue; // Try next explorer
        }
        
        const data = await response.json();
        console.log('[Lightwalletd] Explorer response:', data);
        
        // Insight API format
        if (typeof data.balance !== 'undefined') {
          const balance = Math.round(data.balance * 100000000); // Convert ZEC to zatoshis
          const txCount = data.txApperances || data.transactions || 0;
          
          console.log('[Lightwalletd] ✓ Balance:', balance, 'zatoshis =', (balance / 100000000).toFixed(8), 'ZEC');
          console.log('[Lightwalletd] ✓ Transactions:', txCount);
          
          return {
            balance,
            transactions: txCount,
          };
        }
        
        // Blockchair format (fallback)
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
        
      } catch (error) {
        console.warn(`[Lightwalletd] ${explorerBase} failed:`, error.message);
        continue; // Try next explorer
      }
    }
    
    // All explorers failed
    console.error('[Lightwalletd] All explorers failed');
    return { balance: 0, transactions: 0 };
  }
  
  /**
   * Get UTXOs for address (needed for building transactions)
   * Uses Insight API format: /addr/{address}/utxo
   */
  async function getUtxos(address) {
    console.log(`[Lightwalletd] Fetching UTXOs for ${address}`);
    
    // Try each explorer
    for (const explorerBase of NETWORKS[currentNetwork].explorers) {
      try {
        const apiUrl = `${explorerBase}/addr/${address}/utxo`;
        console.log('[Lightwalletd] Querying UTXOs:', apiUrl);
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });
        
        if (!response.ok) {
          console.warn(`[Lightwalletd] ${explorerBase} returned ${response.status} for UTXOs`);
          continue;
        }
        
        const utxos = await response.json();
        
        if (Array.isArray(utxos)) {
          console.log(`[Lightwalletd] ✓ Found ${utxos.length} UTXOs`);
          
          return utxos.map(utxo => ({
            txid: utxo.txid,
            vout: utxo.vout,
            scriptPubKey: utxo.scriptPubKey,
            satoshis: utxo.satoshis || Math.round(utxo.amount * 100000000),
            confirmations: utxo.confirmations || 0,
          }));
        }
        
      } catch (error) {
        console.warn(`[Lightwalletd] ${explorerBase} UTXO fetch failed:`, error.message);
        continue;
      }
    }
    
    console.error('[Lightwalletd] Could not fetch UTXOs from any explorer');
    return [];
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
   * Broadcast raw transaction
   * Uses Insight API: POST /tx/send with { rawtx: "hex" }
   */
  async function sendRawTransaction(txHex) {
    console.log('[Lightwalletd] Broadcasting transaction');
    console.log('[Lightwalletd] Tx hex length:', txHex.length);
    
    // Try each explorer
    for (const explorerBase of NETWORKS[currentNetwork].explorers) {
      try {
        const apiUrl = `${explorerBase}/tx/send`;
        console.log('[Lightwalletd] Broadcasting to:', apiUrl);
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            rawtx: txHex,
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`[Lightwalletd] ${explorerBase} broadcast failed: ${errorText}`);
          continue;
        }
        
        const result = await response.json();
        const txid = result.txid || result.result || result;
        
        console.log('[Lightwalletd] ✓ Transaction broadcast successful!');
        console.log('[Lightwalletd] ✓ TXID:', txid);
        
        return txid;
        
      } catch (error) {
        console.warn(`[Lightwalletd] ${explorerBase} broadcast failed:`, error.message);
        continue;
      }
    }
    
    throw new Error('Failed to broadcast transaction to any explorer');
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
