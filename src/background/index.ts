import browser from 'webextension-polyfill';
import { WalletManager } from './wallet';
import { handleProviderRequest } from './provider-handler';
import type { ProviderRequest, ProviderResponse } from '@/types/provider';

const walletManager = new WalletManager();

// Initialize on install
browser.runtime.onInstalled.addListener(() => {
  console.log('Zinc Wallet extension installed');
});

// Handle messages from content script (provider API)
browser.runtime.onMessage.addListener(async (
  message: any,
  sender: browser.Runtime.MessageSender
) => {
  if (message.type === 'PROVIDER_REQUEST') {
    const request: ProviderRequest = message.data;
    const origin = sender.url || 'unknown';
    
    try {
      const response = await handleProviderRequest(request, origin, walletManager);
      return response;
    } catch (error) {
      const errorResponse: ProviderResponse = {
        id: request.id,
        error: {
          code: -1,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
      return errorResponse;
    }
  }
  
  if (message.type === 'WALLET_ACTION') {
    return handleWalletAction(message.action, message.data);
  }
  
  return null;
});

async function handleWalletAction(action: string, data: any) {
  switch (action) {
    case 'CREATE_WALLET':
      return await walletManager.createWallet(data.password);
    
    case 'IMPORT_WALLET':
      return await walletManager.importWallet(data.mnemonic, data.password);
    
    case 'UNLOCK_WALLET':
      return await walletManager.unlockWallet(data.password);
    
    case 'LOCK_WALLET':
      return await walletManager.lockWallet();
    
    case 'GET_STATE':
      return await walletManager.getState();
    
    case 'GET_BALANCE':
      return await walletManager.getBalance();
    
    case 'SYNC':
      return await walletManager.sync();
    
    default:
      throw new Error(`Unknown wallet action: ${action}`);
  }
}

console.log('Zinc Wallet background script loaded');
