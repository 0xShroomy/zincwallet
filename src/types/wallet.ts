export interface WalletState {
  isLocked: boolean;
  isInitialized: boolean;
  address: string | null;
  balance: number; // in zatoshis
  network: 'mainnet' | 'testnet';
}

export interface UTXO {
  txid: string;
  vout: number;
  address: string;
  value: number; // zatoshis
  height: number;
  confirmations: number;
}

export interface Transaction {
  txid: string;
  type: 'send' | 'receive' | 'inscription';
  amount: number;
  fee: number;
  timestamp: number;
  confirmations: number;
  address: string;
  memo?: string;
}

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  salt: string;
}

export interface WalletConfig {
  network: 'mainnet' | 'testnet';
  lightwalletdUrl: string;
  zincTreasuryAddress: string;
  zincMinTip: number;
}
