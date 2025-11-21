/**
 * Zcash Address Derivation - Plain JavaScript
 * Implements BIP32/BIP44 for Zcash transparent addresses (t1 prefix)
 * 
 * Dependencies: @scure/bip32, @scure/bip39, @noble/hashes
 * These will need to be bundled or loaded separately
 */

'use strict';

/* global CryptoJS */

// Expose ZcashKeys namespace
self.ZcashKeys = (function() {
  
  const ZCASH_COIN_TYPE = 133;
  const ZCASH_MAINNET_P2PKH_PREFIX = 0x1cb8;
  
  /**
   * Simple SHA256 implementation for checksums
   */
  async function sha256(data) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hashBuffer);
  }
  
  /**
   * Base58 encode with checksum
   */
  async function base58Encode(data) {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    
    try {
      // Add 4-byte checksum (double SHA256)
      const hash1 = await sha256(data);
      const hash2 = await sha256(hash1);
      const checksum = hash2.slice(0, 4);
      
      const dataWithChecksum = new Uint8Array(data.length + 4);
      dataWithChecksum.set(data);
      dataWithChecksum.set(checksum, data.length);
      
      // Convert to BigInt
      let num = 0n;
      for (let i = 0; i < dataWithChecksum.length; i++) {
        num = num * 256n + BigInt(dataWithChecksum[i]);
      }
      
      // Convert to base58
      let encoded = '';
      while (num > 0n) {
        const remainder = Number(num % 58n);
        num = num / 58n;
        encoded = ALPHABET[remainder] + encoded;
      }
      
      // Add '1' for each leading zero
      for (let i = 0; i < dataWithChecksum.length && dataWithChecksum[i] === 0; i++) {
        encoded = '1' + encoded;
      }
      
      return encoded;
    } catch (error) {
      console.error('[ZcashKeys] Base58 encoding failed:', error);
      throw new Error('Address encoding failed: ' + error.message);
    }
  }
  
  /**
   * Derive BIP39 seed from mnemonic
   */
  async function mnemonicToSeed(mnemonic, passphrase = '') {
    const encoder = new TextEncoder();
    const mnemonicBytes = encoder.encode(mnemonic.normalize('NFKD'));
    const salt = encoder.encode('mnemonic' + passphrase.normalize('NFKD'));
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      mnemonicBytes,
      'PBKDF2',
      false,
      ['deriveBits']
    );
    
    const seed = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 2048,
        hash: 'SHA-512'
      },
      keyMaterial,
      512 // 64 bytes
    );
    
    return new Uint8Array(seed);
  }
  
  /**
   * Derive child key using BIP32 (simplified for secp256k1)
   * Path format: m/44'/133'/0'/0/0 (for Zcash mainnet)
   */
  async function deriveKeyFromPath(seed, path) {
    // BIP32 key derivation - now with PROPER public key handling
    
    // Step 1: Derive master key from seed using HMAC-SHA512
    // BIP32: I = HMAC-SHA512(Key = "Bitcoin seed", Data = seed)
    const masterHmac = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('Bitcoin seed'),
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign']
    );
    
    const masterI = new Uint8Array(await crypto.subtle.sign('HMAC', masterHmac, seed));
    let key = masterI.slice(0, 32); // Master private key
    let chainCode = masterI.slice(32, 64); // Master chain code
    
    // Step 2: Parse path and derive child keys
    const segments = path.split('/').slice(1); // Remove 'm'
    
    for (const segment of segments) {
      const hardened = segment.endsWith("'");
      const index = parseInt(hardened ? segment.slice(0, -1) : segment);
      const indexWithFlag = hardened ? index + 0x80000000 : index;
      
      // BIP32 child key derivation
      let data;
      if (hardened) {
        // Hardened: data = 0x00 || private_key || index
        data = new Uint8Array(37);
        data[0] = 0x00;
        data.set(key, 1);
        data.set(new Uint8Array([
          (indexWithFlag >> 24) & 0xff,
          (indexWithFlag >> 16) & 0xff,
          (indexWithFlag >> 8) & 0xff,
          indexWithFlag & 0xff
        ]), 33);
      } else {
        // Non-hardened: data = public_key || index
        // FIXED: Use real public key, not private key!
        const publicKey = await getPublicKey(key);
        data = new Uint8Array(37);
        data.set(publicKey, 0); // 33 bytes compressed public key
        data.set(new Uint8Array([
          (indexWithFlag >> 24) & 0xff,
          (indexWithFlag >> 16) & 0xff,
          (indexWithFlag >> 8) & 0xff,
          indexWithFlag & 0xff
        ]), 33);
      }
      
      // HMAC-SHA512(chain_code, data)
      const hmac = await crypto.subtle.importKey(
        'raw',
        chainCode,
        { name: 'HMAC', hash: 'SHA-512' },
        false,
        ['sign']
      );
      
      const I = new Uint8Array(await crypto.subtle.sign('HMAC', hmac, data));
      
      // Parse I into IL (32 bytes) and IR (32 bytes)
      const IL = I.slice(0, 32);
      chainCode = I.slice(32, 64);
      
      // BIP32: child_private_key = (parse256(IL) + parent_private_key) mod n
      // Where n is the secp256k1 curve order
      const n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
      
      // Convert IL and parent key to BigInt
      let ILnum = 0n;
      for (let i = 0; i < IL.length; i++) {
        ILnum = (ILnum << 8n) | BigInt(IL[i]);
      }
      
      let parentNum = 0n;
      for (let i = 0; i < key.length; i++) {
        parentNum = (parentNum << 8n) | BigInt(key[i]);
      }
      
      // Add and mod n
      let childNum = (ILnum + parentNum) % n;
      
      // Convert back to bytes
      const childKey = new Uint8Array(32);
      for (let i = 31; i >= 0; i--) {
        childKey[i] = Number(childNum & 0xFFn);
        childNum >>= 8n;
      }
      
      key = childKey;
    }
    
    return { privateKey: key, chainCode };
  }
  
  /**
   * Get public key from private key using REAL secp256k1
   * This uses proper elliptic curve math from fix-zcash-keys.js
   */
  async function getPublicKey(privateKey) {
    // Use the real secp256k1 implementation
    if (self.FixedZcashKeys) {
      return self.FixedZcashKeys.getPublicKey(privateKey);
    }
    
    // Fallback error if fix-zcash-keys.js not loaded
    throw new Error('FixedZcashKeys not loaded! Import fix-zcash-keys.js first');
  }
  
  /**
   * Base58 decode with checksum verification
   */
  async function base58Decode(address) {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    
    let num = 0n;
    for (let i = 0; i < address.length; i++) {
      const digit = ALPHABET.indexOf(address[i]);
      if (digit === -1) {
        throw new Error(`Invalid base58 character: ${address[i]}`);
      }
      num = num * 58n + BigInt(digit);
    }
    
    // Convert to bytes
    const bytes = [];
    while (num > 0n) {
      bytes.unshift(Number(num & 0xffn));
      num = num >> 8n;
    }
    
    // Add leading zeros (for each leading '1' in the address)
    for (let i = 0; i < address.length && address[i] === '1'; i++) {
      bytes.unshift(0);
    }
    
    const decoded = new Uint8Array(bytes);
    
    // Verify checksum (last 4 bytes)
    if (decoded.length < 4) {
      throw new Error('Invalid base58 data: too short');
    }
    
    const payload = decoded.slice(0, -4);
    const checksum = decoded.slice(-4);
    
    // Compute expected checksum (double SHA256)
    const hash1 = await sha256(payload);
    const hash2 = await sha256(hash1);
    const expectedChecksum = hash2.slice(0, 4);
    
    // Verify checksum matches
    for (let i = 0; i < 4; i++) {
      if (checksum[i] !== expectedChecksum[i]) {
        throw new Error('Invalid base58 checksum');
      }
    }
    
    return payload;
  }
  
  /**
   * Derive address from mnemonic using BIP44
   * Path: m/44'/coinType'/account'/0/address_index
   */
  async function deriveAddress(mnemonic, accountIndex = 0, addressIndex = 0, coinType = null) {
    try {
      console.log('[ZcashKeys] Deriving address for account', accountIndex, 'index', addressIndex);
      
      // Generate seed from mnemonic
      const seed = await mnemonicToSeed(mnemonic);
      
      // Use specified coin type or default to Zcash (133)
      // Zerdinals uses Bitcoin coin type (0) for compatibility
      const useCoinType = coinType !== null ? coinType : ZCASH_COIN_TYPE;
      
      // BIP44 path
      const path = `m/44'/${useCoinType}'/${accountIndex}'/0/${addressIndex}`;
      console.log('[ZcashKeys] Derivation path:', path, `(coin type: ${useCoinType})`);
      
      // Derive key
      const { privateKey } = await deriveKeyFromPath(seed, path);
      
      // Get public key
      const publicKey = await getPublicKey(privateKey);
      
      // Hash public key to get pubKeyHash (HASH160 = SHA256 + RIPEMD160)
      // Step 1: SHA-256
      const sha256 = await crypto.subtle.digest('SHA-256', publicKey);
      const sha256Hex = Array.from(new Uint8Array(sha256)).map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Step 2: RIPEMD-160 (using CryptoJS)
      const ripemd160 = CryptoJS.RIPEMD160(CryptoJS.enc.Hex.parse(sha256Hex));
      const pubKeyHash = new Uint8Array(ripemd160.words.length * 4);
      for (let i = 0; i < ripemd160.words.length; i++) {
        pubKeyHash[i * 4] = (ripemd160.words[i] >>> 24) & 0xff;
        pubKeyHash[i * 4 + 1] = (ripemd160.words[i] >>> 16) & 0xff;
        pubKeyHash[i * 4 + 2] = (ripemd160.words[i] >>> 8) & 0xff;
        pubKeyHash[i * 4 + 3] = ripemd160.words[i] & 0xff;
      }
      
      // Build address payload: 2-byte prefix + 20-byte hash
      const payload = new Uint8Array(22);
      payload[0] = (ZCASH_MAINNET_P2PKH_PREFIX >> 8) & 0xff;
      payload[1] = ZCASH_MAINNET_P2PKH_PREFIX & 0xff;
      payload.set(pubKeyHash, 2);
      
      console.log('[ZcashKeys] Encoding address with Base58Check...');
      
      // Base58Check encode
      const address = await base58Encode(payload);
      
      console.log('[ZcashKeys] Address derived successfully:', address);
      
      return {
        address,
        derivationPath: path,
        publicKey: Array.from(publicKey).map(b => b.toString(16).padStart(2, '0')).join(''),
        privateKey: Array.from(privateKey).map(b => b.toString(16).padStart(2, '0')).join(''),
      };
    } catch (error) {
      console.error('[ZcashKeys] Address derivation failed:', error);
      throw new Error('Failed to derive Zcash address: ' + error.message);
    }
  }
  
  /**
   * Import address from private key (supports both WIF and hex formats)
   * - WIF format: L... or K... (Base58 encoded, starts with L/K for mainnet compressed)
   * - Hex format: 0x... (64 hex characters, used by Zinc.is)
   */
  async function importFromPrivateKey(privateKeyInput) {
    try {
      console.log('[ZcashKeys] Importing from private key...');
      
      let privateKey;
      let isCompressed = true; // Default to compressed
      
      // Check if it's hex format (0x... or raw hex)
      if (privateKeyInput.startsWith('0x') || (privateKeyInput.length === 64 && /^[0-9a-fA-F]+$/.test(privateKeyInput))) {
        console.log('[ZcashKeys] Detected hex format private key');
        
        // Remove 0x prefix if present
        const hexKey = privateKeyInput.startsWith('0x') ? privateKeyInput.slice(2) : privateKeyInput;
        
        // Validate hex length (should be 64 characters = 32 bytes)
        if (hexKey.length !== 64) {
          throw new Error('Invalid hex private key length (expected 64 characters)');
        }
        
        // Convert hex to bytes
        privateKey = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
          privateKey[i] = parseInt(hexKey.substr(i * 2, 2), 16);
        }
        
        console.log('[ZcashKeys] Hex private key decoded successfully');
      } else {
        console.log('[ZcashKeys] Detected WIF format private key');
        
        // Decode WIF format (Base58Check)
        const decoded = await base58Decode(privateKeyInput);
        
        // WIF format: [1 byte version][32 bytes private key][optional 1 byte compression flag][4 bytes checksum]
        if (decoded.length !== 37 && decoded.length !== 38) {
          throw new Error('Invalid WIF private key format');
        }
        
        // Check version byte (0x80 for mainnet)
        if (decoded[0] !== 0x80) {
          throw new Error('Invalid private key version - must be mainnet');
        }
        
        // Extract private key (32 bytes after version byte)
        privateKey = decoded.slice(1, 33);
        
        // Check if compressed (length 38 means compressed, last byte before checksum should be 0x01)
        isCompressed = decoded.length === 38 && decoded[33] === 0x01;
        
        console.log('[ZcashKeys] WIF private key decoded, compressed:', isCompressed);
      }
      
      // Derive public key
      const publicKey = await getPublicKey(privateKey);
      
      // Hash public key to get pubKeyHash (HASH160 = SHA256 + RIPEMD160)
      const sha256 = await crypto.subtle.digest('SHA-256', publicKey);
      const sha256Hex = Array.from(new Uint8Array(sha256)).map(b => b.toString(16).padStart(2, '0')).join('');
      
      const ripemd160 = CryptoJS.RIPEMD160(CryptoJS.enc.Hex.parse(sha256Hex));
      const pubKeyHash = new Uint8Array(ripemd160.words.length * 4);
      for (let i = 0; i < ripemd160.words.length; i++) {
        pubKeyHash[i * 4] = (ripemd160.words[i] >>> 24) & 0xff;
        pubKeyHash[i * 4 + 1] = (ripemd160.words[i] >>> 16) & 0xff;
        pubKeyHash[i * 4 + 2] = (ripemd160.words[i] >>> 8) & 0xff;
        pubKeyHash[i * 4 + 3] = ripemd160.words[i] & 0xff;
      }
      
      // Build address payload: 2-byte prefix + 20-byte hash
      const payload = new Uint8Array(22);
      payload[0] = (ZCASH_MAINNET_P2PKH_PREFIX >> 8) & 0xff;
      payload[1] = ZCASH_MAINNET_P2PKH_PREFIX & 0xff;
      payload.set(pubKeyHash, 2);
      
      console.log('[ZcashKeys] Encoding address with Base58Check...');
      
      // Base58Check encode
      const address = await base58Encode(payload);
      
      console.log('[ZcashKeys] Address imported successfully:', address);
      
      return {
        address,
        publicKey: Array.from(publicKey).map(b => b.toString(16).padStart(2, '0')).join(''),
        privateKey: Array.from(privateKey).map(b => b.toString(16).padStart(2, '0')).join(''),
        source: 'privateKey'
      };
    } catch (error) {
      console.error('[ZcashKeys] Private key import failed:', error);
      throw new Error('Failed to import private key: ' + error.message);
    }
  }
  
  return {
    deriveAddress,
    importFromPrivateKey,
    getPublicKey,
    mnemonicToSeed,
    deriveKeyFromPath,
    base58Decode,
    base58Encode,
  };
  
})();

console.log('[ZcashKeys] Module loaded');
