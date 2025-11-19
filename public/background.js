// Plain JavaScript - no bundling needed
'use strict';

console.log('[Background] Starting...');

// ============================================================================
// LOAD BIP39 LIBRARY, ZCASH KEYS, AND LIGHTWALLETD CLIENT
// ============================================================================

// Import BIP39 library, Zcash address derivation, lightwalletd client, and transaction builder
/* global importScripts */
importScripts('bip39.js');
importScripts('zcash-keys.js');
importScripts('lightwalletd-client.js');
importScripts('zcash-transaction.js');

// ============================================================================
// CRYPTO UTILITIES
// ============================================================================

/**
 * Generate a cryptographically secure random BIP39 mnemonic (24 words)
 * With proper checksum validation
 */
async function generateMnemonic() {
  if (typeof self.BIP39 === 'undefined') {
    throw new Error('BIP39 library not loaded');
  }
  
  const mnemonic = await self.BIP39.generateMnemonic();
  console.log('[Background] Generated BIP39 mnemonic with checksum');
  return mnemonic;
}

/**
 * Derive encryption key from password using PBKDF2
 */
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data using AES-GCM
 */
async function encrypt(data, password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const key = await deriveKey(password, salt);
  
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    enc.encode(data)
  );
  
  // Combine salt + iv + encrypted data
  const result = new Uint8Array(salt.length + iv.length + encryptedData.byteLength);
  result.set(salt, 0);
  result.set(iv, salt.length);
  result.set(new Uint8Array(encryptedData), salt.length + iv.length);
  
  // Convert to base64
  return btoa(String.fromCharCode(...result));
}

/**
 * Decrypt mnemonic using AES-GCM
 */
async function decryptMnemonic(encryptedBase64, password) {
  // Decode from base64
  const encryptedBytes = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  
  // Extract salt, iv, and data
  const salt = encryptedBytes.slice(0, 16);
  const iv = encryptedBytes.slice(16, 28);
  const data = encryptedBytes.slice(28);
  
  const key = await deriveKey(password, salt);
  
  const decryptedData = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    data
  );
  
  const dec = new TextDecoder();
  return dec.decode(decryptedData);
}

// ============================================================================
// WALLET STATE MANAGEMENT
// ============================================================================

let walletState = {
  isInitialized: false,
  isLocked: true,
  address: '',
  balance: 0,
  network: 'mainnet' // Default to mainnet
};

// Set lightwalletd client to mainnet
if (typeof self.LightwalletdClient !== 'undefined') {
  self.LightwalletdClient.setNetwork('mainnet');
  console.log('[Background] Network set to MAINNET');
}

// ===========================================================================
// MULTI-WALLET MANAGEMENT
// ===========================================================================

/**
 * Get all wallets from storage
 */
async function getAllWallets() {
  const stored = await chrome.storage.local.get(['wallets', 'activeWalletId']);
  return {
    wallets: stored.wallets || [],
    activeWalletId: stored.activeWalletId || null
  };
}

/**
 * Save wallet to storage
 */
async function saveWallet(wallet) {
  const { wallets } = await getAllWallets();
  
  // Check if wallet already exists (by address)
  const existingIndex = wallets.findIndex(w => w.address === wallet.address);
  
  if (existingIndex >= 0) {
    // Update existing
    wallets[existingIndex] = { ...wallets[existingIndex], ...wallet };
  } else {
    // Add new
    wallets.push(wallet);
  }
  
  await chrome.storage.local.set({ wallets });
  return wallet;
}

/**
 * Set active wallet
 */
async function setActiveWallet(walletId) {
  await chrome.storage.local.set({ activeWalletId: walletId });
}

/**
 * Get active wallet
 */
async function getActiveWallet() {
  const { wallets, activeWalletId } = await getAllWallets();
  return wallets.find(w => w.id === activeWalletId) || null;
}

/**
 * Initialize wallet state from storage
 */
async function initWalletState() {
  const { wallets, activeWalletId } = await getAllWallets();
  
  // Also check legacy single wallet storage for backwards compatibility
  const legacy = await chrome.storage.local.get(['encryptedSeed']);
  
  if (legacy.encryptedSeed && wallets.length === 0) {
    // Migrate legacy wallet
    console.log('[Background] Migrating legacy wallet to multi-wallet format');
    const walletId = 'wallet_' + Date.now();
    await chrome.storage.local.set({
      wallets: [{
        id: walletId,
        name: 'My Wallet',
        encryptedSeed: legacy.encryptedSeed,
        createdAt: Date.now()
      }],
      activeWalletId: walletId
    });
    await chrome.storage.local.remove(['encryptedSeed']);
  }
  
  walletState.isInitialized = wallets.length > 0;
  
  // Check if wallet was previously unlocked (within session)
  const session = await chrome.storage.session.get(['walletUnlocked', 'walletAddress', 'unlockTime', 'activeWalletId']);
  
  if (session.walletUnlocked && session.walletAddress && session.activeWalletId === activeWalletId) {
    // Check if session is still valid (30 minute timeout)
    const now = Date.now();
    const unlockTime = session.unlockTime || 0;
    const thirtyMinutes = 30 * 60 * 1000;
    
    if (now - unlockTime < thirtyMinutes) {
      walletState.isLocked = false;
      walletState.address = session.walletAddress;
      console.log('[Background] Restored wallet session:', walletState.address);
      
      // Auto-refresh balance after session restore
      handleRefreshBalance().catch(err => {
        console.warn('[Background] Auto-refresh balance failed:', err);
      });
    } else {
      // Session expired, clear it
      await chrome.storage.session.remove(['walletUnlocked', 'walletAddress', 'unlockTime', 'activeWalletId']);
      console.log('[Background] Wallet session expired');
    }
  }
  
  console.log('[Background] Wallet initialized:', walletState.isInitialized, 'Total wallets:', wallets.length);
}

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

async function handleCreateWallet(data) {
  try {
    const { password, name } = data;
    
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }
    
    // Generate mnemonic
    const mnemonic = await generateMnemonic();
    
    // Encrypt seed
    const encryptedSeed = await encrypt(mnemonic, password);
    
    // Derive address from mnemonic
    const { address, derivationPath } = await self.ZcashKeys.deriveAddress(mnemonic, 0, 0);
    
    // Create wallet object
    const walletId = 'wallet_' + Date.now();
    const wallet = {
      id: walletId,
      name: name || `Wallet ${(await getAllWallets()).wallets.length + 1}`,
      address,
      encryptedSeed,
      derivationPath,
      createdAt: Date.now()
    };
    
    // Save wallet
    await saveWallet(wallet);
    await setActiveWallet(walletId);
    
    // Update state
    walletState.isInitialized = true;
    walletState.isLocked = false;
    walletState.address = address;
    
    // Save session state
    await chrome.storage.session.set({
      walletUnlocked: true,
      walletAddress: address,
      unlockTime: Date.now(),
      activeWalletId: walletId
    });
    
    console.log('[Background] Wallet created successfully:', wallet.name);
    console.log('[Background] Address:', address);
    
    // Auto-refresh balance
    handleRefreshBalance().catch(err => {
      console.warn('[Background] Auto-refresh balance failed:', err);
    });
    
    return {
      success: true,
      mnemonic,
      address,
      walletId,
      walletName: wallet.name
    };
  } catch (error) {
    console.error('[Background] Wallet creation failed:', error);
    throw error;
  }
}

async function handleUnlockWallet(data) {
  try {
    const { password } = data;

    if (!password) {
      throw new Error('Password is required');
    }

    console.log('[Background] Unlocking wallet...');

    // Get active wallet from multi-wallet storage
    const { wallets, activeWalletId } = await getAllWallets();
    
    if (!wallets || wallets.length === 0) {
      throw new Error('No wallet found. Please create a wallet first.');
    }
    
    // Use active wallet or first wallet
    const wallet = wallets.find(w => w.id === activeWalletId) || wallets[0];
    
    if (!wallet || !wallet.encryptedSeed) {
      throw new Error('No wallet found. Please create a wallet first.');
    }

    console.log('[Background] Decrypting wallet:', wallet.name);
    const mnemonic = await decryptMnemonic(wallet.encryptedSeed, password);

    if (!mnemonic) {
      throw new Error('Failed to decrypt wallet. Wrong password?');
    }

    console.log('[Background] Deriving address...');
    const derived = await self.ZcashKeys.deriveAddress(mnemonic, 0, 0);

    if (!derived || !derived.address) {
      throw new Error('Failed to derive address');
    }

    console.log('[Background] Address derived:', derived.address);

    // Update wallet state
    walletState.address = derived.address;
    walletState.isLocked = false;
    walletState.balance = 0;

    // Cache decrypted mnemonic and private key in session storage for transaction signing
    await chrome.storage.session.set({
      walletUnlocked: true,
      walletAddress: derived.address,
      unlockTime: Date.now(),
      activeWalletId: wallet.id,
      cachedMnemonic: mnemonic,
      cachedPrivateKey: derived.privateKey,
    });

    console.log('[Background] Wallet unlocked successfully:', wallet.name);
    
    // Refresh balance
    handleRefreshBalance().catch(err => {
      console.warn('[Background] Auto-refresh balance failed:', err);
    });

    return {
      success: true,
      address: derived.address,
      walletName: wallet.name
    };
  } catch (error) {
    console.error('[Background] Wallet unlock failed:', error);
    throw new Error('Invalid password');
  }
}

async function handleLockWallet() {
  walletState.isLocked = true;
  walletState.address = '';
  walletState.balance = 0;
  
  // Clear session state
  await chrome.storage.session.remove(['walletUnlocked', 'walletAddress', 'unlockTime']);
  
  console.log('[Background] Wallet locked');
  
  return {
    success: true
  };
}

async function handleImportWallet(data) {
  try {
    const { mnemonic, password, name } = data;
    
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }
    
    if (!mnemonic || mnemonic.trim().split(/\s+/).length !== 24) {
      throw new Error('Invalid mnemonic - must be 24 words');
    }
    
    // Encrypt seed
    const encryptedSeed = await encrypt(mnemonic.trim(), password);
    
    // Derive address
    const { address, derivationPath } = await self.ZcashKeys.deriveAddress(mnemonic.trim(), 0, 0);
    
    // Create wallet object
    const walletId = 'wallet_' + Date.now();
    const wallet = {
      id: walletId,
      name: name || `Imported Wallet ${(await getAllWallets()).wallets.length + 1}`,
      address,
      encryptedSeed,
      derivationPath,
      createdAt: Date.now(),
      imported: true
    };
    
    // Save wallet
    await saveWallet(wallet);
    await setActiveWallet(walletId);
    
    // Update state
    walletState.isInitialized = true;
    walletState.isLocked = false;
    walletState.address = address;
    
    // Save session state
    await chrome.storage.session.set({
      walletUnlocked: true,
      walletAddress: address,
      unlockTime: Date.now(),
      activeWalletId: walletId
    });
    
    console.log('[Background] Wallet imported successfully:', wallet.name);
    console.log('[Background] Address:', address);
    
    // Auto-refresh balance
    handleRefreshBalance().catch(err => {
      console.warn('[Background] Auto-refresh balance failed:', err);
    });
    
    return {
      success: true,
      address,
      walletId,
      walletName: wallet.name
    };
  } catch (error) {
    console.error('[Background] Wallet import failed:', error);
    throw error;
  }
}

async function handleGetState() {
  return { ...walletState };
}

async function handleGetWallets() {
  const { wallets, activeWalletId } = await getAllWallets();
  return {
    success: true,
    wallets: wallets.map(w => ({
      id: w.id,
      name: w.name,
      address: w.address,
      createdAt: w.createdAt,
      imported: w.imported || false
    })),
    activeWalletId
  };
}

async function handleSwitchWallet(data) {
  try {
    const { walletId, password } = data;
    
    const { wallets } = await getAllWallets();
    const wallet = wallets.find(w => w.id === walletId);
    
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    if (!password) {
      throw new Error('Password required');
    }
    
    // Decrypt and verify password
    const mnemonic = await decryptMnemonic(wallet.encryptedSeed, password);
    if (!mnemonic) {
      throw new Error('Invalid password');
    }
    
    // Derive keys
    const { address, privateKey } = await self.ZcashKeys.deriveAddress(mnemonic, 0, 0);
    
    // Set as active
    await setActiveWallet(walletId);
    
    // Update state
    walletState.isLocked = false;
    walletState.address = address;
    walletState.balance = 0;
    
    // Cache in session
    await chrome.storage.session.set({
      walletUnlocked: true,
      walletAddress: address,
      unlockTime: Date.now(),
      activeWalletId: walletId,
      cachedMnemonic: mnemonic,
      cachedPrivateKey: privateKey
    });
    
    console.log('[Background] Switched to wallet:', wallet.name);
    
    // Refresh balance
    handleRefreshBalance().catch(err => {
      console.warn('[Background] Auto-refresh balance failed:', err);
    });
    
    return {
      success: true,
      walletId,
      walletName: wallet.name,
      address
    };
  } catch (error) {
    console.error('[Background] Wallet switch failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function handleRefreshBalance() {
  try {
    if (!walletState.address) {
      throw new Error('No address available');
    }
    
    console.log('[Background] Refreshing balance for:', walletState.address);
    
    // Query lightwalletd for real balance
    const result = await self.LightwalletdClient.getBalance(walletState.address);
    
    // Update wallet state with real balance
    walletState.balance = result.balance;
    
    console.log('[Background] Balance updated:', {
      balance: result.balance,
      transactions: result.transactions,
      balanceZEC: (result.balance / 100000000).toFixed(8),
    });
    
    // Note about zero balance
    if (result.balance === 0) {
      console.log('[Background] Balance is 0 ZEC - this could mean:');
      console.log('  1. Address has no funds (new wallet)');
      console.log('  2. CORS restrictions prevented API query');
      console.log('  3. API services are temporarily unavailable');
    }
    
    return {
      success: true,
      balance: walletState.balance,
      transactions: result.transactions,
    };
  } catch (error) {
    console.error('[Background] Balance refresh failed:', error);
    // Don't throw - return current balance gracefully
    return {
      success: false,
      error: error.message,
      balance: walletState.balance, // Return current balance
    };
  }
}

async function handleInscription(data) {
  try {
    const { type, payload } = data;
    
    console.log('[Background] INSCRIPTION:', { type, payload });
    
    if (!walletState.address) {
      throw new Error('Wallet is locked');
    }
    
    // Get cached private key from session
    const session = await chrome.storage.session.get(['cachedPrivateKey']);
    if (!session.cachedPrivateKey) {
      throw new Error('Wallet session expired. Please unlock wallet again.');
    }
    
    const privateKeyHex = session.cachedPrivateKey;
    const privateKey = new Uint8Array(privateKeyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    
    // Get UTXOs
    const utxos = await self.LightwalletdClient.getUtxos(walletState.address);
    if (!utxos || utxos.length === 0) {
      throw new Error('No UTXOs available');
    }
    
    // Build inscription data based on type
    let inscriptionData;
    if (type === 'zrc20-deploy') {
      // ZRC-20 Deploy: {"p":"zrc-20","op":"deploy","tick":"TOKEN","max":"21000000","lim":"1000"}
      inscriptionData = JSON.stringify({
        p: 'zrc-20',
        op: 'deploy',
        tick: payload.tick,
        max: payload.max,
        lim: payload.lim || payload.max
      });
    } else if (type === 'zrc20-mint') {
      // ZRC-20 Mint: {"p":"zrc-20","op":"mint","tick":"TOKEN","amt":"1000"}
      inscriptionData = JSON.stringify({
        p: 'zrc-20',
        op: 'mint',
        tick: payload.tick,
        amt: payload.amt
      });
    } else if (type === 'zrc20-transfer') {
      // ZRC-20 Transfer: {"p":"zrc-20","op":"transfer","tick":"TOKEN","amt":"100"}
      inscriptionData = JSON.stringify({
        p: 'zrc-20',
        op: 'transfer',
        tick: payload.tick,
        amt: payload.amt
      });
    } else if (type === 'nft-deploy') {
      // NFT Deploy: {"p":"zrc-nft","op":"deploy","name":"Collection Name","symbol":"COLL","max":"10000"}
      inscriptionData = JSON.stringify({
        p: 'zrc-nft',
        op: 'deploy',
        name: payload.name,
        symbol: payload.symbol,
        max: payload.max
      });
    } else if (type === 'nft-mint') {
      // NFT Mint: {"p":"zrc-nft","op":"mint","collection":"COLL","metadata":"..."}
      inscriptionData = JSON.stringify({
        p: 'zrc-nft',
        op: 'mint',
        collection: payload.collection,
        metadata: payload.metadata || '{}'
      });
    } else {
      throw new Error('Unknown inscription type');
    }
    
    console.log('[Background] Inscription data:', inscriptionData);
    
    // Encode inscription as bytes
    const encoder = new TextEncoder();
    const inscriptionBytes = encoder.encode(inscriptionData);
    
    // Select UTXOs (simple greedy)
    const selectedUtxos = [];
    let totalInput = 0;
    const requiredAmount = 10000; // ~0.0001 ZEC for fees
    
    for (const utxo of utxos.sort((a, b) => b.satoshis - a.satoshis)) {
      selectedUtxos.push(utxo);
      totalInput += utxo.satoshis;
      if (totalInput >= requiredAmount) break;
    }
    
    if (totalInput < requiredAmount) {
      throw new Error(`Insufficient balance for inscription. Need ${requiredAmount} zatoshis, have ${totalInput}`);
    }
    
    // Build transaction with OP_RETURN
    const tx = await self.ZcashTransaction.buildTransaction({
      utxos: selectedUtxos,
      outputs: [
        { opReturn: inscriptionBytes }
      ],
      changeAddress: walletState.address,
      feeRate: 1
    });
    
    // Sign transaction
    const signedTx = await self.ZcashTransaction.signTransaction(tx, privateKey, selectedUtxos);
    
    // Serialize transaction
    const txHex = self.ZcashTransaction.serializeTransaction(signedTx);
    
    // Broadcast transaction
    const txid = await self.LightwalletdClient.sendRawTransaction(txHex);
    
    console.log('[Background] Inscription broadcast successful! TXID:', txid);
    
    // Refresh balance
    setTimeout(() => handleRefreshBalance(), 2000);
    
    return {
      success: true,
      txid,
      type,
    };
    
  } catch (error) {
    console.error('[Background] INSCRIPTION failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to create inscription',
    };
  }
}

async function handleSendZec(data) {
  try {
    const { to, amountZec } = data;
    
    console.log('[Background] SEND_ZEC:', { to, amountZec });
    
    if (!walletState.address) {
      throw new Error('Wallet is locked');
    }
    
    if (!to || !to.startsWith('t1')) {
      throw new Error('Invalid recipient address');
    }
    
    if (!amountZec || amountZec <= 0) {
      throw new Error('Invalid amount');
    }
    
    // Get cached private key from session
    const session = await chrome.storage.session.get(['cachedPrivateKey']);
    if (!session.cachedPrivateKey) {
      throw new Error('Wallet session expired. Please unlock wallet again.');
    }
    
    const privateKeyHex = session.cachedPrivateKey;
    const privateKey = new Uint8Array(privateKeyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    
    console.log('[Background] Retrieved private key from session');
    
    // Get UTXOs for the wallet address
    console.log('[Background] Fetching UTXOs for:', walletState.address);
    const utxos = await self.LightwalletdClient.getUtxos(walletState.address);
    
    if (!utxos || utxos.length === 0) {
      throw new Error('No UTXOs available (no confirmed balance)');
    }
    
    console.log('[Background] Found', utxos.length, 'UTXOs');
    
    // Calculate amount in zatoshis
    const amountZatoshis = Math.round(amountZec * 100000000);
    
    // Select UTXOs (simple greedy selection)
    const selectedUtxos = [];
    let totalInput = 0;
    const requiredAmount = amountZatoshis + 10000; // +10k zatoshis for fee estimate
    
    for (const utxo of utxos.sort((a, b) => b.satoshis - a.satoshis)) {
      selectedUtxos.push(utxo);
      totalInput += utxo.satoshis;
      if (totalInput >= requiredAmount) break;
    }
    
    if (totalInput < requiredAmount) {
      throw new Error(`Insufficient balance. Need ${requiredAmount} zatoshis, have ${totalInput}`);
    }
    
    console.log('[Background] Selected', selectedUtxos.length, 'UTXOs, total:', totalInput, 'zatoshis');
    
    // Build transaction
    const tx = await self.ZcashTransaction.buildTransaction({
      utxos: selectedUtxos,
      outputs: [
        { address: to, amount: amountZec }
      ],
      changeAddress: walletState.address,
      feeRate: 1 // 1 zatoshi per byte
    });
    
    console.log('[Background] Transaction built:', tx);
    
    // Sign transaction
    console.log('[Background] Signing transaction...');
    const signedTx = await self.ZcashTransaction.signTransaction(tx, privateKey, selectedUtxos);
    
    // Serialize transaction
    console.log('[Background] Serializing transaction...');
    const txHex = self.ZcashTransaction.serializeTransaction(signedTx);
    
    console.log('[Background] Transaction hex:', txHex);
    
    // Broadcast transaction
    console.log('[Background] Broadcasting transaction...');
    const txid = await self.LightwalletdClient.sendRawTransaction(txHex);
    
    console.log('[Background] Transaction broadcast successful! TXID:', txid);
    
    // Refresh balance after sending
    setTimeout(() => handleRefreshBalance(), 2000);
    
    return {
      success: true,
      txid,
    };
    
  } catch (error) {
    console.error('[Background] SEND_ZEC failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to send transaction',
    };
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

self.addEventListener('install', () => {
  console.log('[Background] Extension installed!');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received message:', message);
  
  if (message.type === 'WALLET_ACTION') {
    const handler = async () => {
      try {
        let result;
        
        switch (message.action) {
          case 'GET_STATE':
            result = await handleGetState();
            break;
            
          case 'CREATE_WALLET':
            result = await handleCreateWallet(message.data);
            break;
            
          case 'UNLOCK_WALLET':
            result = await handleUnlockWallet(message.data);
            break;
            
          case 'LOCK_WALLET':
            result = await handleLockWallet();
            break;
            
          case 'IMPORT_WALLET':
            result = await handleImportWallet(message.data);
            break;
            
          case 'GET_WALLETS':
            result = await handleGetWallets();
            break;
            
          case 'SWITCH_WALLET':
            result = await handleSwitchWallet(message.data);
            break;
            
          case 'REFRESH_BALANCE':
            result = await handleRefreshBalance();
            break;
          
          case 'SEND_ZEC':
            return await handleSendZec(message.data);
      
          case 'CREATE_INSCRIPTION':
            return await handleInscription(message.data);
            
          default:
            throw new Error(`Unknown action: ${message.action}`);
        }
        
        sendResponse(result);
      } catch (error) {
        sendResponse({ 
          error: error.message || 'Unknown error occurred' 
        });
      }
    };
    
    handler();
    return true; // Keep channel open for async response
  }
  
  sendResponse({ error: 'Unknown message type' });
  return true;
});

// ============================================================================
// INITIALIZATION
// ============================================================================

initWalletState().then(() => {
  console.log('[Background] Ready!');
});
