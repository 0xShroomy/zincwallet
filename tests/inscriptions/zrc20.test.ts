import { describe, it, expect } from 'vitest';
import {
  encodeZRC20Deploy,
  encodeZRC20Mint,
  encodeZRC20Transfer,
  parseZRC20Inscription,
} from '@/shared/inscriptions/zrc20';

describe('ZRC-20 Inscription Encoding', () => {
  describe('encodeZRC20Deploy', () => {
    it('should encode a valid deploy inscription', () => {
      const params = {
        ticker: 'ZINC',
        max: '21000000',
        limit: '1000',
        decimals: 8,
        tip: 150000,
      };

      const result = encodeZRC20Deploy(params);
      const inscription = result.toString('utf8');

      expect(inscription).toContain('zinc:p=zrc-20');
      expect(inscription).toContain('op=deploy');
      expect(inscription).toContain('tick=ZINC');
      expect(inscription).toContain('max=21000000');
      expect(inscription).toContain('lim=1000');
      expect(inscription).toContain('dec=8');
    });

    it('should uppercase ticker', () => {
      const params = {
        ticker: 'zinc',
        max: '1000',
        limit: '100',
        decimals: 8,
        tip: 150000,
      };

      const result = encodeZRC20Deploy(params);
      const inscription = result.toString('utf8');

      expect(inscription).toContain('tick=ZINC');
    });

    it('should throw error for invalid ticker length', () => {
      const params = {
        ticker: '', // too short
        max: '1000',
        limit: '100',
        decimals: 8,
        tip: 150000,
      };

      expect(() => encodeZRC20Deploy(params)).toThrow();
    });

    it('should throw error for ticker with invalid characters', () => {
      const params = {
        ticker: 'ZIN$C',
        max: '1000',
        limit: '100',
        decimals: 8,
        tip: 150000,
      };

      expect(() => encodeZRC20Deploy(params)).toThrow();
    });

    it('should throw error for invalid decimals', () => {
      const params = {
        ticker: 'ZINC',
        max: '1000',
        limit: '100',
        decimals: 19, // too high
        tip: 150000,
      };

      expect(() => encodeZRC20Deploy(params)).toThrow();
    });
  });

  describe('encodeZRC20Mint', () => {
    it('should encode a valid mint inscription', () => {
      const params = {
        deployTxId: 'a'.repeat(64),
        amount: '100',
        tip: 150000,
      };

      const result = encodeZRC20Mint(params);
      const inscription = result.toString('utf8');

      expect(inscription).toContain('zinc:p=zrc-20');
      expect(inscription).toContain('op=mint');
      expect(inscription).toContain('id=' + params.deployTxId);
      expect(inscription).toContain('amt=100');
    });

    it('should throw error for invalid txid', () => {
      const params = {
        deployTxId: 'invalid',
        amount: '100',
        tip: 150000,
      };

      expect(() => encodeZRC20Mint(params)).toThrow();
    });
  });

  describe('encodeZRC20Transfer', () => {
    it('should encode a valid transfer inscription', () => {
      const params = {
        deployTxId: 'a'.repeat(64),
        amount: '50',
        recipient: 't1' + 'X'.repeat(33),
        tip: 150000,
      };

      const result = encodeZRC20Transfer(params);
      const inscription = result.toString('utf8');

      expect(inscription).toContain('zinc:p=zrc-20');
      expect(inscription).toContain('op=transfer');
      expect(inscription).toContain('id=' + params.deployTxId);
      expect(inscription).toContain('amt=50');
    });

    it('should throw error for invalid recipient', () => {
      const params = {
        deployTxId: 'a'.repeat(64),
        amount: '50',
        recipient: 'invalid-address',
        tip: 150000,
      };

      expect(() => encodeZRC20Transfer(params)).toThrow();
    });
  });

  describe('parseZRC20Inscription', () => {
    it('should parse a deploy inscription', () => {
      const inscription = Buffer.from('zinc:p=zrc-20 op=deploy tick=ZINC max=1000 lim=100 dec=8', 'utf8');
      const result = parseZRC20Inscription(inscription);

      expect(result).not.toBeNull();
      expect(result?.protocol).toBe('zrc-20');
      expect(result?.operation).toBe('deploy');
      expect(result?.params.tick).toBe('ZINC');
      expect(result?.params.max).toBe('1000');
    });

    it('should return null for non-ZRC-20 inscription', () => {
      const inscription = Buffer.from('not-a-zinc-inscription', 'utf8');
      const result = parseZRC20Inscription(inscription);

      expect(result).toBeNull();
    });
  });
});
