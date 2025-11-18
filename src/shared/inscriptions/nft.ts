import type { NFTCollectionDeployParams, NFTMintParams } from '@/types/inscriptions';
import { ZINC_PROTOCOL } from '@/shared/config';

/**
 * Encodes Zinc Core NFT collection deploy inscription
 * Format: zinc:p=core op=deploy-collection name=[collectionName]
 */
export function encodeNFTCollectionDeploy(params: NFTCollectionDeployParams): Buffer {
  const { collectionName } = params;
  
  // Validation
  if (!collectionName || collectionName.length === 0) {
    throw new Error('Collection name is required');
  }
  
  if (collectionName.length > ZINC_PROTOCOL.NFT_NAME_MAX_LENGTH) {
    throw new Error(`Collection name must be ${ZINC_PROTOCOL.NFT_NAME_MAX_LENGTH} characters or less`);
  }
  
  // Sanitize collection name (basic sanitization)
  const sanitized = collectionName.replace(/[^\w\s-]/g, '').trim();
  if (!sanitized) {
    throw new Error('Collection name contains invalid characters');
  }
  
  const inscription = `zinc:p=core op=deploy-collection name=${sanitized}`;
  
  return Buffer.from(inscription, 'utf8');
}

/**
 * Encodes Zinc Core NFT mint inscription
 * Format: zinc:p=core op=mint id=[collectionTxId] content=[content] protocol=[protocol] mime=[mimeType]
 */
export function encodeNFTMint(params: NFTMintParams): Buffer {
  const { collectionTxId, content, protocol, mimeType } = params;
  
  // Validation
  if (!collectionTxId || collectionTxId.length !== 64) {
    throw new Error('Invalid collection transaction ID');
  }
  
  if (!content || content.length === 0) {
    throw new Error('Content is required');
  }
  
  if (content.length > ZINC_PROTOCOL.NFT_CONTENT_MAX_LENGTH) {
    throw new Error(`Content exceeds maximum size of ${ZINC_PROTOCOL.NFT_CONTENT_MAX_LENGTH} bytes`);
  }
  
  if (!ZINC_PROTOCOL.CONTENT_PROTOCOLS.includes(protocol as any)) {
    throw new Error(`Protocol must be one of: ${ZINC_PROTOCOL.CONTENT_PROTOCOLS.join(', ')}`);
  }
  
  if (!mimeType || !isValidMimeType(mimeType)) {
    throw new Error('Invalid MIME type');
  }
  
  // Validate content based on protocol
  validateContentForProtocol(content, protocol);
  
  const inscription = `zinc:p=core op=mint id=${collectionTxId} content=${content} protocol=${protocol} mime=${mimeType}`;
  
  return Buffer.from(inscription, 'utf8');
}

/**
 * Validates content based on protocol
 */
function validateContentForProtocol(content: string, protocol: string): void {
  switch (protocol) {
    case 'ipfs':
      if (!content.startsWith('ipfs://') && !content.startsWith('Qm') && !content.startsWith('baf')) {
        throw new Error('IPFS content must be a valid IPFS URI or CID');
      }
      break;
    
    case 'arweave':
      if (!content.startsWith('ar://') && !/^[a-zA-Z0-9_-]{43}$/.test(content)) {
        throw new Error('Arweave content must be a valid Arweave URI or transaction ID');
      }
      break;
    
    case 'http':
      if (!content.startsWith('http://') && !content.startsWith('https://')) {
        throw new Error('HTTP content must be a valid HTTP/HTTPS URL');
      }
      break;
    
    case 'plaintext':
      // No specific validation for plaintext
      break;
    
    default:
      throw new Error(`Unsupported protocol: ${protocol}`);
  }
}

/**
 * Validates MIME type format
 */
function isValidMimeType(mimeType: string): boolean {
  // Basic MIME type validation (type/subtype)
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*(\+[a-zA-Z0-9][a-zA-Z0-9._-]*)?$/.test(mimeType);
}

/**
 * Helper to format IPFS content as URI
 */
export function formatIPFSContent(cid: string): string {
  if (cid.startsWith('ipfs://')) {
    return cid;
  }
  return `ipfs://${cid}`;
}

/**
 * Helper to format Arweave content as URI
 */
export function formatArweaveContent(txId: string): string {
  if (txId.startsWith('ar://')) {
    return txId;
  }
  return `ar://${txId}`;
}

/**
 * Parses an NFT inscription from OP_RETURN data
 */
export function parseNFTInscription(data: Buffer): {
  protocol: string;
  operation: string;
  params: Record<string, string>;
} | null {
  try {
    const inscription = data.toString('utf8');
    
    if (!inscription.startsWith('zinc:p=core')) {
      return null;
    }
    
    // Parse key-value pairs
    const parts = inscription.split(/\s+/);
    const params: Record<string, string> = {};
    
    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key && value) {
        params[key] = value;
      }
    }
    
    return {
      protocol: 'core',
      operation: params['op'] || '',
      params,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Estimates the size of an NFT inscription
 */
export function estimateNFTInscriptionSize(params: NFTMintParams): number {
  const encoded = encodeNFTMint(params);
  return encoded.length;
}
