import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, validateMnemonic } from '@/shared/crypto';

describe('Crypto Utilities', () => {
  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt data correctly', async () => {
      const data = 'sensitive wallet data';
      const password = 'strongPassword123';

      const encrypted = await encrypt(data, password);
      
      expect(encrypted.ciphertext).toBeTruthy();
      expect(encrypted.iv).toBeTruthy();
      expect(encrypted.salt).toBeTruthy();

      const decrypted = await decrypt(encrypted, password);
      
      expect(decrypted).toBe(data);
    });

    it('should fail decryption with wrong password', async () => {
      const data = 'sensitive wallet data';
      const password = 'correctPassword';
      const wrongPassword = 'wrongPassword';

      const encrypted = await encrypt(data, password);

      await expect(decrypt(encrypted, wrongPassword)).rejects.toThrow();
    });

    it('should handle unicode characters', async () => {
      const data = '🔐 Secure wallet データ';
      const password = 'password123';

      const encrypted = await encrypt(data, password);
      const decrypted = await decrypt(encrypted, password);

      expect(decrypted).toBe(data);
    });
  });

  describe('validateMnemonic', () => {
    it('should validate 12-word mnemonic', () => {
      const mnemonic = 'word '.repeat(12).trim();
      expect(validateMnemonic(mnemonic)).toBe(true);
    });

    it('should validate 24-word mnemonic', () => {
      const mnemonic = 'word '.repeat(24).trim();
      expect(validateMnemonic(mnemonic)).toBe(true);
    });

    it('should reject invalid word count', () => {
      const mnemonic = 'word '.repeat(15).trim();
      expect(validateMnemonic(mnemonic)).toBe(false);
    });

    it('should reject empty mnemonic', () => {
      expect(validateMnemonic('')).toBe(false);
    });
  });
});
