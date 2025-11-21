import browser from 'webextension-polyfill';
import { WalletManager } from './wallet';
import { handleProviderRequest } from './provider-handler';
import type { ProviderRequest, ProviderResponse } from '@/types/provider';

const walletManager = new WalletManager();

// Initialize on install
browser.runtime.onInstalled.addListener(() => {
  console.log('Zync Wallet extension installed');
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
      return await walletManager.importWallet(data, data.password);
    
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
    
    case 'GET_TRANSACTIONS':
      return await handleGetTransactions(data);
    
    case 'GET_INSCRIPTIONS':
      return await handleGetInscriptions(data);
    
    case 'CREATE_INSCRIPTION':
      return await handleCreateInscription(data);
    
    default:
      throw new Error(`Unknown wallet action: ${action}`);
  }
}

async function handleGetTransactions(data: any) {
  try {
    const { address } = data;
    
    if (!address) {
      throw new Error('Address is required');
    }

    console.log('[Background] Fetching transactions for:', address);

    // TODO: Implement Blockchair API integration
    // For now, return empty array for new wallets
    return {
      success: true,
      transactions: []
    };
  } catch (error) {
    console.error('[Background] Failed to fetch transactions:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      transactions: []
    };
  }
}

async function handleGetInscriptions(data: any) {
  try {
    const { address } = data;
    
    if (!address) {
      throw new Error('Address is required');
    }

    console.log('[Background] Fetching inscriptions for:', address);

    // TODO: Query both Zinc and Zerdinals indexers
    return {
      success: true,
      zinc: {
        zrc20: [],
        nfts: []
      },
      zerdinals: {
        inscriptions: []
      }
    };
  } catch (error) {
    console.error('[Background] Failed to fetch inscriptions:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function handleCreateInscription(data: any) {
  try {
    // TODO: Implement inscription creation
    throw new Error('Inscription creation not yet implemented');
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

console.log('Zync Wallet background script loaded');
