import type { ProviderRequest, ProviderResponse } from '@/types/provider';
import type { WalletManager } from './wallet';
import { buildInscriptionTransaction } from './transactions';
import { 
  encodeZRC20Deploy, 
  encodeZRC20Mint, 
  encodeZRC20Transfer 
} from '@/shared/inscriptions/zrc20';
import { 
  encodeNFTCollectionDeploy, 
  encodeNFTMint 
} from '@/shared/inscriptions/nft';
import { DEFAULT_CONFIG } from '@/shared/config';
import type { InscriptionData } from '@/types/inscriptions';

/**
 * Handles provider API requests from dApps
 */
export async function handleProviderRequest(
  request: ProviderRequest,
  origin: string,
  walletManager: WalletManager
): Promise<ProviderResponse> {
  const { id, method, params } = request;
  
  try {
    // Check if wallet is unlocked
    if (!walletManager.isUnlocked() && method !== 'getNetwork') {
      throw new Error('Wallet is locked. Please unlock first.');
    }
    
    let result: any;
    
    switch (method) {
      case 'connect':
        result = await handleConnect(walletManager);
        break;
      
      case 'getAddress':
        result = await handleGetAddress(walletManager);
        break;
      
      case 'getBalance':
        result = await handleGetBalance(walletManager);
        break;
      
      case 'getNetwork':
        result = DEFAULT_CONFIG.network;
        break;
      
      case 'deployZrc20':
        result = await handleDeployZrc20(params, walletManager, origin);
        break;
      
      case 'mintZrc20':
        result = await handleMintZrc20(params, walletManager, origin);
        break;
      
      case 'transferZrc20':
        result = await handleTransferZrc20(params, walletManager, origin);
        break;
      
      case 'deployCollection':
        result = await handleDeployCollection(params, walletManager, origin);
        break;
      
      case 'mintNft':
        result = await handleMintNft(params, walletManager, origin);
        break;
      
      case 'getInscriptions':
        result = await handleGetInscriptions(walletManager);
        break;
      
      default:
        throw new Error(`Unknown method: ${method}`);
    }
    
    return {
      id,
      result,
    };
  } catch (error) {
    return {
      id,
      error: {
        code: -1,
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

async function handleConnect(walletManager: WalletManager): Promise<string> {
  const state = await walletManager.getState();
  if (!state.address) {
    throw new Error('No address available');
  }
  return state.address;
}

async function handleGetAddress(walletManager: WalletManager): Promise<string> {
  const state = await walletManager.getState();
  if (!state.address) {
    throw new Error('No address available');
  }
  return state.address;
}

async function handleGetBalance(walletManager: WalletManager): Promise<number> {
  return await walletManager.getBalance();
}

async function handleDeployZrc20(
  params: any,
  walletManager: WalletManager,
  origin: string
): Promise<string> {
  // Validate tip
  if (params.tip < DEFAULT_CONFIG.zincMinTip) {
    throw new Error(`Tip must be at least ${DEFAULT_CONFIG.zincMinTip} zatoshis`);
  }
  
  // Encode inscription
  const payload = encodeZRC20Deploy(params);
  
  const inscription: InscriptionData = {
    type: 'zrc20-deploy',
    payload,
    tip: params.tip,
  };
  
  // Request user confirmation (would open popup)
  // For now, auto-approve for testing
  const approved = true; // await requestUserApproval(inscription, origin);
  
  if (!approved) {
    throw new Error('User rejected the transaction');
  }
  
  // Build and broadcast transaction
  const wallet = walletManager.getWallet();
  const state = await walletManager.getState();
  
  const txid = await buildInscriptionTransaction({
    wallet,
    inscription,
    changeAddress: state.address!,
  });
  
  return txid;
}

async function handleMintZrc20(
  params: any,
  walletManager: WalletManager,
  origin: string
): Promise<string> {
  if (params.tip < DEFAULT_CONFIG.zincMinTip) {
    throw new Error(`Tip must be at least ${DEFAULT_CONFIG.zincMinTip} zatoshis`);
  }
  
  const payload = encodeZRC20Mint(params);
  
  const inscription: InscriptionData = {
    type: 'zrc20-mint',
    payload,
    tip: params.tip,
  };
  
  const wallet = walletManager.getWallet();
  const state = await walletManager.getState();
  
  const txid = await buildInscriptionTransaction({
    wallet,
    inscription,
    changeAddress: state.address!,
  });
  
  return txid;
}

async function handleTransferZrc20(
  params: any,
  walletManager: WalletManager,
  origin: string
): Promise<string> {
  if (params.tip < DEFAULT_CONFIG.zincMinTip) {
    throw new Error(`Tip must be at least ${DEFAULT_CONFIG.zincMinTip} zatoshis`);
  }
  
  const payload = encodeZRC20Transfer(params);
  
  const inscription: InscriptionData = {
    type: 'zrc20-transfer',
    payload,
    recipient: params.recipient,
    tip: params.tip,
  };
  
  const wallet = walletManager.getWallet();
  const state = await walletManager.getState();
  
  const txid = await buildInscriptionTransaction({
    wallet,
    inscription,
    changeAddress: state.address!,
  });
  
  return txid;
}

async function handleDeployCollection(
  params: any,
  walletManager: WalletManager,
  origin: string
): Promise<string> {
  if (params.tip < DEFAULT_CONFIG.zincMinTip) {
    throw new Error(`Tip must be at least ${DEFAULT_CONFIG.zincMinTip} zatoshis`);
  }
  
  const payload = encodeNFTCollectionDeploy(params);
  
  const inscription: InscriptionData = {
    type: 'nft-collection',
    payload,
    tip: params.tip,
  };
  
  const wallet = walletManager.getWallet();
  const state = await walletManager.getState();
  
  const txid = await buildInscriptionTransaction({
    wallet,
    inscription,
    changeAddress: state.address!,
  });
  
  return txid;
}

async function handleMintNft(
  params: any,
  walletManager: WalletManager,
  origin: string
): Promise<string> {
  if (params.tip < DEFAULT_CONFIG.zincMinTip) {
    throw new Error(`Tip must be at least ${DEFAULT_CONFIG.zincMinTip} zatoshis`);
  }
  
  const payload = encodeNFTMint(params);
  
  const inscription: InscriptionData = {
    type: 'nft-mint',
    payload,
    tip: params.tip,
  };
  
  const wallet = walletManager.getWallet();
  const state = await walletManager.getState();
  
  const txid = await buildInscriptionTransaction({
    wallet,
    inscription,
    changeAddress: state.address!,
  });
  
  return txid;
}

async function handleGetInscriptions(walletManager: WalletManager): Promise<any> {
  // Mock implementation
  // In production, query Zinc indexer API
  return {
    tokens: [],
    nfts: [],
  };
}
