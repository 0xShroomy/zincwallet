// Plain JavaScript - no bundling needed
'use strict';

console.log('[Background] Starting...');

// ============================================================================
// LOAD BIP39 LIBRARY, ZCASH KEYS, AND LIGHTWALLETD CLIENT
// ============================================================================

// Import BIP39 library, Zcash address derivation, lightwalletd client, and transaction builder
/* global importScripts CryptoJS */
importScripts('crypto-js.min.js'); // For RIPEMD160
importScripts('bip39.js');
importScripts('fix-zcash-keys.js'); // REAL secp256k1 implementation - MUST load before zcash-keys.js
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
    
    // Derive address from mnemonic using coin type 133 (Zcash mainnet standard)
    const coinType = 133;
    const { address, derivationPath } = await self.ZcashKeys.deriveAddress(mnemonic, 0, 0, coinType);
    
    // Create wallet object
    const walletId = 'wallet_' + Date.now();
    const wallet = {
      id: walletId,
      name: name || `Wallet ${(await getAllWallets()).wallets.length + 1}`,
      address,
      encryptedSeed,
      derivationPath,
      coinType: coinType, // Store coin type for future use
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

    console.log('[Background] Decrypting wallet:', wallet.name, 'Import method:', wallet.importMethod);
    const decrypted = await decryptMnemonic(wallet.encryptedSeed, password);

    if (!decrypted) {
      throw new Error('Failed to decrypt wallet. Wrong password?');
    }

    let address, privateKeyHex;

    // Check if wallet was imported via private key
    if (wallet.importMethod === 'privateKey') {
      console.log('[Background] Wallet imported via private key, deriving address...');
      
      // decrypted contains the private key hex, need to derive address
      const publicKey = await self.ZcashKeys.getPublicKey(new Uint8Array(decrypted.match(/.{1,2}/g).map(byte => parseInt(byte, 16))));
      
      // Hash public key
      const sha256 = await crypto.subtle.digest('SHA-256', publicKey);
      const sha256Hex = Array.from(new Uint8Array(sha256)).map(b => b.toString(16).padStart(2, '0')).join('');
      const ripemd160 = CryptoJS.RIPEMD160(CryptoJS.enc.Hex.parse(sha256Hex));
      const pubKeyHash = new Uint8Array(20);
      for (let i = 0; i < 5; i++) {
        pubKeyHash[i * 4] = (ripemd160.words[i] >>> 24) & 0xff;
        pubKeyHash[i * 4 + 1] = (ripemd160.words[i] >>> 16) & 0xff;
        pubKeyHash[i * 4 + 2] = (ripemd160.words[i] >>> 8) & 0xff;
        pubKeyHash[i * 4 + 3] = ripemd160.words[i] & 0xff;
      }
      
      // Build address
      const ZCASH_PREFIX = 0x1cb8;
      const payload = new Uint8Array(22);
      payload[0] = (ZCASH_PREFIX >> 8) & 0xff;
      payload[1] = ZCASH_PREFIX & 0xff;
      payload.set(pubKeyHash, 2);
      
      // Base58 encode
      address = await self.ZcashKeys.base58Encode(payload);
      privateKeyHex = decrypted;
      
      console.log('[Background] Address derived from private key:', address);
      
    } else {
      // Normal seed phrase unlock
      console.log('[Background] Deriving address from seed phrase...');
      
      const coinType = wallet.coinType !== undefined ? wallet.coinType : 133;
      console.log('[Background] Using coin type:', coinType);
      
      const derived = await self.ZcashKeys.deriveAddress(decrypted, 0, 0, coinType);

      if (!derived || !derived.address) {
        throw new Error('Failed to derive address');
      }

      address = derived.address;
      privateKeyHex = derived.privateKey;
      
      console.log('[Background] Address derived from mnemonic:', address);
    }

    // Update wallet state
    walletState.address = address;
    walletState.isLocked = false;
    walletState.balance = 0;

    // Cache in session storage for transaction signing
    await chrome.storage.session.set({
      walletUnlocked: true,
      walletAddress: address,
      unlockTime: Date.now(),
      activeWalletId: wallet.id,
      cachedMnemonic: wallet.importMethod === 'privateKey' ? null : decrypted,
      cachedPrivateKey: privateKeyHex,
    });

    console.log('[Background] Wallet unlocked successfully:', wallet.name);
    
    // Refresh balance
    handleRefreshBalance().catch(err => {
      console.warn('[Background] Auto-refresh balance failed:', err);
    });

    return {
      success: true,
      address: address,
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
    const { method, mnemonic, privateKey, password, name } = data;
    
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }
    
    let address, derivationPath, encryptedSeed, finalCoinType, privateKeyHex;
    
    // Handle different import methods
    if (method === 'phrase' && mnemonic) {
      // Seed phrase import
      const wordCount = mnemonic.trim().split(/\s+/).length;
      if (wordCount !== 12 && wordCount !== 24) {
        throw new Error('Invalid mnemonic - must be 12 or 24 words');
      }
      
      const seedPhrase = mnemonic.trim();
      
      // Encrypt seed
      encryptedSeed = await encrypt(seedPhrase, password);
      
      // Both Zinc and Zerdinals use coin type 133 (Zcash mainnet standard)
      // The test confirmed this is the correct path: m/44'/133'/0'/0/0
      finalCoinType = 133;
      const result = await self.ZcashKeys.deriveAddress(seedPhrase, 0, 0, finalCoinType);
      
      address = result.address;
      derivationPath = result.derivationPath;
      privateKeyHex = result.privateKey;
      
      console.log('[Background] Using Zcash derivation (coin type 133)');
      console.log('[Background] Derived address:', address);
      
    } else if (method === 'privateKey' && privateKey) {
      // Private key import
      const trimmedKey = privateKey.trim();
      
      // Import from WIF private key
      const result = await self.ZcashKeys.importFromPrivateKey(trimmedKey);
      
      address = result.address;
      privateKeyHex = result.privateKey;
      derivationPath = 'imported'; // No derivation path for private keys
      finalCoinType = null; // No coin type for private keys
      
      // Encrypt the private key for storage (we store the hex format)
      encryptedSeed = await encrypt(privateKeyHex, password);
      
      console.log('[Background] Private key imported, address:', address);
      
    } else {
      throw new Error('Invalid import data - please provide either a seed phrase or private key');
    }
    
    // Create wallet object
    const walletId = 'wallet_' + Date.now();
    const wallet = {
      id: walletId,
      name: name || `Imported Wallet ${(await getAllWallets()).wallets.length + 1}`,
      address,
      encryptedSeed,
      derivationPath,
      coinType: finalCoinType,
      importMethod: method, // Track how it was imported
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
    
    // Save session state (cache private key for signing)
    await chrome.storage.session.set({
      walletUnlocked: true,
      walletAddress: address,
      unlockTime: Date.now(),
      activeWalletId: walletId,
      cachedPrivateKey: privateKeyHex
    });
    
    console.log('[Background] Wallet imported successfully:', wallet.name);
    console.log('[Background] Address:', address);
    console.log('[Background] Import method:', method);
    
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

// Cache for API responses to prevent redundant calls
const apiCache = {
  transactions: new Map(), // address -> { data, timestamp }
  inscriptions: new Map()  // address -> { data, timestamp }
};

const CACHE_TTL = 30000; // 30 seconds
const inFlightRequests = new Map(); // Track ongoing requests

async function handleGetTransactions(data) {
  try {
    const { address } = data;
    
    if (!address) {
      throw new Error('Address is required');
    }

    // Check cache first
    const cached = apiCache.transactions.get(address);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      console.log('[Background] Returning cached transactions for:', address);
      return cached.data;
    }

    // Check if request is already in flight
    const inFlight = inFlightRequests.get(`tx_${address}`);
    if (inFlight) {
      console.log('[Background] Request already in flight, waiting...');
      return await inFlight;
    }

    console.log('[Background] Fetching transactions for:', address);

    // Create promise for in-flight tracking
    const requestPromise = (async () => {
      try {
        
        const proxyUrl = `https://vercel-proxy-loghorizon.vercel.app/api/transactions?address=${address}&limit=50`;
        
        console.log('[Background] Querying proxy:', proxyUrl);
        
        const response = await fetch(proxyUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Proxy API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch transactions');
        }
        
        console.log('[Background] ✓ Fetched', data.transactions.length, 'transactions');
        
        const result = {
          success: true,
          transactions: data.transactions
        };

        // Cache the result
        apiCache.transactions.set(address, {
          data: result,
          timestamp: Date.now()
        });

        return result;
      } catch (error) {
        console.error('[Background] Failed to fetch transactions:', error);
        
        // Return empty on error, but still cache to avoid spam
        const result = {
          success: true,
          transactions: []
        };
        
        apiCache.transactions.set(address, {
          data: result,
          timestamp: Date.now()
        });
        
        return result;
      }
    })();

    // Track in-flight request
    inFlightRequests.set(`tx_${address}`, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Clean up in-flight tracking
      inFlightRequests.delete(`tx_${address}`);
    }
  } catch (error) {
    console.error('[Background] Failed to fetch transactions:', error);
    return {
      success: false,
      error: error.message,
      transactions: []
    };
  }
}

async function handleGetInscriptions(data) {
  try {
    const { address } = data;
    
    if (!address) {
      throw new Error('Address is required');
    }

    // Check cache first
    const cached = apiCache.inscriptions.get(address);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      console.log('[Background] Returning cached inscriptions for:', address);
      return cached.data;
    }

    // Check if request is already in flight
    const inFlight = inFlightRequests.get(`inscr_${address}`);
    if (inFlight) {
      console.log('[Background] Inscription request already in flight, waiting...');
      return await inFlight;
    }

    console.log('[Background] Fetching inscriptions for:', address);

    // Create promise for in-flight tracking
    const requestPromise = (async () => {
      try {
        // Fetch via Vercel proxy (queries Supabase indexer)
        const proxyUrl = `https://vercel-proxy-loghorizon.vercel.app/api/inscriptions?address=${address}`;
        
        console.log('[Background] Querying inscriptions proxy:', proxyUrl);
        
        const response = await fetch(proxyUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Inscriptions API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch inscriptions');
        }
        
        console.log('[Background] ✓ Fetched', 
          data.zinc?.zrc20?.length || 0, 'Zinc tokens,', 
          data.zinc?.nfts?.length || 0, 'Zinc NFTs,',
          data.zerdinals?.inscriptions?.length || 0, 'Zerdinals inscriptions');
        
        // Return dual protocol data
        const result = {
          success: true,
          zinc: {
            zrc20: data.zinc?.zrc20 || [],
            nfts: data.zinc?.nfts || [],
            inscriptions: data.zinc?.inscriptions || []
          },
          zerdinals: {
            inscriptions: data.zerdinals?.inscriptions || []
          }
        };

        // Cache the result
        apiCache.inscriptions.set(address, {
          data: result,
          timestamp: Date.now()
        });

        return result;
      } catch (error) {
        console.error('[Background] Failed to fetch inscriptions:', error);
        
        // Return empty on error, but still cache to avoid spam
        const result = {
          success: true,
          zinc: {
            zrc20: [],
            nfts: []
          },
          zerdinals: {
            inscriptions: []
          }
        };
        
        apiCache.inscriptions.set(address, {
          data: result,
          timestamp: Date.now()
        });
        
        return result;
      }
    })();

    // Track in-flight request
    inFlightRequests.set(`inscr_${address}`, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Clean up in-flight tracking
      inFlightRequests.delete(`inscr_${address}`);
    }
  } catch (error) {
    console.error('[Background] Failed to fetch inscriptions:', error);
    return {
      success: false,
      error: error.message,
      zinc: { zrc20: [], nfts: [] },
      zerdinals: { inscriptions: [] }
    };
  }
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
    
    // Derive keys using stored coin type
    const coinType = wallet.coinType !== undefined ? wallet.coinType : 133;
    const { address, privateKey } = await self.ZcashKeys.deriveAddress(mnemonic, 0, 0, coinType);
    
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

async function handleRenameWallet(data) {
  try {
    const { walletId, name } = data;
    
    if (!name || !name.trim()) {
      throw new Error('Wallet name is required');
    }
    
    const { wallets } = await getAllWallets();
    const walletIndex = wallets.findIndex(w => w.id === walletId);
    
    if (walletIndex === -1) {
      throw new Error('Wallet not found');
    }
    
    // Update wallet name in the array
    wallets[walletIndex].name = name.trim();
    
    // Save updated wallets array
    await chrome.storage.local.set({ wallets });
    
    console.log('[Background] Wallet renamed to:', name);
    
    return {
      success: true,
      walletId,
      name: wallets[walletIndex].name
    };
  } catch (error) {
    console.error('[Background] Wallet rename failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function handleDeleteWallet(data) {
  try {
    const { walletId, password } = data;
    
    const { wallets, activeWalletId } = await getAllWallets();
    const wallet = wallets.find(w => w.id === walletId);
    
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    // Verify password
    const mnemonic = await decryptMnemonic(wallet.encryptedSeed, password);
    if (!mnemonic) {
      throw new Error('Invalid password');
    }
    
    const isDeletingActiveWallet = walletId === activeWalletId;
    const isLastWallet = wallets.length === 1;
    
    // If deleting the last wallet, reset everything
    if (isLastWallet) {
      console.log('[Background] Deleting last wallet - resetting to uninitialized state');
      
      // Delete all wallets
      await chrome.storage.local.remove(['wallets', 'activeWalletId']);
      
      // Clear session
      await chrome.storage.session.clear();
      
      // Reset wallet state
      walletState.isInitialized = false;
      walletState.isLocked = true;
      walletState.address = '';
      walletState.balance = 0;
      
      console.log('[Background] All wallets deleted - wallet uninitialized');
      
      return {
        success: true,
        walletId,
        lastWallet: true, // Signal to UI to redirect to welcome page
        switched: false
      };
    }
    
    // If deleting active wallet (but not last), switch to another wallet first
    if (isDeletingActiveWallet) {
      // Find first wallet that isn't the one being deleted
      const nextWallet = wallets.find(w => w.id !== walletId);
      
      if (nextWallet) {
        console.log('[Background] Auto-switching to wallet:', nextWallet.name);
        
        // Derive keys for next wallet
        const nextMnemonic = await decryptMnemonic(nextWallet.encryptedSeed, password);
        if (!nextMnemonic) {
          throw new Error('Failed to unlock next wallet. Please try again.');
        }
        
        const coinType = nextWallet.coinType !== undefined ? nextWallet.coinType : 133;
        const { address, privateKey } = await self.ZcashKeys.deriveAddress(nextMnemonic, 0, 0, coinType);
        
        // Set next wallet as active
        await setActiveWallet(nextWallet.id);
        
        // Update state
        walletState.isLocked = false;
        walletState.address = address;
        walletState.balance = 0;
        
        // Cache in session
        await chrome.storage.session.set({
          walletUnlocked: true,
          walletAddress: address,
          unlockTime: Date.now(),
          activeWalletId: nextWallet.id,
          cachedMnemonic: nextMnemonic,
          cachedPrivateKey: privateKey
        });
      }
    }
    
    // Delete wallet from wallets array
    const updatedWallets = wallets.filter(w => w.id !== walletId);
    await chrome.storage.local.set({ wallets: updatedWallets });
    
    // Verify deletion
    const { wallets: checkWallets } = await getAllWallets();
    const stillExists = checkWallets.find(w => w.id === walletId);
    if (stillExists) {
      console.error('[Background] FAILED to delete wallet from storage!');
      throw new Error('Failed to delete wallet from storage');
    }
    
    console.log('[Background] Wallet deleted:', wallet.name, 'ID:', walletId);
    console.log('[Background] Remaining wallets:', updatedWallets.length);
    
    // Refresh balance if we switched wallets
    if (isDeletingActiveWallet) {
      handleRefreshBalance().catch(err => {
        console.warn('[Background] Auto-refresh balance failed:', err);
      });
    }
    
    return {
      success: true,
      walletId,
      switched: isDeletingActiveWallet
    };
  } catch (error) {
    console.error('[Background] Wallet deletion failed:', error);
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
    const txid = await self.LightwalletdClient.broadcastTransaction(txHex);
    
    console.log('[Background] Transaction broadcast! TXID:', txid);
    
    return {
      success: true,
      txid
    };
  } catch (error) {
    console.error('[Background] Send ZEC failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

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
            
          case 'RENAME_WALLET':
            result = await handleRenameWallet(message.data);
            break;
            
          case 'DELETE_WALLET':
            result = await handleDeleteWallet(message.data);
            break;
            
          case 'REFRESH_BALANCE':
            result = await handleRefreshBalance();
            break;
          
          case 'SEND_ZEC':
            result = await handleSendZec(message.data);
            break;
      
          case 'CREATE_INSCRIPTION':
            result = await handleInscription(message.data);
            break;

          case 'GET_TRANSACTIONS':
            result = await handleGetTransactions(message.data);
            break;

          case 'GET_INSCRIPTIONS':
            result = await handleGetInscriptions(message.data);
            break;
            
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
