import type { WalletConfig } from '@/types/wallet';

export const DEFAULT_CONFIG: WalletConfig = {
  network: (import.meta.env.VITE_NETWORK as 'mainnet' | 'testnet') || 'testnet',
  lightwalletdUrl: import.meta.env.VITE_LIGHTWALLETD_URL || 'https://testnet.lightwalletd.com:9067',
  zincTreasuryAddress: import.meta.env.VITE_ZINC_TREASURY_ADDRESS || 't1VShSWJZT9yDtGLp8vkyRUxVnb7i8d3zWp',
  zincMinTip: parseInt(import.meta.env.VITE_ZINC_MIN_TIP || '150000', 10),
};

export const NETWORK_CONFIG = {
  mainnet: {
    name: 'Mainnet',
    chainId: 'zcash-main',
    lightwalletdUrl: 'https://mainnet.lightwalletd.com:9067',
    explorer: 'https://explorer.zcha.in',
  },
  testnet: {
    name: 'Testnet',
    chainId: 'zcash-test',
    lightwalletdUrl: 'https://testnet.lightwalletd.com:9067',
    explorer: 'https://explorer.testnet.z.cash',
  },
};

export const ZINC_PROTOCOL = {
  VERSION: '1',
  TREASURY_TIP_MIN: 150000, // zatoshis
  
  // ZRC-20 Constraints
  ZRC20_TICKER_MIN_LENGTH: 1,
  ZRC20_TICKER_MAX_LENGTH: 10,
  ZRC20_MAX_DECIMALS: 18,
  
  // NFT Constraints
  NFT_NAME_MAX_LENGTH: 100,
  NFT_CONTENT_MAX_LENGTH: 1000000, // 1MB
  
  // Supported protocols
  CONTENT_PROTOCOLS: ['ipfs', 'arweave', 'http', 'plaintext'] as const,
};

export const FEES = {
  DEFAULT_FEE_RATE: 1000, // zatoshis per 1000 bytes
  MIN_FEE: 1000, // zatoshis
};
