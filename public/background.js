// Plain JavaScript - no bundling needed
'use strict';

console.log('[Background] Starting...');

// ============================================================================
// LOAD BIP39 LIBRARY, ZCASH KEYS, AND LIGHTWALLETD CLIENT
// ============================================================================

// Import BIP39 library, Zcash address derivation, and lightwalletd client
/* global importScripts */
importScripts('bip39.js');
importScripts('zcash-keys.js');
importScripts('lightwalletd-client.js');

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
 * Decrypt data using AES-GCM
 */
async function decrypt(encryptedBase64, password) {
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

/**
 * Initialize wallet state from storage
 */
async function initWalletState() {
  const stored = await chrome.storage.local.get(['encryptedSeed']);
  walletState.isInitialized = !!stored.encryptedSeed;
  
  // Check if wallet was previously unlocked (within session)
  const session = await chrome.storage.session.get(['walletUnlocked', 'walletAddress', 'unlockTime']);
  
  if (session.walletUnlocked && session.walletAddress) {
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
      await chrome.storage.session.remove(['walletUnlocked', 'walletAddress', 'unlockTime']);
      console.log('[Background] Wallet session expired');
    }
  }
  
  console.log('[Background] Wallet initialized:', walletState.isInitialized);
}

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

async function handleCreateWallet(data) {
  try {
    const { password } = data;
    
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }
    
    // Generate mnemonic
    const mnemonic = await generateMnemonic();
    
    // Encrypt and store
    const encryptedSeed = await encrypt(mnemonic, password);
    await chrome.storage.local.set({ encryptedSeed });
    
    // Derive address from mnemonic
    const { address, derivationPath } = await self.ZcashKeys.deriveAddress(mnemonic, 0, 0);
    
    // Update state
    walletState.isInitialized = true;
    walletState.isLocked = false;
    walletState.address = address;
    
    // Save session state
    await chrome.storage.session.set({
      walletUnlocked: true,
      walletAddress: address,
      unlockTime: Date.now()
    });
    
    console.log('[Background] Wallet created successfully');
    console.log('[Background] Address:', address);
    console.log('[Background] Derivation path:', derivationPath);
    
    // Auto-refresh balance after creation
    handleRefreshBalance().catch(err => {
      console.warn('[Background] Auto-refresh balance failed:', err);
    });
    
    return {
      success: true,
      mnemonic: mnemonic,
      address: address
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
    
    // Get encrypted seed from storage
    const stored = await chrome.storage.local.get(['encryptedSeed']);
    if (!stored.encryptedSeed) {
      throw new Error('No wallet found');
    }
    
    // Decrypt seed
    const mnemonic = await decrypt(stored.encryptedSeed, password);
    
    // Derive Zcash transparent address from mnemonic
    const { address, derivationPath } = await self.ZcashKeys.deriveAddress(mnemonic, 0, 0);
    
    // Update state
    walletState.isLocked = false;
    walletState.address = address;
    
    // Save session state (persists across popup closes)
    await chrome.storage.session.set({
      walletUnlocked: true,
      walletAddress: address,
      unlockTime: Date.now()
    });
    
    console.log('[Background] Wallet unlocked successfully');
    console.log('[Background] Address:', address);
    console.log('[Background] Derivation path:', derivationPath);
    
    // Auto-refresh balance after unlock
    handleRefreshBalance().catch(err => {
      console.warn('[Background] Auto-refresh balance failed:', err);
    });
    
    return {
      success: true,
      address: address
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
    const { mnemonic, password } = data;
    
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }
    
    if (!mnemonic || mnemonic.trim().split(/\s+/).length !== 24) {
      throw new Error('Invalid mnemonic - must be 24 words');
    }
    
    // Encrypt and store
    const encryptedSeed = await encrypt(mnemonic.trim(), password);
    await chrome.storage.local.set({ encryptedSeed });
    
    // Derive address
    const { address, derivationPath } = await self.ZcashKeys.deriveAddress(mnemonic.trim(), 0, 0);
    
    // Update state
    walletState.isInitialized = true;
    walletState.isLocked = false;
    walletState.address = address;
    
    // Save session state
    await chrome.storage.session.set({
      walletUnlocked: true,
      walletAddress: address,
      unlockTime: Date.now()
    });
    
    console.log('[Background] Wallet imported successfully');
    console.log('[Background] Address:', address);
    console.log('[Background] Derivation path:', derivationPath);
    
    // Auto-refresh balance after import
    handleRefreshBalance().catch(err => {
      console.warn('[Background] Auto-refresh balance failed:', err);
    });
    
    return {
      success: true,
      address: address
    };
  } catch (error) {
    console.error('[Background] Wallet import failed:', error);
    throw error;
  }
}

async function handleGetState() {
  return { ...walletState };
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
            
          case 'REFRESH_BALANCE':
            result = await handleRefreshBalance();
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
