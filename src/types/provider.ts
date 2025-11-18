import type {
  ZRC20DeployParams,
  ZRC20MintParams,
  ZRC20TransferParams,
  NFTCollectionDeployParams,
  NFTMintParams,
  ZRC20Token,
  NFTItem
} from './inscriptions';

export interface ZincProvider {
  isZincWallet: boolean;
  isConnected: boolean;
  
  // Connection
  connect(): Promise<string>;
  disconnect(): Promise<void>;
  
  // Wallet info
  getAddress(): Promise<string>;
  getBalance(): Promise<number>;
  getNetwork(): Promise<'mainnet' | 'testnet'>;
  
  // ZRC-20 Operations
  deployZrc20(params: ZRC20DeployParams): Promise<string>;
  mintZrc20(params: ZRC20MintParams): Promise<string>;
  transferZrc20(params: ZRC20TransferParams): Promise<string>;
  
  // NFT Operations
  deployCollection(params: NFTCollectionDeployParams): Promise<string>;
  mintNft(params: NFTMintParams): Promise<string>;
  
  // Query
  getInscriptions(): Promise<{tokens: ZRC20Token[], nfts: NFTItem[]}>;
  
  // Events
  on(event: 'accountsChanged' | 'networkChanged' | 'disconnect', handler: (data: any) => void): void;
  removeListener(event: string, handler: (data: any) => void): void;
}

export interface ProviderRequest {
  id: string;
  method: string;
  params: any;
  origin: string;
  timestamp: number;
}

export interface ProviderResponse {
  id: string;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

declare global {
  interface Window {
    zincProvider?: ZincProvider;
  }
}
