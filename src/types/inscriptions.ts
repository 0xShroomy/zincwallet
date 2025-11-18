export interface ZRC20DeployParams {
  ticker: string;
  max: string;
  limit: string;
  decimals: number;
  tip: number;
}

export interface ZRC20MintParams {
  deployTxId: string;
  amount: string;
  tip: number;
}

export interface ZRC20TransferParams {
  deployTxId: string;
  amount: string;
  recipient: string;
  tip: number;
}

export interface NFTCollectionDeployParams {
  collectionName: string;
  tip: number;
}

export interface NFTMintParams {
  collectionTxId: string;
  content: string;
  protocol: 'ipfs' | 'arweave' | 'http' | 'plaintext';
  mimeType: string;
  tip: number;
}

export interface InscriptionData {
  type: 'zrc20-deploy' | 'zrc20-mint' | 'zrc20-transfer' | 'nft-collection' | 'nft-mint';
  payload: Buffer;
  recipient?: string;
  tip: number;
}

export interface ZRC20Token {
  deployTxId: string;
  ticker: string;
  max: string;
  limit: string;
  decimals: number;
  balance: string;
}

export interface NFTItem {
  txid: string;
  collectionTxId: string;
  content: string;
  protocol: string;
  mimeType: string;
  timestamp: number;
}
