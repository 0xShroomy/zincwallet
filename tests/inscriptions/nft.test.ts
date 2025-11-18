import { describe, it, expect } from 'vitest';
import {
  encodeNFTCollectionDeploy,
  encodeNFTMint,
  formatIPFSContent,
  formatArweaveContent,
} from '@/shared/inscriptions/nft';

describe('NFT Inscription Encoding', () => {
  describe('encodeNFTCollectionDeploy', () => {
    it('should encode a valid collection deploy', () => {
      const params = {
        collectionName: 'My NFT Collection',
        tip: 150000,
      };

      const result = encodeNFTCollectionDeploy(params);
      const inscription = result.toString('utf8');

      expect(inscription).toContain('zinc:p=core');
      expect(inscription).toContain('op=deploy-collection');
      expect(inscription).toContain('name=');
    });

    it('should throw error for empty collection name', () => {
      const params = {
        collectionName: '',
        tip: 150000,
      };

      expect(() => encodeNFTCollectionDeploy(params)).toThrow();
    });
  });

  describe('encodeNFTMint', () => {
    it('should encode a valid NFT mint with IPFS', () => {
      const params = {
        collectionTxId: 'a'.repeat(64),
        content: 'ipfs://QmYourHash',
        protocol: 'ipfs' as const,
        mimeType: 'image/png',
        tip: 150000,
      };

      const result = encodeNFTMint(params);
      const inscription = result.toString('utf8');

      expect(inscription).toContain('zinc:p=core');
      expect(inscription).toContain('op=mint');
      expect(inscription).toContain('id=' + params.collectionTxId);
      expect(inscription).toContain('content=ipfs://QmYourHash');
      expect(inscription).toContain('protocol=ipfs');
      expect(inscription).toContain('mime=image/png');
    });

    it('should encode a valid NFT mint with Arweave', () => {
      const params = {
        collectionTxId: 'a'.repeat(64),
        content: 'ar://abc123',
        protocol: 'arweave' as const,
        mimeType: 'image/jpeg',
        tip: 150000,
      };

      const result = encodeNFTMint(params);
      const inscription = result.toString('utf8');

      expect(inscription).toContain('protocol=arweave');
    });

    it('should encode a valid NFT mint with HTTP', () => {
      const params = {
        collectionTxId: 'a'.repeat(64),
        content: 'https://example.com/image.png',
        protocol: 'http' as const,
        mimeType: 'image/png',
        tip: 150000,
      };

      const result = encodeNFTMint(params);
      const inscription = result.toString('utf8');

      expect(inscription).toContain('protocol=http');
    });

    it('should encode a valid NFT mint with plaintext', () => {
      const params = {
        collectionTxId: 'a'.repeat(64),
        content: 'Hello, World!',
        protocol: 'plaintext' as const,
        mimeType: 'text/plain',
        tip: 150000,
      };

      const result = encodeNFTMint(params);
      const inscription = result.toString('utf8');

      expect(inscription).toContain('protocol=plaintext');
    });

    it('should throw error for invalid collection txid', () => {
      const params = {
        collectionTxId: 'invalid',
        content: 'ipfs://QmHash',
        protocol: 'ipfs' as const,
        mimeType: 'image/png',
        tip: 150000,
      };

      expect(() => encodeNFTMint(params)).toThrow();
    });

    it('should throw error for invalid protocol', () => {
      const params = {
        collectionTxId: 'a'.repeat(64),
        content: 'test',
        protocol: 'invalid' as any,
        mimeType: 'image/png',
        tip: 150000,
      };

      expect(() => encodeNFTMint(params)).toThrow();
    });

    it('should throw error for invalid MIME type', () => {
      const params = {
        collectionTxId: 'a'.repeat(64),
        content: 'ipfs://QmHash',
        protocol: 'ipfs' as const,
        mimeType: 'invalid',
        tip: 150000,
      };

      expect(() => encodeNFTMint(params)).toThrow();
    });
  });

  describe('formatIPFSContent', () => {
    it('should add ipfs:// prefix if missing', () => {
      expect(formatIPFSContent('QmHash')).toBe('ipfs://QmHash');
    });

    it('should not duplicate ipfs:// prefix', () => {
      expect(formatIPFSContent('ipfs://QmHash')).toBe('ipfs://QmHash');
    });
  });

  describe('formatArweaveContent', () => {
    it('should add ar:// prefix if missing', () => {
      expect(formatArweaveContent('abc123')).toBe('ar://abc123');
    });

    it('should not duplicate ar:// prefix', () => {
      expect(formatArweaveContent('ar://abc123')).toBe('ar://abc123');
    });
  });
});
