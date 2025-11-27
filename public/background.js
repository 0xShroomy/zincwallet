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
importScripts('blockchain-client.js');
importScripts('zcash-transaction.js');
importScripts('inscription-builder.js'); // Zinc & Zerdinals inscription support
importScripts('transaction-builder.js'); // Transaction building with inscription support
importScripts('permissions.js'); // dApp permission system

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
  network: 'mainnet' // Will be loaded from storage on init
};

// FEE CONFIGURATION
// ============================================================================

// Fee rates in zatoshis per byte
const FEE_RATES = {
  slow: 1,      // ~10-15 minutes, cheapest
  standard: 2,  // ~5-10 minutes, recommended
  fast: 5       // ~2-5 minutes, priority
};

/**
 * Calculate transaction fee based on inputs/outputs
 */
function calculateTransactionFee(inputCount, outputCount, feeRate) {
  // Zcash transaction size estimation:
  // Base: 10 bytes (version, locktime, etc.)
  // Per input: ~150 bytes (prevout, scriptsig, sequence)
  // Per output: ~34 bytes (value, scriptpubkey)
  const estimatedSize = 10 + (inputCount * 150) + (outputCount * 34);
  const feeInZatoshis = Math.ceil(estimatedSize * feeRate);
  
  console.log('[Background] Fee calculation:', {
    inputs: inputCount,
    outputs: outputCount,
    estimatedSize,
    feeRate,
    feeInZatoshis,
    feeInZEC: (feeInZatoshis / 100000000).toFixed(8)
  });
  
  return feeInZatoshis;
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
  let { wallets, activeWalletId } = await getAllWallets();
  
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
    
    // CRITICAL FIX: Reload wallets after migration
    const reloaded = await getAllWallets();
    wallets = reloaded.wallets;
    activeWalletId = reloaded.activeWalletId;
  }
  
  walletState.isInitialized = wallets.length > 0;
  
  // Load network from storage
  const stored = await chrome.storage.local.get(['network']);
  const network = stored.network || 'mainnet';
  walletState.network = network;
  
  // Set lightwalletd client to stored network
  if (typeof self.LightwalletdClient !== 'undefined') {
    self.LightwalletdClient.setNetwork(network);
    console.log('[Background] Network loaded from storage:', network.toUpperCase());
  }
  
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
    
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters. Please choose a longer password.');
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
    
    // CRITICAL: Save wallet state to local storage so UI can read it
    await chrome.storage.local.set({
      wallet_state: {
        isLocked: false,
        isInitialized: true,
        address: address,
        balance: 0,
        network: walletState.network
      }
    });
    
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
      throw new Error('Incorrect password. Please try again.');
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

    // CRITICAL: Save wallet state to local storage so UI can read it
    await chrome.storage.local.set({
      wallet_state: {
        isLocked: false,
        isInitialized: true,
        address: address,
        balance: 0,
        network: walletState.network
      }
    });

    // Cache in session storage for transaction signing
    await chrome.storage.session.set({
      walletUnlocked: true,
      walletAddress: address,
      unlockTime: Date.now(),
      activeWalletId: wallet.id,
      cachedMnemonic: wallet.importMethod === 'privateKey' ? null : decrypted,
      cachedPrivateKey: privateKeyHex,
    });
    
    // FIX: Validate and update wallet address in storage
    if (wallet.address && wallet.address !== address) {
      console.warn('[Background] ⚠️ Address mismatch detected!');
      console.warn('[Background] Stored:', wallet.address);
      console.warn('[Background] Derived:', address);
      console.warn('[Background] Using newly derived address for security');
    }
    
    if (!wallet.address || wallet.address !== address) {
      console.log('[Background] Updating wallet address in storage:', address);
      wallet.address = address;
      await saveWallet(wallet);
    }

    console.log('[Background] Wallet unlocked successfully:', wallet.name);
    
    // Refresh balance in background (don't await - UI will show skeleton loader)
    handleRefreshBalance().then(() => {
      console.log('[Background] Balance loaded successfully');
    }).catch(err => {
      console.warn('[Background] Auto-refresh balance failed:', err);
    });
    
    // Check for pending dApp request after unlock
    const { pendingDappRequest } = await chrome.storage.local.get('pendingDappRequest');
    if (pendingDappRequest) {
      console.log('[Background] Processing pending dApp request after unlock:', pendingDappRequest.type);
      
      // Process the request after a short delay to let UI update
      setTimeout(async () => {
        try {
          if (pendingDappRequest.type === 'connect' && pendingDappRequest.requestId) {
            // Trigger the connection approval flow
            const approved = await requestConnectionApproval(pendingDappRequest.origin, pendingDappRequest.metadata);
            
            const pending = pendingDappConnections.get(pendingDappRequest.requestId);
            if (pending) {
              if (approved) {
                console.log('[Background] Connection approved after unlock');
                // Grant permission
                const permission = await self.PermissionManager.grantPermission(
                  pendingDappRequest.origin,
                  walletState.address,
                  pendingDappRequest.metadata
                );
                
                // Store toast notification for dashboard
                await chrome.storage.local.set({
                  pendingToast: {
                    message: 'Wallet connected',
                    type: 'success',
                    timestamp: Date.now()
                  }
                });
                
                // Resolve the original promise
                pending.resolve({
                  address: walletState.address,
                  network: walletState.network,
                  publicKey: null,
                  connected: true,
                  permissions: permission.permissions
                });
              } else {
                // Reject the original promise
                pending.reject(new Error('User rejected connection request'));
              }
              
              pendingDappConnections.delete(pendingDappRequest.requestId);
            }
          }
          // Clear the pending request
          await chrome.storage.local.remove('pendingDappRequest');
        } catch (error) {
          console.error('[Background] Error processing pending dApp request:', error);
          // Reject any pending connection
          if (pendingDappRequest.requestId) {
            const pending = pendingDappConnections.get(pendingDappRequest.requestId);
            if (pending) {
              pending.reject(error);
              pendingDappConnections.delete(pendingDappRequest.requestId);
            }
          }
        }
      }, 500);
    }

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
  
  // CRITICAL: Save to storage so UI gets notified
  await chrome.storage.local.set({
    wallet_state: {
      isLocked: true,
      isInitialized: true,
      address: '',
      balance: 0,
      network: walletState.network
    }
  });
  
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
    
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters. Please choose a longer password.');
    }
    
    let address, derivationPath, encryptedSeed, finalCoinType, privateKeyHex;
    
    // Handle different import methods
    if (method === 'phrase' && mnemonic) {
      // Seed phrase import
      const seedPhrase = mnemonic.trim();
      const wordCount = seedPhrase.split(/\s+/).length;
      
      // VALIDATION: Check word count
      if (wordCount !== 12 && wordCount !== 24) {
        throw new Error('Invalid seed phrase. Must be exactly 12 or 24 words.');
      }
      
      // VALIDATION: Try to derive address to ensure phrase is valid
      finalCoinType = 133;
      let result;
      try {
        result = await self.ZcashKeys.deriveAddress(seedPhrase, 0, 0, finalCoinType);
        
        if (!result || !result.address) {
          throw new Error('Failed to derive address from seed phrase');
        }
        
        // Validate it's a valid Zcash address
        if (!result.address.startsWith('t1')) {
          throw new Error('Invalid Zcash address derived. Expected t-address.');
        }
        
        console.log('[Background] ✓ Seed phrase validated successfully');
      } catch (validationError) {
        console.error('[Background] Seed phrase validation failed:', validationError);
        throw new Error('Invalid seed phrase. Please check your words and try again.');
      }
      
      // Encrypt seed (only after successful validation)
      encryptedSeed = await encrypt(seedPhrase, password);
      
      address = result.address;
      derivationPath = result.derivationPath;
      privateKeyHex = result.privateKey;
      
      console.log('[Background] Using Zcash derivation (coin type 133)');
      console.log('[Background] Derived address:', address);
      
    } else if (method === 'privateKey' && privateKey) {
      // Private key import
      const trimmedKey = privateKey.trim();
      
      // VALIDATION: Check private key format before proceeding
      if (trimmedKey.length < 50 || trimmedKey.length > 52) {
        throw new Error('Invalid private key length. Expected 51-52 characters (WIF format).');
      }
      
      // VALIDATION: Try to import and validate address
      let result;
      try {
        result = await self.ZcashKeys.importFromPrivateKey(trimmedKey);
        
        if (!result || !result.address) {
          throw new Error('Failed to derive address from private key');
        }
        
        // Validate it's a valid Zcash t-address
        if (!result.address.startsWith('t1')) {
          throw new Error('Invalid Zcash address derived. Expected t-address starting with t1');
        }
        
        console.log('[Background] ✓ Private key validated successfully');
      } catch (validationError) {
        console.error('[Background] Private key validation failed:', validationError);
        throw new Error('Invalid private key format. Please check your key and try again.');
      }
      
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
    
    // CRITICAL: Save wallet state to local storage so UI can read it
    await chrome.storage.local.set({
      wallet_state: {
        isLocked: false,
        isInitialized: true,
        address: address,
        balance: 0,
        network: walletState.network
      }
    });
    
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
  // CRITICAL FIX: Always check storage to ensure accurate isInitialized state
  // This prevents race conditions where GET_STATE is called before initWalletState() completes
  const { wallets } = await getAllWallets();
  const hasWallets = wallets && wallets.length > 0;
  
  // Update isInitialized if it doesn't match storage reality
  if (hasWallets && !walletState.isInitialized) {
    console.log('[Background] GET_STATE: Correcting isInitialized from false to true');
    walletState.isInitialized = true;
  } else if (!hasWallets && walletState.isInitialized) {
    console.log('[Background] GET_STATE: Correcting isInitialized from true to false');
    walletState.isInitialized = false;
  }
  
  return { ...walletState };
}

async function handleGetNetwork() {
  try {
    // Get network from storage, default to mainnet
    const stored = await chrome.storage.local.get(['network']);
    const network = stored.network || 'mainnet';
    
    console.log('[Background] Current network:', network);
    
    return {
      success: true,
      network
    };
  } catch (error) {
    console.error('[Background] Failed to get network:', error);
    return {
      success: false,
      error: error.message,
      network: 'mainnet'
    };
  }
}

async function handleSwitchNetwork(data) {
  try {
    const { network } = data;
    
    if (network !== 'mainnet' && network !== 'testnet') {
      throw new Error('Invalid network. Must be "mainnet" or "testnet"');
    }
    
    console.log('[Background] Switching network to:', network);
    
    // Save to storage
    await chrome.storage.local.set({ network });
    
    // Update wallet state
    walletState.network = network;
    
    // Update lightwalletd client
    if (typeof self.LightwalletdClient !== 'undefined') {
      self.LightwalletdClient.setNetwork(network);
      console.log('[Background] Lightwalletd client updated to:', network);
    }
    
    console.log('[Background] Network switched successfully');
    
    // Store toast notification for dashboard
    const networkName = network.charAt(0).toUpperCase() + network.slice(1);
    await chrome.storage.local.set({
      pendingToast: {
        message: `Switched to ${networkName}`,
        type: 'success',
        timestamp: Date.now()
      }
    });
    
    // Broadcast networkChanged event to connected dApps
    await broadcastEventToTabs('networkChanged', { network });
    
    // Refresh balance on the new network if wallet is unlocked
    if (!walletState.isLocked && walletState.address) {
      console.log('[Background] Refreshing balance for new network...');
      await handleRefreshBalance();
    }
    
    return {
      success: true,
      network
    };
  } catch (error) {
    console.error('[Background] Failed to switch network:', error);
    return {
      success: false,
      error: error.message
    };
  }
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
      imported: w.imported || false,
      importMethod: w.importMethod, // Include import method for export UI
      coinType: w.coinType, // Include coin type for fallback detection
      derivationPath: w.derivationPath // Include derivation path for fallback detection
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
    const { address, limit = 50, offset = 0 } = data;
    
    if (!address) {
      throw new Error('Address is required');
    }

    // For paginated requests, skip cache
    const cacheKey = `${address}_${offset}`;
    if (offset === 0) {
      // Check cache only for first page
      const cached = apiCache.transactions.get(address);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        console.log('[Background] Using cached transactions');
        return cached.data;
      }
    }

    // Check if request is already in flight
    const inFlight = inFlightRequests.get(`tx_${cacheKey}`);
    if (inFlight) {
      console.log('[Background] Request already in flight, waiting...');
      return await inFlight;
    }

    console.log('[Background] Fetching transactions for:', address);

    // Create promise for in-flight tracking
    const requestPromise = (async () => {
      try {
        
        const proxyUrl = `https://vercel-proxy-loghorizon.vercel.app/api/transactions?address=${address}&network=${walletState.network}&limit=${limit}&offset=${offset}`;
        
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
    inFlightRequests.set(`tx_${cacheKey}`, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Clean up in-flight tracking
      inFlightRequests.delete(`tx_${cacheKey}`);
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
        const proxyUrl = `https://vercel-proxy-loghorizon.vercel.app/api/inscriptions?address=${address}&network=${walletState.network}`;
        
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

// ===========================================================================
// INSCRIPTION HANDLERS
// ===========================================================================

/**
 * Deploy ZRC-20 Token (Zinc Protocol)
 */
async function handleDeployZrc20(data) {
  try {
    const { tick, max, limit, decimals = 8, mintPrice = 0 } = data;
    
    console.log('[Background] Deploying ZRC-20:', { tick, max, limit, decimals, mintPrice });
    
    // Validate wallet is unlocked
    if (walletState.isLocked || !walletState.address) {
      throw new Error('Wallet is locked');
    }
    
    // Get UTXOs
    const utxos = await getUtxosForAddress(walletState.address);
    if (!utxos || utxos.length === 0) {
      throw new Error('No UTXOs available. Fund your wallet first.');
    }
    
    // Get private key
    const privateKey = await getPrivateKeyForAddress(walletState.address);
    
    // Build inscription
    const inscription = self.InscriptionBuilder.buildZincInscription('deployZrc20', {
      tick,
      max,
      limit,
      decimals,
      mintPrice,
      deployerAddress: walletState.address // Save deployer's address for mint payments
    });
    
    // Build transaction
    const tx = await self.TransactionBuilder.buildInscriptionTransaction({
      utxos,
      fromAddress: walletState.address,
      inscription,
      privateKey,
      network: walletState.network
    });
    
    // Broadcast
    const result = await self.TransactionBuilder.broadcastTransaction(tx.txHex, walletState.network);
    
    console.log('[Background] ZRC-20 deployed:', result.txid);
    
    return {
      success: true,
      txid: result.txid,
      protocol: 'zinc',
      type: 'deployZrc20'
    };
  } catch (error) {
    console.error('[Background] Deploy ZRC-20 failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Mint ZRC-20 Tokens (Zinc Protocol)
 * 
 * NOTE: Requires indexer to return deploy info including:
 * - mintPrice (ZEC amount)
 * - deployerAddress (recipient of mint payment)
 * 
 * Expected API response format:
 * {
 *   tick: "ZYNC",
 *   mintPrice: 0.01,
 *   deployerAddress: "t1...",
 *   ... other deploy info
 * }
 */
async function handleMintZrc20(data) {
  try {
    const { deployTxid, amount } = data;
    
    console.log('[Background] Minting ZRC-20:', { deployTxid, amount });
    
    if (walletState.isLocked || !walletState.address) {
      throw new Error('Wallet is locked');
    }
    
    const utxos = await getUtxosForAddress(walletState.address);
    if (!utxos || utxos.length === 0) {
      throw new Error('No UTXOs available');
    }
    
    const privateKey = await getPrivateKeyForAddress(walletState.address);
    
    // Fetch deploy info from indexer to get mint price and deployer address
    let mintPrice = 0;
    let mintRecipient = null;
    
    try {
      console.log('[Background] Fetching deploy info for:', deployTxid);
      const proxyUrl = `https://vercel-proxy-loghorizon.vercel.app/api/deploy-info?txid=${deployTxid}&network=${walletState.network}`;
      const response = await fetch(proxyUrl);
      
      if (response.ok) {
        const deployInfo = await response.json();
        if (deployInfo.success) {
          mintPrice = deployInfo.mintPrice || 0;
          mintRecipient = deployInfo.deployerAddress;
          console.log('[Background] Deploy info:', {
            ticker: deployInfo.ticker,
            mintPrice,
            mintRecipient
          });
        }
      } else {
        console.warn('[Background] Deploy info not found, assuming free mint');
      }
    } catch (error) {
      console.warn('[Background] Failed to fetch deploy info, assuming free mint:', error.message);
    }
    
    const inscription = self.InscriptionBuilder.buildZincInscription('mintZrc20', {
      deployTxid,
      amount,
      mintPrice,
      mintRecipient
    });
    
    const tx = await self.TransactionBuilder.buildInscriptionTransaction({
      utxos,
      fromAddress: walletState.address,
      inscription,
      privateKey,
      network: walletState.network
    });
    
    const result = await self.TransactionBuilder.broadcastTransaction(tx.txHex, walletState.network);
    
    console.log('[Background] ZRC-20 minted:', result.txid);
    
    return {
      success: true,
      txid: result.txid,
      protocol: 'zinc',
      type: 'mintZrc20'
    };
  } catch (error) {
    console.error('[Background] Mint ZRC-20 failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Transfer ZRC-20 Tokens (Zinc Protocol)
 */
async function handleTransferZrc20(data) {
  try {
    const { deployTxid, amount, to } = data;
    
    console.log('[Background] Transferring ZRC-20:', { deployTxid, amount, to });
    
    if (walletState.isLocked || !walletState.address) {
      throw new Error('Wallet is locked');
    }
    
    const utxos = await getUtxosForAddress(walletState.address);
    if (!utxos || utxos.length === 0) {
      throw new Error('No UTXOs available');
    }
    
    const privateKey = await getPrivateKeyForAddress(walletState.address);
    
    const inscription = self.InscriptionBuilder.buildZincInscription('transferZrc20', {
      deployTxid,
      amount,
      to
    });
    
    // Add transfer amount to inscription for UTXO selection
    inscription.transferAmount = 546; // dust amount to recipient
    
    const tx = await self.TransactionBuilder.buildInscriptionTransaction({
      utxos,
      fromAddress: walletState.address,
      toAddress: to,
      inscription,
      privateKey,
      network: walletState.network
    });
    
    const result = await self.TransactionBuilder.broadcastTransaction(tx.txHex, walletState.network);
    
    console.log('[Background] ZRC-20 transferred:', result.txid);
    
    return {
      success: true,
      txid: result.txid,
      protocol: 'zinc',
      type: 'transferZrc20'
    };
  } catch (error) {
    console.error('[Background] Transfer ZRC-20 failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Transfer NFT (Zerdinals Protocol)
 */
async function handleTransferNFT(data) {
  try {
    const { inscriptionTxid, to } = data;
    
    console.log('[Background] Transferring NFT:', { inscriptionTxid, to });
    
    if (walletState.isLocked || !walletState.address) {
      throw new Error('Wallet is locked');
    }
    
    const utxos = await getUtxosForAddress(walletState.address);
    if (!utxos || utxos.length === 0) {
      throw new Error('No UTXOs available');
    }
    
    const privateKey = await getPrivateKeyForAddress(walletState.address);
    
    // Build transfer inscription
    const inscription = self.InscriptionBuilder.buildZincInscription('transferNFT', {
      inscriptionTxid,
      to
    });
    
    // Add transfer amount to inscription for UTXO selection
    inscription.transferAmount = 546; // dust amount to recipient
    
    const tx = await self.TransactionBuilder.buildInscriptionTransaction({
      utxos,
      fromAddress: walletState.address,
      toAddress: to,
      inscription,
      privateKey,
      network: walletState.network
    });
    
    const result = await self.TransactionBuilder.broadcastTransaction(tx.txHex, walletState.network);
    
    console.log('[Background] NFT transferred:', result.txid);
    
    return {
      success: true,
      txid: result.txid,
      protocol: 'zerdinals',
      type: 'transferNFT'
    };
  } catch (error) {
    console.error('[Background] Transfer NFT failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Deploy NFT Collection (Zinc Protocol)
 */
async function handleDeployCollection(data) {
  try {
    const { name, metadata } = data;
    
    console.log('[Background] Deploying collection:', { name });
    
    if (walletState.isLocked || !walletState.address) {
      throw new Error('Wallet is locked');
    }
    
    const utxos = await getUtxosForAddress(walletState.address);
    if (!utxos || utxos.length === 0) {
      throw new Error('No UTXOs available');
    }
    
    const privateKey = await getPrivateKeyForAddress(walletState.address);
    
    const inscription = self.InscriptionBuilder.buildZincInscription('deployCollection', {
      name,
      metadata
    });
    
    const tx = await self.TransactionBuilder.buildInscriptionTransaction({
      utxos,
      fromAddress: walletState.address,
      inscription,
      privateKey,
      network: walletState.network
    });
    
    const result = await self.TransactionBuilder.broadcastTransaction(tx.txHex, walletState.network);
    
    console.log('[Background] Collection deployed:', result.txid);
    
    return {
      success: true,
      txid: result.txid,
      protocol: 'zinc',
      type: 'deployCollection'
    };
  } catch (error) {
    console.error('[Background] Deploy collection failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Mint NFT (Zinc Protocol)
 */
async function handleMintNft(data) {
  try {
    const { collectionTxid, contentProtocol, contentData, mimeType } = data;
    
    console.log('[Background] Minting NFT:', { collectionTxid, contentProtocol });
    
    if (walletState.isLocked || !walletState.address) {
      throw new Error('Wallet is locked');
    }
    
    const utxos = await getUtxosForAddress(walletState.address);
    if (!utxos || utxos.length === 0) {
      throw new Error('No UTXOs available');
    }
    
    const privateKey = await getPrivateKeyForAddress(walletState.address);
    
    const inscription = self.InscriptionBuilder.buildZincInscription('mintNft', {
      collectionTxid,
      contentProtocol,
      contentData,
      mimeType
    });
    
    const tx = await self.TransactionBuilder.buildInscriptionTransaction({
      utxos,
      fromAddress: walletState.address,
      inscription,
      privateKey,
      network: walletState.network
    });
    
    const result = await self.TransactionBuilder.broadcastTransaction(tx.txHex, walletState.network);
    
    console.log('[Background] NFT minted:', result.txid);
    
    return {
      success: true,
      txid: result.txid,
      protocol: 'zinc',
      type: 'mintNft'
    };
  } catch (error) {
    console.error('[Background] Mint NFT failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create Inscription (Zerdinals Protocol)
 */
async function handleInscribe(data) {
  try {
    const { contentType, content } = data;
    
    console.log('[Background] Creating Zerdinals inscription:', { contentType });
    
    if (walletState.isLocked || !walletState.address) {
      throw new Error('Wallet is locked');
    }
    
    const utxos = await getUtxosForAddress(walletState.address);
    if (!utxos || utxos.length === 0) {
      throw new Error('No UTXOs available');
    }
    
    const privateKey = await getPrivateKeyForAddress(walletState.address);
    
    const inscription = self.InscriptionBuilder.buildZerdinalsInscription({
      contentType,
      content
    });
    
    const tx = await self.TransactionBuilder.buildInscriptionTransaction({
      utxos,
      fromAddress: walletState.address,
      inscription,
      privateKey,
      network: walletState.network
    });
    
    const result = await self.TransactionBuilder.broadcastTransaction(tx.txHex, walletState.network);
    
    console.log('[Background] Zerdinals inscription created:', result.txid);
    
    return {
      success: true,
      txid: result.txid,
      protocol: 'zerdinals',
      type: 'inscribe'
    };
  } catch (error) {
    console.error('[Background] Inscribe failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Helper: Get UTXOs for address
 */
async function getUtxosForAddress(address) {
  const proxyUrl = `https://vercel-proxy-loghorizon.vercel.app/api/utxos?address=${address}&network=${walletState.network}`;
  
  console.log('[Background] Fetching UTXOs from:', proxyUrl);
  
  const response = await fetch(proxyUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch UTXOs: ${response.status}`);
  }
  
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch UTXOs');
  }
  
  return data.utxos || [];
}

/**
 * Helper: Get private key for current wallet
 */
async function getPrivateKeyForAddress(address) {
  // Check if wallet is unlocked and private key is cached in session
  const session = await chrome.storage.session.get(['cachedPrivateKey', 'walletUnlocked', 'walletAddress']);
  
  if (!session.walletUnlocked) {
    throw new Error('Wallet is locked. Please unlock first.');
  }
  
  if (!session.cachedPrivateKey) {
    throw new Error('Private key not available in session. Please unlock wallet again.');
  }
  
  // Verify the address matches (security check)
  if (session.walletAddress !== address) {
    throw new Error('Address mismatch. Session corrupted?');
  }
  
  console.log('[Background] Retrieved private key from session cache');
  
  // Return as Uint8Array
  const privateKeyBytes = new Uint8Array(
    session.cachedPrivateKey.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
  );
  
  return privateKeyBytes;
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
    const decrypted = await decryptMnemonic(wallet.encryptedSeed, password);
    if (!decrypted) {
      throw new Error('Invalid password');
    }
    
    let address, privateKey;
    
    // CRITICAL FIX: Handle private key imports differently
    if (wallet.importMethod === 'privateKey') {
      console.log('[Background] Switching to private key wallet:', wallet.name);
      
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
      privateKey = decrypted;
      
      console.log('[Background] Address derived from private key:', address);
    } else {
      // Normal seed phrase wallet
      console.log('[Background] Switching to mnemonic wallet:', wallet.name);
      
      // Derive keys using stored coin type
      const coinType = wallet.coinType !== undefined ? wallet.coinType : 133;
      const derived = await self.ZcashKeys.deriveAddress(decrypted, 0, 0, coinType);
      
      address = derived.address;
      privateKey = derived.privateKey;
      
      console.log('[Background] Address derived from mnemonic:', address);
    }
    
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
      cachedMnemonic: wallet.importMethod === 'privateKey' ? null : decrypted,
      cachedPrivateKey: privateKey
    });
    
    // FIX: Validate and update wallet address in storage
    if (wallet.address && wallet.address !== address) {
      console.warn('[Background] ⚠️ Address mismatch detected during switch!');
      console.warn('[Background] Stored:', wallet.address);
      console.warn('[Background] Derived:', address);
      console.warn('[Background] Using newly derived address for security');
    }
    
    if (!wallet.address || wallet.address !== address) {
      console.log('[Background] Updating wallet address in storage:', address);
      wallet.address = address;
      await saveWallet(wallet);
    }
    
    console.log('[Background] Switched to wallet:', wallet.name);
    
    // Broadcast accountsChanged event to connected dApps
    await broadcastEventToTabs('accountsChanged', { address });
    
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

async function handleExportWallet(data) {
  try {
    const { walletId, password, exportType } = data; // exportType: 'seedPhrase' | 'privateKey'
    
    const { wallets } = await getAllWallets();
    const wallet = wallets.find(w => w.id === walletId);
    
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    // Verify password by decrypting
    const decrypted = await decryptMnemonic(wallet.encryptedSeed, password);
    if (!decrypted) {
      throw new Error('Invalid password');
    }
    
    let mnemonic = null;
    let privateKey = null;
    
    // Check if wallet was imported via private key
    if (wallet.importMethod === 'privateKey') {
      // decrypted IS the private key (hex format)
      if (exportType === 'privateKey') {
        privateKey = decrypted;
      } else {
        // Cannot export seed phrase from private key wallet
        throw new Error('This wallet was imported using a private key. Seed phrase is not available.');
      }
    } else {
      // Wallet was created from mnemonic
      if (exportType === 'seedPhrase') {
        mnemonic = decrypted;
      } else if (exportType === 'privateKey') {
        // Derive private key from mnemonic
        const coinType = wallet.coinType !== undefined ? wallet.coinType : 133;
        const derived = await self.ZcashKeys.deriveAddress(decrypted, 0, 0, coinType);
        privateKey = derived.privateKey;
      }
    }
    
    console.log('[Background] Wallet exported:', wallet.name, 'Type:', exportType);
    
    return {
      success: true,
      mnemonic,
      privateKey,
      walletImportMethod: wallet.importMethod || 'phrase' // Tell UI how wallet was created
    };
  } catch (error) {
    console.error('[Background] Wallet export failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function handleRefreshBalance() {
  try {
    // CRITICAL: Restore wallet state from storage if in-memory state is empty
    // (Background scripts restart frequently, resetting in-memory variables)
    if (!walletState.address) {
      console.log('[Background] Address not in memory, checking storage...');
      const stored = await chrome.storage.local.get('wallet_state');
      if (stored.wallet_state && stored.wallet_state.address && !stored.wallet_state.isLocked) {
        // Restore from storage
        Object.assign(walletState, stored.wallet_state);
        console.log('[Background] Restored wallet state from storage:', walletState.address);
      } else {
        throw new Error('No address available');
      }
    }
    
    console.log('[Background] Refreshing balance for:', walletState.address);
    
    // Query lightwalletd for real balance
    const result = await self.LightwalletdClient.getBalance(walletState.address);
    
    // Update wallet state with real balance
    walletState.balance = result.balance;
    
    // IMPORTANT: Save to storage so UI gets notified of balance change
    await chrome.storage.local.set({ 
      wallet_state: {  // Use wallet_state (with underscore) to match what UI listens for
        ...walletState 
      } 
    });
    
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
      throw new Error('Your wallet is locked. Please unlock it first.');
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
    if (type === 'zrc20-deploy' || type === 'zerdinals-zrc20-deploy') {
      // ZRC-20 Deploy: {"p":"zrc-20","op":"deploy","tick":"TOKEN","max":"21000000","lim":"1000"}
      inscriptionData = JSON.stringify({
        p: 'zrc-20',
        op: 'deploy',
        tick: payload.tick,
        max: payload.max,
        lim: payload.lim || payload.max
      });
    } else if (type === 'zrc20-mint' || type === 'zerdinals-zrc20-mint') {
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
    } else if (type === 'zerdinals-text') {
      // Plain text inscription
      inscriptionData = payload.text || '';
    } else if (type === 'zerdinals-json') {
      // JSON inscription
      inscriptionData = payload.json || '{}';
    } else if (type === 'zerdinals-image') {
      // Image inscription (base64)
      inscriptionData = payload.imageData || '';
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
    
    // Store success notification
    await chrome.storage.local.set({
      pendingToast: {
        message: 'Transaction successful',
        type: 'success',
        timestamp: Date.now()
      }
    });
    
    // Refresh balance
    setTimeout(() => handleRefreshBalance(), 2000);
    
    return {
      success: true,
      txid,
      type,
    };
    
  } catch (error) {
    // Store error notification
    await chrome.storage.local.set({
      pendingToast: {
        message: 'Transaction failed',
        type: 'error',
        timestamp: Date.now()
      }
    });
    console.error('[Background] INSCRIPTION failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to create inscription',
    };
  }
}

/**
 * Estimate transaction fees for different speed options
 */
async function handleEstimateFee(data) {
  try {
    const { to, amountZec } = data;
    
    if (!walletState.address) {
      throw new Error('Your wallet is locked. Please unlock it first.');
    }
    
    // Get UTXOs to calculate input count
    const utxos = await self.LightwalletdClient.getUtxos(walletState.address);
    
    if (!utxos || utxos.length === 0) {
      throw new Error('No UTXOs available');
    }
    
    // Calculate how many inputs needed for this amount
    const amountZatoshis = Math.round(amountZec * 100000000);
    let inputCount = 0;
    let totalInput = utxos.reduce((sum, utxo) => sum + BigInt(utxo.value || utxo.satoshis || 0), 0n);
    
    for (const utxo of utxos.sort((a, b) => (b.satoshis || b.value) - (a.satoshis || a.value))) {
      inputCount++;
      // Estimate fee for this many inputs
      const estimatedFee = calculateTransactionFee(inputCount, 2, FEE_RATES.standard);
      if (totalInput >= amountZatoshis + BigInt(estimatedFee)) break;
    }
    
    // Output count: 1 for recipient + 1 for change
    const outputCount = 2;
    
    // Calculate fees for all speed options
    const fees = {
      slow: {
        rate: FEE_RATES.slow,
        zatoshis: calculateTransactionFee(inputCount, outputCount, FEE_RATES.slow),
        estimatedTime: '10-15 minutes'
      },
      standard: {
        rate: FEE_RATES.standard,
        zatoshis: calculateTransactionFee(inputCount, outputCount, FEE_RATES.standard),
        estimatedTime: '5-10 minutes'
      },
      fast: {
        rate: FEE_RATES.fast,
        zatoshis: calculateTransactionFee(inputCount, outputCount, FEE_RATES.fast),
        estimatedTime: '2-5 minutes'
      }
    };
    
    console.log('[Background] Fee estimates:', fees);
    
    return {
      success: true,
      fees,
      inputCount,
      outputCount
    };
  } catch (error) {
    console.error('[Background] Fee estimation failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function handleSendZec(data) {
  try {
    const { to, amountZec, feeRate } = data;
    
    console.log('[Background] SEND_ZEC:', { to, amountZec });
    
    if (!walletState.address) {
      throw new Error('Your wallet is locked. Please unlock it first.');
    }
    
    if (!to || !to.startsWith('t1')) {
      throw new Error('Invalid recipient address. Zcash addresses start with "t1".');
    }
    
    if (!amountZec || amountZec <= 0) {
      throw new Error('Please enter a valid amount greater than zero.');
    }
    
    // Get cached private key from session
    const session = await chrome.storage.session.get(['cachedPrivateKey']);
    if (!session.cachedPrivateKey) {
      throw new Error('Your session has expired. Please unlock your wallet again.');
    }
    
    const privateKeyHex = session.cachedPrivateKey;
    const privateKey = new Uint8Array(privateKeyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    
    console.log('[Background] Retrieved private key from session');
    
    // Get UTXOs for the wallet address
    console.log('[Background] Fetching UTXOs for:', walletState.address);
    const utxos = await self.LightwalletdClient.getUtxos(walletState.address);
    
    if (!utxos || utxos.length === 0) {
      throw new Error('No confirmed balance available. Please wait for your funds to be confirmed.');
    }
    
    console.log('[Background] Found', utxos.length, 'UTXOs');
    
    // Calculate amount in zatoshis
    const amountZatoshis = Math.round(amountZec * 100000000);
    
    // Select UTXOs (simple greedy selection)
    const selectedUtxos = [];
    let totalInput = 0;
    const requiredAmount = amountZatoshis + 10000; // +10k zatoshis for fee estimate
    
    for (const utxo of utxos.sort((a, b) => (b.value || b.satoshis || 0) - (a.value || a.satoshis || 0))) {
      selectedUtxos.push(utxo);
      totalInput += (utxo.value || utxo.satoshis || 0);
      if (totalInput >= requiredAmount) break;
    }
    
    if (totalInput < requiredAmount) {
      const needed = (requiredAmount / 100000000).toFixed(8);
      const available = (totalInput / 100000000).toFixed(8);
      throw new Error(`Insufficient balance. You need ${needed} ZEC but only have ${available} ZEC available.`);
    }
    
    console.log('[Background] Selected', selectedUtxos.length, 'UTXOs, total:', totalInput, 'zatoshis');
    
    // Use provided feeRate or default to standard
    const selectedFeeRate = feeRate || FEE_RATES.standard;
    console.log('[Background] Using fee rate:', selectedFeeRate, 'zatoshis/byte');
    
    // Build transaction
    const tx = await self.ZcashTransaction.buildTransaction({
      utxos: selectedUtxos,
      outputs: [
        { address: to, amount: amountZec }
      ],
      changeAddress: walletState.address,
      feeRate: selectedFeeRate
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
    
    // Store success notification
    await chrome.storage.local.set({
      pendingToast: {
        message: 'Transaction successful',
        type: 'success',
        timestamp: Date.now()
      }
    });
    
    return {
      success: true,
      txid
    };
  } catch (error) {
    console.error('[Background] Send ZEC failed:', error);
    
    // Store error notification
    await chrome.storage.local.set({
      pendingToast: {
        message: 'Transaction failed',
        type: 'error',
        timestamp: Date.now()
      }
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// DAPP EVENT BROADCASTING
// ============================================================================

/**
 * Broadcast event to all tabs with connected dApps
 */
async function broadcastEventToTabs(eventName, eventData) {
  try {
    const tabs = await chrome.tabs.query({});
    const permissions = await chrome.storage.local.get('dapp_permissions');
    const dappPermissions = permissions.dapp_permissions || {};
    
    // Get all connected origins
    const connectedOrigins = Object.keys(dappPermissions).filter(
      origin => dappPermissions[origin].granted
    );
    
    // Send event to tabs matching connected origins
    for (const tab of tabs) {
      if (tab.url && connectedOrigins.some(origin => tab.url.startsWith(origin))) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'DAPP_EVENT',
          event: eventName,
          data: eventData
        }).catch(() => {
          // Tab may not have content script, ignore error
        });
      }
    }
  } catch (error) {
    console.error('[Background] Failed to broadcast event:', error);
  }
}

// ============================================================================
// DAPP REQUEST HANDLERS
// ============================================================================

/**
 * Handle dApp connection request
 */
async function handleDappConnect(origin, metadata) {
  console.log('[dApp] Connect request from:', origin);
  
  // Check if wallet is unlocked - if not, wait for unlock and approval
  if (walletState.isLocked || !walletState.address) {
    console.log('[dApp] Wallet is locked, will wait for unlock and approval...');
    
    // Create unique request ID
    const requestId = `connect_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Store the pending connection request with promise resolvers
    const connectionPromise = new Promise((resolve, reject) => {
      pendingDappConnections.set(requestId, { resolve, reject, origin, metadata });
      
      // Timeout after 5 minutes
      setTimeout(() => {
        if (pendingDappConnections.has(requestId)) {
          pendingDappConnections.delete(requestId);
          reject(new Error('Connection request timeout'));
        }
      }, 300000);
    });
    
    // Store request ID in storage for unlock handler
    await chrome.storage.local.set({
      pendingDappRequest: {
        type: 'connect',
        requestId,
        origin,
        metadata,
        timestamp: Date.now()
      }
    });
    
    // Open extension popup to unlock
    try {
      await chrome.action.openPopup();
    } catch (error) {
      console.warn('[dApp] Could not open popup automatically:', error);
    }
    
    // Wait for unlock and approval to complete
    return connectionPromise;
  }
  
  // Check if already connected
  if (await self.PermissionManager.hasPermission(origin, 'connect')) {
    const permission = await self.PermissionManager.getPermission(origin);
    console.log('[dApp] Already connected:', origin);
    
    // Include public key if wallet is unlocked
    const publicKey = await getPublicKeyHex();
    
    return {
      address: walletState.address,
      network: walletState.network,
      publicKey: publicKey,
      connected: true,
      permissions: permission.permissions
    };
  }
  
  // Request user approval
  const approved = await requestConnectionApproval(origin, metadata);
  
  if (!approved) {
    throw new Error('User rejected connection request');
  }
  
  // Grant permission
  await self.PermissionManager.grantPermission(origin, walletState.address, metadata);
  
  console.log('[dApp] Connection granted:', origin);
  
  // Store toast notification for dashboard
  await chrome.storage.local.set({
    pendingToast: {
      message: 'Wallet connected',
      type: 'success',
      timestamp: Date.now()
    }
  });
  
  // Include public key in connection response
  const publicKey = await getPublicKeyHex();
  
  return {
    address: walletState.address,
    network: walletState.network,
    publicKey: publicKey,
    connected: true
  };
}

/**
 * Handle dApp disconnection request
 */
async function handleDappDisconnect(origin) {
  console.log('[dApp] Disconnect request from:', origin);
  
  await self.PermissionManager.revokePermission(origin);
  
  // Store toast notification for dashboard
  await chrome.storage.local.set({
    pendingToast: {
      message: 'Wallet disconnected',
      type: 'error',
      timestamp: Date.now()
    }
  });
  
  // Broadcast disconnect event to connected dApps
  await broadcastEventToTabs('disconnect', {});
  
  return { disconnected: true };
}

/**
 * Handle sign message request
 */
async function handleDappSignMessage(origin, params) {
  const hasPermission = await self.PermissionManager.hasPermission(origin, 'connect');
  
  if (!hasPermission) {
    throw new Error('Permission denied. Call connect() first.');
  }
  
  if (!walletState.address) {
    throw new Error('Wallet is locked');
  }
  
  const { message } = params;
  
  if (!message) {
    throw new Error('Message is required');
  }
  
  // Request user approval for signing
  const approved = await requestSignatureApproval(origin, message);
  
  if (!approved) {
    throw new Error('User rejected signature request');
  }
  
  // Get private key from session
  const session = await chrome.storage.session.get(['cachedPrivateKey']);
  if (!session.cachedPrivateKey) {
    throw new Error('Private key not available. Please unlock wallet.');
  }
  
  // Sign the message
  const signature = await self.ZcashKeys.signMessage(message, session.cachedPrivateKey);
  
  return {
    signature,
    address: walletState.address,
    message
  };
}

/**
 * Request signature approval from user
 */
async function requestSignatureApproval(origin, message) {
  return new Promise((resolve) => {
    const approvalId = `signature_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Store pending approval
    const metadata = { title: origin, url: origin };
    
    pendingApprovals.set(approvalId, { resolve, origin, metadata });
    
    // Store in local storage for popup to access
    chrome.storage.local.set({
      pendingApproval: {
        id: approvalId,
        type: 'signature',
        origin,
        metadata,
        message,
        timestamp: Date.now()
      }
    });
    
    // Set badge to notify user
    chrome.action.setBadgeText({ text: '1' });
    chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
    
    // Try to open popup automatically (works when triggered by user action in dApp)
    try {
      chrome.action.openPopup();
    } catch (error) {
      console.warn('[dApp] Could not open popup, user may need to click extension');
    }
    
    console.log('[dApp] Signature approval requested:', origin, approvalId);
  });
}

/**
 * Handle get address request
 */
async function handleDappGetAddress(origin) {
  const hasPermission = await self.PermissionManager.hasPermission(origin, 'getAddress');
  
  if (!hasPermission) {
    throw new Error('Permission denied. Call connect() first.');
  }
  
  if (walletState.isLocked || !walletState.address) {
    throw new Error('Wallet is locked');
  }
  
  return { address: walletState.address };
}

/**
 * Get public key from cached private key
 */
async function getPublicKeyHex() {
  try {
    // Get cached private key from session
    const session = await chrome.storage.session.get(['cachedPrivateKey']);
    const privateKeyHex = session.cachedPrivateKey;
    
    if (!privateKeyHex) {
      return null;
    }
    
    // Derive public key from private key using secp256k1
    const privateKeyBytes = new Uint8Array(privateKeyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const publicKey = await self.ZcashKeys.getPublicKey(privateKeyBytes);
    
    // Convert to hex string
    const publicKeyHex = Array.from(publicKey).map(b => b.toString(16).padStart(2, '0')).join('');
    
    return publicKeyHex;
  } catch (error) {
    console.error('[Background] Failed to derive public key:', error);
    return null;
  }
}

/**
 * Handle get public key request
 */
async function handleDappGetPublicKey(origin) {
  const hasPermission = await self.PermissionManager.hasPermission(origin, 'getPublicKey');
  
  if (!hasPermission) {
    throw new Error('Permission denied. Call connect() first.');
  }
  
  if (walletState.isLocked || !walletState.address) {
    throw new Error('Wallet is locked');
  }
  
  const publicKeyHex = await getPublicKeyHex();
  
  if (!publicKeyHex) {
    throw new Error('Failed to derive public key');
  }
  
  console.log('[Background] Public key provided to dApp:', origin);
  
  return { 
    publicKey: publicKeyHex
  };
}

/**
 * Handle get network request
 */
async function handleDappGetNetwork(origin) {
  const hasPermission = await self.PermissionManager.hasPermission(origin, 'getNetwork');
  
  if (!hasPermission) {
    throw new Error('Permission denied. Call connect() first.');
  }
  
  return { network: walletState.network };
}

/**
 * Handle get balance request
 */
async function handleDappGetBalance(origin) {
  const hasPermission = await self.PermissionManager.hasPermission(origin, 'getBalance');
  
  if (!hasPermission) {
    throw new Error('Permission denied. Call connect() first.');
  }
  
  if (walletState.isLocked || !walletState.address) {
    throw new Error('Wallet is locked');
  }
  
  return {
    balance: walletState.balance,
    balanceZec: (walletState.balance / 100000000).toFixed(8)
  };
}

/**
 * Handle send ZEC request from dApp
 */
async function handleDappSendZec(origin, params) {
  const isConnected = await self.PermissionManager.isConnected(origin);
  
  if (!isConnected) {
    throw new Error('Not connected. Call connect() first.');
  }
  
  if (walletState.isLocked || !walletState.address) {
    throw new Error('Wallet is locked');
  }
  
  // Request user approval for transaction
  const approved = await requestTransactionApproval(origin, {
    type: 'sendZec',
    params
  });
  
  if (!approved) {
    throw new Error('User rejected transaction');
  }
  
  // Use existing handleSendZec
  return await handleSendZec(params);
}

/**
 * Handle deploy ZRC-20 request from dApp
 */
async function handleDappDeployZrc20(origin, params) {
  const isConnected = await self.PermissionManager.isConnected(origin);
  
  if (!isConnected) {
    throw new Error('Not connected. Call connect() first.');
  }
  
  if (walletState.isLocked || !walletState.address) {
    throw new Error('Wallet is locked');
  }
  
  // Request user approval
  const approved = await requestTransactionApproval(origin, {
    type: 'deployZrc20',
    params
  });
  
  if (!approved) {
    throw new Error('User rejected transaction');
  }
  
  // Use existing handleDeployZrc20
  return await handleDeployZrc20(params);
}

/**
 * Handle mint ZRC-20 request from dApp
 */
async function handleDappMintZrc20(origin, params) {
  const isConnected = await self.PermissionManager.isConnected(origin);
  
  if (!isConnected) {
    throw new Error('Not connected. Call connect() first.');
  }
  
  if (walletState.isLocked || !walletState.address) {
    throw new Error('Wallet is locked');
  }
  
  // Request user approval
  const approved = await requestTransactionApproval(origin, {
    type: 'mintZrc20',
    params
  });
  
  if (!approved) {
    throw new Error('User rejected transaction');
  }
  
  return await handleMintZrc20(params);
}

/**
 * Handle transfer ZRC-20 request from dApp
 */
async function handleDappTransferZrc20(origin, params) {
  const isConnected = await self.PermissionManager.isConnected(origin);
  
  if (!isConnected) {
    throw new Error('Not connected. Call connect() first.');
  }
  
  if (walletState.isLocked || !walletState.address) {
    throw new Error('Wallet is locked');
  }
  
  // Request user approval
  const approved = await requestTransactionApproval(origin, {
    type: 'transferZrc20',
    params
  });
  
  if (!approved) {
    throw new Error('User rejected transaction');
  }
  
  return await handleTransferZrc20(params);
}

/**
 * Handle deploy collection request from dApp
 */
async function handleDappDeployCollection(origin, params) {
  const isConnected = await self.PermissionManager.isConnected(origin);
  
  if (!isConnected) {
    throw new Error('Not connected. Call connect() first.');
  }
  
  if (walletState.isLocked || !walletState.address) {
    throw new Error('Wallet is locked');
  }
  
  // Request user approval
  const approved = await requestTransactionApproval(origin, {
    type: 'deployCollection',
    params
  });
  
  if (!approved) {
    throw new Error('User rejected transaction');
  }
  
  return await handleDeployCollection(params);
}

/**
 * Handle mint NFT request from dApp
 */
async function handleDappMintNft(origin, params) {
  const isConnected = await self.PermissionManager.isConnected(origin);
  
  if (!isConnected) {
    throw new Error('Not connected. Call connect() first.');
  }
  
  if (walletState.isLocked || !walletState.address) {
    throw new Error('Wallet is locked');
  }
  
  // Request user approval
  const approved = await requestTransactionApproval(origin, {
    type: 'mintNft',
    params
  });
  
  if (!approved) {
    throw new Error('User rejected transaction');
  }
  
  return await handleMintNft(params);
}

/**
 * Handle inscribe request from dApp (Zerdinals)
 */
async function handleDappInscribe(origin, params) {
  const isConnected = await self.PermissionManager.isConnected(origin);
  
  if (!isConnected) {
    throw new Error('Not connected. Call connect() first.');
  }
  
  if (walletState.isLocked || !walletState.address) {
    throw new Error('Wallet is locked');
  }
  
  // Request user approval
  const approved = await requestTransactionApproval(origin, {
    type: 'inscribe',
    params
  });
  
  if (!approved) {
    throw new Error('User rejected transaction');
  }
  
  return await handleInscribe(params);
}

// Pending approval requests
const pendingApprovals = new Map();

// Pending dApp connection requests (waiting for unlock)
const pendingDappConnections = new Map();

/**
 * Request connection approval from user
 * Opens extension popup and waits for user decision
 */
async function requestConnectionApproval(origin, metadata) {
  const approvalId = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log('[dApp] Requesting connection approval:', origin, approvalId);
  
  // Store approval request
  await chrome.storage.local.set({
    pendingApproval: {
      id: approvalId,
      type: 'connect',
      origin,
      metadata,
      timestamp: Date.now()
    }
  });
  
  // Show badge notification
  chrome.action.setBadgeText({ text: '1' });
  chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' }); // Amber
  
  // Open extension popup (not separate window)
  try {
    await chrome.action.openPopup();
  } catch (error) {
    console.warn('[dApp] Could not open popup, user may need to click extension');
  }
  
  // Wait for user decision
  return new Promise((resolve) => {
    pendingApprovals.set(approvalId, { resolve });
    
    // Timeout after 2 minutes
    setTimeout(() => {
      if (pendingApprovals.has(approvalId)) {
        pendingApprovals.delete(approvalId);
        chrome.storage.local.remove('pendingApproval');
        resolve(false); // Reject on timeout
      }
    }, 120000);
  });
}

/**
 * Request transaction approval from user
 * Opens extension popup and waits for user decision
 */
async function requestTransactionApproval(origin, transaction) {
  const approvalId = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log('[dApp] Requesting transaction approval:', origin, transaction.type, approvalId);
  
  // Get site metadata from permissions
  const permission = await self.PermissionManager.getPermission(origin);
  const metadata = permission ? permission.metadata : { title: origin, favicon: '', url: origin };
  
  // Store approval request
  await chrome.storage.local.set({
    pendingApproval: {
      id: approvalId,
      type: 'transaction',
      origin,
      metadata,
      transaction,
      timestamp: Date.now()
    }
  });
  
  // Show badge notification
  chrome.action.setBadgeText({ text: '1' });
  chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' }); // Amber
  
  // Open extension popup (not separate window)
  try {
    await chrome.action.openPopup();
  } catch (error) {
    console.warn('[dApp] Could not open popup, user may need to click extension');
  }
  
  // Wait for user decision
  return new Promise((resolve) => {
    pendingApprovals.set(approvalId, { resolve });
    
    // Timeout after 2 minutes
    setTimeout(() => {
      if (pendingApprovals.has(approvalId)) {
        pendingApprovals.delete(approvalId);
        chrome.storage.local.remove('pendingApproval');
        resolve(false); // Reject on timeout
      }
    }, 120000);
  });
}

/**
 * Handle approval response from popup
 */
async function handleApprovalResponse(data) {
  const { id, approved } = data;
  
  console.log('[dApp] Approval response:', id, approved);
  
  const pending = pendingApprovals.get(id);
  if (pending) {
    pending.resolve(approved);
    pendingApprovals.delete(id);
    
    // Clear badge when approval is handled
    chrome.action.setBadgeText({ text: '' });
  }
  
  // Clean up storage
  await chrome.storage.local.remove('pendingApproval');
  
  return { success: true };
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
            
          case 'EXPORT_WALLET':
            result = await handleExportWallet(message.data);
            break;
            
          case 'REFRESH_BALANCE':
            result = await handleRefreshBalance();
            break;
          
          case 'ESTIMATE_FEE':
            result = await handleEstimateFee(message.data);
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

          case 'GET_NETWORK':
            result = await handleGetNetwork();
            break;

          case 'SWITCH_NETWORK':
            result = await handleSwitchNetwork(message.data);
            break;
          
          case 'DEPLOY_ZRC20':
            result = await handleDeployZrc20(message.data);
            break;
          
          case 'MINT_ZRC20':
            result = await handleMintZrc20(message.data);
            break;
          
          case 'TRANSFER_ZRC20':
            result = await handleTransferZrc20(message.data);
            break;
          
          case 'TRANSFER_NFT':
            result = await handleTransferNFT(message.data);
            break;
          
          case 'DEPLOY_COLLECTION':
            result = await handleDeployCollection(message.data);
            break;
          
          case 'MINT_NFT':
            result = await handleMintNft(message.data);
            break;
          
          case 'INSCRIBE':
            result = await handleInscribe(message.data);
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
  
  // Handle dApp requests from content script
  if (message.type === 'DAPP_REQUEST') {
    const handler = async () => {
      try {
        const { method, params, origin, url, favicon, title } = message.data;
        
        console.log('[Background] dApp request:', { method, origin });
        
        // Route to appropriate handler
        let result;
        
        switch (method) {
          case 'connect':
            result = await handleDappConnect(origin, { url, favicon, title });
            break;
          
          case 'disconnect':
            result = await handleDappDisconnect(origin);
            break;
          
          case 'getAddress':
            result = await handleDappGetAddress(origin);
            break;
          
          case 'getPublicKey':
            result = await handleDappGetPublicKey(origin);
            break;
          
          case 'getNetwork':
            result = await handleDappGetNetwork(origin);
            break;
          
          case 'getBalance':
            result = await handleDappGetBalance(origin);
            break;
          
          case 'sendZec':
            result = await handleDappSendZec(origin, params);
            break;
          
          case 'deployZrc20':
            result = await handleDappDeployZrc20(origin, params);
            break;
          
          case 'mintZrc20':
            result = await handleDappMintZrc20(origin, params);
            break;
          
          case 'transferZrc20':
            result = await handleDappTransferZrc20(origin, params);
            break;
          
          case 'deployCollection':
            result = await handleDappDeployCollection(origin, params);
            break;
          
          case 'mintNft':
            result = await handleDappMintNft(origin, params);
            break;
          
          case 'inscribe':
            result = await handleDappInscribe(origin, params);
            break;
          
          case 'signMessage':
            result = await handleDappSignMessage(origin, params);
            break;
          
          default:
            throw new Error(`Unknown dApp method: ${method}`);
        }
        
        sendResponse({ success: true, data: result });
      } catch (error) {
        console.error('[Background] dApp request error:', error);
        sendResponse({ success: false, error: error.message || 'Request failed' });
      }
    };
    
    handler();
    return true; // Keep channel open for async response
  }
  
  // Handle approval response from popup
  if (message.type === 'APPROVAL_RESPONSE') {
    const handler = async () => {
      try {
        const result = await handleApprovalResponse(message.data);
        sendResponse(result);
      } catch (error) {
        console.error('[Background] Approval response error:', error);
        sendResponse({ success: false, error: error.message });
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
