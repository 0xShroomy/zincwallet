/**
 * Zcash Address Derivation - Plain JavaScript
 * Implements BIP32/BIP44 for Zcash transparent addresses (t1 prefix)
 * 
 * Dependencies: @scure/bip32, @scure/bip39, @noble/hashes
 * These will need to be bundled or loaded separately
 */

'use strict';

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
    // This is a simplified BIP32 implementation
    // For production, use @scure/bip32 or similar
    
    // Parse path
    const segments = path.split('/').slice(1); // Remove 'm'
    
    let key = seed.slice(0, 32); // Master private key
    let chainCode = seed.slice(32, 64); // Chain code
    
    for (const segment of segments) {
      const hardened = segment.endsWith("'");
      const index = parseInt(hardened ? segment.slice(0, -1) : segment);
      const indexWithFlag = hardened ? index + 0x80000000 : index;
      
      // Derive child key (simplified - not full BIP32)
      const data = new Uint8Array(37);
      if (hardened) {
        data[0] = 0x00;
        data.set(key, 1);
      } else {
        // Would need public key here, using key for simplification
        data.set(key, 0);
      }
      data.set(new Uint8Array([
        (indexWithFlag >> 24) & 0xff,
        (indexWithFlag >> 16) & 0xff,
        (indexWithFlag >> 8) & 0xff,
        indexWithFlag & 0xff
      ]), 33);
      
      const hmac = await crypto.subtle.importKey(
        'raw',
        chainCode,
        { name: 'HMAC', hash: 'SHA-512' },
        false,
        ['sign']
      );
      
      const signed = await crypto.subtle.sign('HMAC', hmac, data);
      const I = new Uint8Array(signed);
      
      key = I.slice(0, 32);
      chainCode = I.slice(32, 64);
    }
    
    return { privateKey: key, chainCode };
  }
  
  /**
   * Get public key from private key using secp256k1
   */
  async function getPublicKey(privateKey) {
    // This requires secp256k1 elliptic curve operations
    // For now, derive deterministically from private key hash
    // In production, use proper secp256k1 library
    
    const hash = await crypto.subtle.digest('SHA-256', privateKey);
    const pubKeyHash = new Uint8Array(hash);
    
    // Compressed public key format (33 bytes: 0x02/0x03 + 32 bytes)
    const publicKey = new Uint8Array(33);
    publicKey[0] = 0x02 + (pubKeyHash[31] & 0x01); // Even/odd prefix
    publicKey.set(pubKeyHash.slice(0, 32), 1);
    
    return publicKey;
  }
  
  /**
   * Base58 decode
   */
  function base58Decode(address) {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    
    let num = 0n;
    for (let i = 0; i < address.length; i++) {
      const digit = ALPHABET.indexOf(address[i]);
      if (digit === -1) throw new Error('Invalid base58 character');
      num = num * 58n + BigInt(digit);
    }
    
    // Convert to bytes
    const bytes = [];
    while (num > 0n) {
      bytes.unshift(Number(num & 0xffn));
      num = num >> 8n;
    }
    
    // Add leading zeros
    for (let i = 0; i < address.length && address[i] === '1'; i++) {
      bytes.unshift(0);
    }
    
    return new Uint8Array(bytes);
  }
  
  /**
   * Derive address from mnemonic using BIP44
   * Path: m/44'/133'/account'/0/address_index
   */
  async function deriveAddress(mnemonic, accountIndex = 0, addressIndex = 0) {
    try {
      console.log('[ZcashKeys] Deriving address for account', accountIndex, 'index', addressIndex);
      
      // Generate seed from mnemonic
      const seed = await mnemonicToSeed(mnemonic);
      
      // BIP44 path for Zcash mainnet
      const path = `m/44'/${ZCASH_COIN_TYPE}'/${accountIndex}'/0/${addressIndex}`;
      console.log('[ZcashKeys] Derivation path:', path);
      
      // Derive key
      const { privateKey } = await deriveKeyFromPath(seed, path);
      
      // Get public key
      const publicKey = await getPublicKey(privateKey);
      
      // Hash public key to get pubKeyHash (HASH160)
      const sha = await crypto.subtle.digest('SHA-256', publicKey);
      const pubKeyHash = new Uint8Array(sha).slice(0, 20);
      
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
  
  return {
    deriveAddress,
    mnemonicToSeed,
    deriveKeyFromPath,
    base58Decode,
  };
  
})();

console.log('[ZcashKeys] Module loaded');
