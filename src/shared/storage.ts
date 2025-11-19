import browser from 'webextension-polyfill';
import type { EncryptedData, WalletState } from '@/types/wallet';

const STORAGE_KEYS = {
  ENCRYPTED_SEED: 'encrypted_seed',
  WALLET_STATE: 'wallet_state',
  SETTINGS: 'settings',
  TRANSACTIONS: 'transactions',
  INSCRIPTIONS: 'inscriptions',
} as const;

/**
 * Saves encrypted seed to storage
 */
export async function saveEncryptedSeed(encrypted: EncryptedData): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.ENCRYPTED_SEED]: encrypted,
  });
}

/**
 * Retrieves encrypted seed from storage
 */
export async function getEncryptedSeed(): Promise<EncryptedData | null> {
  const result = await browser.storage.local.get(STORAGE_KEYS.ENCRYPTED_SEED);
  return result[STORAGE_KEYS.ENCRYPTED_SEED] || null;
}

/**
 * Saves wallet state to storage
 */
export async function saveWalletState(state: Partial<WalletState>): Promise<void> {
  const current = await getWalletState();
  await browser.storage.local.set({
    [STORAGE_KEYS.WALLET_STATE]: { ...current, ...state },
  });
}

/**
 * Retrieves wallet state from storage
 */
export async function getWalletState(): Promise<WalletState> {
  const result = await browser.storage.local.get(STORAGE_KEYS.WALLET_STATE);
  return result[STORAGE_KEYS.WALLET_STATE] || {
    isLocked: true,
    isInitialized: false,
    address: null,
    balance: 0,
    network: 'testnet',
  };
}

/**
 * Saves settings to storage
 */
export async function saveSetting<T>(key: string, value: T): Promise<void> {
  const settings = await getSettings();
  settings[key] = value;
  await browser.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: settings,
  });
}

/**
 * Retrieves settings from storage
 */
export async function getSettings(): Promise<Record<string, any>> {
  const result = await browser.storage.local.get(STORAGE_KEYS.SETTINGS);
  return result[STORAGE_KEYS.SETTINGS] || {};
}

/**
 * Retrieves a specific setting
 */
export async function getSetting<T>(key: string, defaultValue?: T): Promise<T> {
  const settings = await getSettings();
  return settings[key] !== undefined ? settings[key] : (defaultValue as T);
}

/**
 * Clears all wallet data (for logout/reset)
 */
export async function clearWalletData(): Promise<void> {
  await browser.storage.local.clear();
}

/**
 * Checks if wallet is initialized
 */
export async function isWalletInitialized(): Promise<boolean> {
  const seed = await getEncryptedSeed();
  return seed !== null;
}
