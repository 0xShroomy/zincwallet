import { describe, it, expect } from 'vitest';
import {
  encodeZRC20Deploy,
  encodeZRC20Mint,
  encodeZRC20Transfer,
  decodeZRC20,
  bytesToHex,
} from '../src/shared/zrc20-encoder';

describe('ZRC-20 Binary Encoder', () => {
  describe('Deploy', () => {
    it('should encode ZINC token deploy correctly', () => {
      const params = {
        ticker: 'ZINC',
        maxSupply: 21000000n,
        mintLimit: 1000n,
        decimals: 8,
      };

      const encoded = encodeZRC20Deploy(params);
      
      // Verify byte structure
      expect(encoded[0]).toBe(0x10); // Protocol + Op
      expect(bytesToHex(encoded)).toMatch(/^10/); // Starts with 0x10
      
      // Should be decodable
      const decoded = decodeZRC20(encoded);
      expect(decoded.operation).toBe('deploy');
      expect(decoded.details.ticker).toBe('ZINC');
      expect(decoded.details.maxSupply).toBe(21000000n);
      expect(decoded.details.mintLimit).toBe(1000n);
      expect(decoded.details.decimals).toBe(8);
    });

    it('should reject invalid tickers', () => {
      expect(() => encodeZRC20Deploy({
        ticker: 'ABC', // Too short
        maxSupply: 1000n,
        mintLimit: 100n,
        decimals: 8,
      })).toThrow('Ticker must be 4-6 characters');

      expect(() => encodeZRC20Deploy({
        ticker: 'abc123', // Lowercase
        maxSupply: 1000n,
        mintLimit: 100n,
        decimals: 8,
      })).toThrow('Ticker must be uppercase alphanumeric');
    });
  });

  describe('Mint', () => {
    it('should encode mint operation correctly', () => {
      const params = {
        deployTxid: 'a'.repeat(64), // Mock txid
        amount: 1000n,
      };

      const encoded = encodeZRC20Mint(params);
      
      expect(encoded[0]).toBe(0x11); // Protocol + Op
      expect(encoded.length).toBe(41); // 1 + 32 + 8
      
      // Should be decodable
      const decoded = decodeZRC20(encoded);
      expect(decoded.operation).toBe('mint');
      expect(decoded.details.amount).toBe(1000n);
    });
  });

  describe('Transfer', () => {
    it('should encode transfer operation correctly', () => {
      const params = {
        deployTxid: 'b'.repeat(64), // Mock txid
        amount: 500n,
      };

      const encoded = encodeZRC20Transfer(params);
      
      expect(encoded[0]).toBe(0x12); // Protocol + Op
      expect(encoded.length).toBe(41); // 1 + 32 + 8
      
      // Should be decodable
      const decoded = decodeZRC20(encoded);
      expect(decoded.operation).toBe('transfer');
      expect(decoded.details.amount).toBe(500n);
    });
  });
});
