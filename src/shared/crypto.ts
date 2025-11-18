import type { EncryptedData } from '@/types/wallet';

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const ITERATIONS = 100000;

/**
 * Derives a cryptographic key from a password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts data using AES-GCM with password-based key derivation
 */
export async function encrypt(data: string, password: string): Promise<EncryptedData> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  const key = await deriveKey(password, salt);
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoder.encode(data)
  );

  return {
    ciphertext: bufferToHex(ciphertext),
    iv: bufferToHex(iv),
    salt: bufferToHex(salt),
  };
}

/**
 * Decrypts data using AES-GCM with password-based key derivation
 */
export async function decrypt(encrypted: EncryptedData, password: string): Promise<string> {
  const salt = hexToBuffer(encrypted.salt);
  const iv = hexToBuffer(encrypted.iv);
  const ciphertext = hexToBuffer(encrypted.ciphertext);
  
  const key = await deriveKey(password, salt);
  
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      ciphertext
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    throw new Error('Decryption failed. Invalid password or corrupted data.');
  }
}

/**
 * Generates a secure random mnemonic seed phrase (24 words)
 */
export function generateMnemonic(): string {
  // In production, use bip39 library
  // This is a placeholder implementation
  const entropy = crypto.getRandomValues(new Uint8Array(32));
  return bufferToHex(entropy);
}

/**
 * Validates a mnemonic seed phrase
 */
export function validateMnemonic(mnemonic: string): boolean {
  // In production, use bip39.validateMnemonic()
  const words = mnemonic.trim().split(/\s+/);
  return words.length === 24 || words.length === 12;
}

/**
 * Converts ArrayBuffer to hex string
 */
function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converts hex string to Uint8Array
 */
function hexToBuffer(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g);
  if (!matches) throw new Error('Invalid hex string');
  return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
}

/**
 * Generates a secure random string
 */
export function generateRandomId(length: number = 16): string {
  const array = crypto.getRandomValues(new Uint8Array(length));
  return bufferToHex(array);
}
