import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';

/**
 * Zcash address derivation and key management
 * 
 * BIP44 path for Zcash: m/44'/133'/0'/0/0
 * - 44' = BIP44
 * - 133' = Zcash coin type
 * - 0' = account 0
 * - 0 = external chain (receiving addresses)
 * - 0 = first address
 */

const ZCASH_COIN_TYPE = 133;
const ZCASH_MAINNET_P2PKH_PREFIX = 0x1cb8; // t1 prefix

/**
 * Base58 encoding with checksum (Base58Check)
 */
function base58Encode(data: Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  
  // Add 4-byte checksum
  const checksum = sha256(sha256(data)).slice(0, 4);
  const dataWithChecksum = new Uint8Array([...data, ...checksum]);
  
  // Convert to base58
  let num = 0n;
  for (const byte of dataWithChecksum) {
    num = num * 256n + BigInt(byte);
  }
  
  let encoded = '';
  while (num > 0n) {
    const remainder = Number(num % 58n);
    num = num / 58n;
    encoded = ALPHABET[remainder] + encoded;
  }
  
  // Add leading '1' for each leading zero byte
  for (const byte of dataWithChecksum) {
    if (byte === 0) encoded = '1' + encoded;
    else break;
  }
  
  return encoded;
}

/**
 * Generate P2PKH address from public key hash
 */
function generateP2PKHAddress(pubKeyHash: Uint8Array): string {
  // Zcash mainnet P2PKH prefix (2 bytes for t1)
  const prefix = new Uint8Array([
    (ZCASH_MAINNET_P2PKH_PREFIX >> 8) & 0xff,
    ZCASH_MAINNET_P2PKH_PREFIX & 0xff,
  ]);
  
  const payload = new Uint8Array([...prefix, ...pubKeyHash]);
  return base58Encode(payload);
}

/**
 * Derive Zcash transparent address from mnemonic
 */
export function deriveZcashAddress(mnemonic: string, accountIndex = 0, addressIndex = 0): {
  address: string;
  publicKey: string;
  privateKey: string;
  derivationPath: string;
} {
  // Convert mnemonic to seed
  const seed = mnemonicToSeedSync(mnemonic, '');
  
  // Derive master key
  const masterKey = HDKey.fromMasterSeed(seed);
  
  // BIP44 derivation path: m/44'/133'/account'/0/index
  const path = `m/44'/${ZCASH_COIN_TYPE}'/${accountIndex}'/0/${addressIndex}`;
  const derived = masterKey.derive(path);
  
  if (!derived.privateKey || !derived.publicKey) {
    throw new Error('Failed to derive keys');
  }
  
  // Hash public key: SHA256 -> RIPEMD160
  const pubKeyHash = ripemd160(sha256(derived.publicKey));
  
  // Generate P2PKH address
  const address = generateP2PKHAddress(pubKeyHash);
  
  return {
    address,
    publicKey: Buffer.from(derived.publicKey).toString('hex'),
    privateKey: Buffer.from(derived.privateKey).toString('hex'),
    derivationPath: path,
  };
}

/**
 * Validate mnemonic phrase
 */
export function validateMnemonic(mnemonic: string): boolean {
  const words = mnemonic.trim().split(/\s+/);
  
  // Check word count
  if (![12, 15, 18, 21, 24].includes(words.length)) {
    return false;
  }
  
  // Check if all words are in wordlist
  return words.every(word => wordlist.includes(word));
}

/**
 * Derive multiple addresses (for address generation)
 */
export function deriveMultipleAddresses(
  mnemonic: string,
  accountIndex = 0,
  count = 5
): Array<{ address: string; index: number; path: string }> {
  const addresses = [];
  
  for (let i = 0; i < count; i++) {
    const { address, derivationPath } = deriveZcashAddress(mnemonic, accountIndex, i);
    addresses.push({
      address,
      index: i,
      path: derivationPath,
    });
  }
  
  return addresses;
}

/**
 * Sign a message with private key (for transaction signing)
 */
export function signMessage(_privateKeyHex: string, _message: Uint8Array): Uint8Array {
  // TODO: Implement ECDSA signing with secp256k1
  // This will be needed for transaction signing
  throw new Error('Not implemented yet');
}
