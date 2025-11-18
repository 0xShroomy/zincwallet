import * as bip39 from 'bip39';
import type { WalletState } from '@/types/wallet';
import { encrypt, decrypt } from '@/shared/crypto';
import {
  saveEncryptedSeed,
  getEncryptedSeed,
  saveWalletState,
  getWalletState,
} from '@/shared/storage';
import { WebZjsWallet, deriveAddressFromMnemonic } from '@/shared/webzjs';
import { DEFAULT_CONFIG } from '@/shared/config';

export class WalletManager {
  private wallet: WebZjsWallet | null = null;
  private mnemonic: string | null = null;

  /**
   * Creates a new wallet with a generated mnemonic
   */
  async createWallet(password: string): Promise<{ mnemonic: string; address: string }> {
    // Generate 24-word mnemonic
    const mnemonic = bip39.generateMnemonic(256);
    
    // Encrypt and store
    const encrypted = await encrypt(mnemonic, password);
    await saveEncryptedSeed(encrypted);
    
    // Derive address
    const address = await deriveAddressFromMnemonic(mnemonic, DEFAULT_CONFIG.network);
    
    // Initialize wallet
    this.mnemonic = mnemonic;
    this.wallet = new WebZjsWallet(mnemonic, DEFAULT_CONFIG.network);
    await this.wallet.deriveAccount(0);
    
    // Save state
    await saveWalletState({
      isLocked: false,
      isInitialized: true,
      address,
      balance: 0,
      network: DEFAULT_CONFIG.network,
    });
    
    return { mnemonic, address };
  }

  /**
   * Imports an existing wallet from mnemonic
   */
  async importWallet(mnemonic: string, password: string): Promise<{ address: string }> {
    // Validate mnemonic
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }
    
    // Encrypt and store
    const encrypted = await encrypt(mnemonic, password);
    await saveEncryptedSeed(encrypted);
    
    // Derive address
    const address = await deriveAddressFromMnemonic(mnemonic, DEFAULT_CONFIG.network);
    
    // Initialize wallet
    this.mnemonic = mnemonic;
    this.wallet = new WebZjsWallet(mnemonic, DEFAULT_CONFIG.network);
    await this.wallet.deriveAccount(0);
    
    // Save state
    await saveWalletState({
      isLocked: false,
      isInitialized: true,
      address,
      balance: 0,
      network: DEFAULT_CONFIG.network,
    });
    
    return { address };
  }

  /**
   * Unlocks the wallet with password
   */
  async unlockWallet(password: string): Promise<{ address: string }> {
    const encrypted = await getEncryptedSeed();
    if (!encrypted) {
      throw new Error('No wallet found');
    }
    
    try {
      // Decrypt mnemonic
      const mnemonic = await decrypt(encrypted, password);
      
      // Initialize wallet
      this.mnemonic = mnemonic;
      this.wallet = new WebZjsWallet(mnemonic, DEFAULT_CONFIG.network);
      const account = await this.wallet.deriveAccount(0);
      
      // Update state
      await saveWalletState({
        isLocked: false,
        address: account.address,
      });
      
      // Sync wallet
      await this.sync();
      
      return { address: account.address };
    } catch (error) {
      throw new Error('Invalid password');
    }
  }

  /**
   * Locks the wallet
   */
  async lockWallet(): Promise<void> {
    this.mnemonic = null;
    this.wallet = null;
    
    await saveWalletState({
      isLocked: true,
    });
  }

  /**
   * Gets the current wallet state
   */
  async getState(): Promise<WalletState> {
    return await getWalletState();
  }

  /**
   * Gets the current wallet balance
   */
  async getBalance(): Promise<number> {
    if (!this.wallet) {
      throw new Error('Wallet not unlocked');
    }
    
    const balance = await this.wallet.getBalance();
    
    // Update state
    await saveWalletState({ balance });
    
    return balance;
  }

  /**
   * Syncs the wallet with the blockchain
   */
  async sync(): Promise<void> {
    if (!this.wallet) {
      throw new Error('Wallet not unlocked');
    }
    
    await this.wallet.sync();
    const balance = await this.wallet.getBalance();
    
    await saveWalletState({ balance });
  }

  /**
   * Gets the wallet instance (for transactions)
   */
  getWallet(): WebZjsWallet {
    if (!this.wallet) {
      throw new Error('Wallet not unlocked');
    }
    return this.wallet;
  }

  /**
   * Checks if wallet is unlocked
   */
  isUnlocked(): boolean {
    return this.wallet !== null;
  }
}
