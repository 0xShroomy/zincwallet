/**
 * Inscription Indexer Service
 * Fetches ZRC-20 tokens and NFTs for a given address
 */

export interface ZRC20Token {
  tick: string;
  balance: number;
  deployTxid?: string;
  deployBlock?: number;
  lastUpdate?: number;
}

export interface NFTInscription {
  id: string;
  collection: string;
  metadata: any;
  txid: string;
  block?: number;
  owner: string;
  contentType?: string;
  contentSize?: number;
  protocol?: 'zinc' | 'zerdinals'; // Protocol type for explorer link detection
}

export interface InscriptionData {
  zrc20: ZRC20Token[];
  nfts: NFTInscription[];
}

/**
 * Fetch inscriptions for an address
 * For now, we'll create a placeholder that can be connected to:
 * 1. Zerdinals API
 * 2. Custom indexer
 * 3. Direct blockchain scanning
 */
export async function fetchInscriptions(address: string): Promise<InscriptionData> {
  // TODO: Connect to actual indexer API
  // Options:
  // 1. Use Zerdinals API (if they have public endpoints)
  // 2. Build custom indexer
  // 3. Use blockchain explorer APIs
  
  // For now, return empty (will be populated when indexer is ready)
  return {
    zrc20: [],
    nfts: []
  };
}

/**
 * Parse inscription data from OP_RETURN
 */
export function parseInscription(opReturn: string): any {
  try {
    // OP_RETURN format: OP_RETURN <hex_data>
    // Convert hex to string and parse JSON
    const jsonStr = Buffer.from(opReturn, 'hex').toString('utf8');
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('Failed to parse inscription:', error);
    return null;
  }
}

/**
 * Check if data is a ZRC-20 inscription
 */
export function isZRC20(data: any): boolean {
  return data?.p === 'zrc-20' && ['deploy', 'mint', 'transfer'].includes(data?.op);
}

/**
 * Check if data is an NFT inscription
 */
export function isNFT(data: any): boolean {
  return data?.p === 'zrc-nft' && ['deploy', 'mint'].includes(data?.op);
}
