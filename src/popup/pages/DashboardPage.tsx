import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import browser from 'webextension-polyfill';
import QRCode from 'qrcode';
import type { WalletState } from '@/types/wallet';
import { validateZcashAddress, validateZecAmount } from '@/utils/validation';
import InscriptionModal from '@/components/InscriptionModal';
import WalletSwitcher from '@/components/WalletSwitcher';
import SettingsMenu from '@/components/SettingsMenu';
import TransactionHistory from '@/components/TransactionHistory';
import NFTGallery from '@/components/NFTGallery';
import Toast from '@/components/Toast';
import ConnectedSites from '../components/ConnectedSites';
import type { ZRC20Token, NFTInscription } from '@/services/inscriptionIndexer';

interface Props {
  walletState: WalletState;
  onUpdate: () => void;
}

// Feature flag: Enable Create tab for inscription creation
// DISABLED FOR v1.0 LAUNCH: Inscription indexer and creation features are incomplete
// TODO: Enable in v1.1 after completing indexer integration
const ENABLE_CREATE_TAB = false;

export default function DashboardPage({ walletState, onUpdate }: Props) {
  const [view, setView] = useState<'tokens' | 'nfts' | 'activity' | 'create'>('tokens');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(0);
  const [showSend, setShowSend] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferToken, setTransferToken] = useState<ZRC20Token | null>(null);
  const [transferRecipient, setTransferRecipient] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [showNFTTransferModal, setShowNFTTransferModal] = useState(false);
  const [transferNFT, setTransferNFT] = useState<NFTInscription | null>(null);
  const [nftTransferRecipient, setNFTTransferRecipient] = useState('');
  const [nftTransferLoading, setNFTTransferLoading] = useState(false);
  const [nftTransferError, setNFTTransferError] = useState<string | null>(null);
  const [showConnectedSites, setShowConnectedSites] = useState(false);
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'success'>('idle');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [feeSpeed, setFeeSpeed] = useState<'slow' | 'standard' | 'fast'>('standard');
  const [feeEstimates, setFeeEstimates] = useState<any>(null);
  const [estimatingFee, setEstimatingFee] = useState(false);
  
  const [showInscription, setShowInscription] = useState<string | null>(null);
  const [inscriptionData, setInscriptionData] = useState<Record<string, string>>({});
  const [inscriptionStatus, setInscriptionStatus] = useState<'idle' | 'creating' | 'success'>('idle');
  const [inscriptionError, setInscriptionError] = useState<string | null>(null);
  const [selectedProtocol, setSelectedProtocol] = useState<'zinc' | 'zerdinals' | null>(null);
  
  // Toast notifications
  const [toast, setToast] = useState<{message: string; type: 'success' | 'error' | 'info'} | null>(null);
  
  // Inscriptions state
  const [zrc20Tokens, setZrc20Tokens] = useState<ZRC20Token[]>([]);
  const [nfts, setNfts] = useState<NFTInscription[]>([]);
  const [loadingInscriptions, setLoadingInscriptions] = useState(false);
  
  // Active wallet info
  const [activeWalletName, setActiveWalletName] = useState<string>('My Wallet');
  
  // USD price state
  const [zecPriceUsd, setZecPriceUsd] = useState<number | null>(null);
  const [isLoadingPrice, setIsLoadingPrice] = useState(true);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  
  // Function to fetch ZEC price from Binance
  async function fetchZecPrice() {
    try {
      setIsLoadingPrice(true);
      const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=ZECUSDT');
      const data = await response.json();
      if (data.price) {
        setZecPriceUsd(parseFloat(data.price));
      }
    } catch (error) {
      console.error('Failed to fetch ZEC price:', error);
    } finally {
      setIsLoadingPrice(false);
    }
  }
  
  // Function to fetch active wallet info
  async function fetchActiveWalletName() {
    try {
      const response = await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'GET_WALLETS',
        data: {},
      });
      
      if (response.success && response.wallets) {
        const activeWallet = response.wallets.find((w: any) => w.id === response.activeWalletId);
        if (activeWallet) {
          setActiveWalletName(activeWallet.name);
        }
      }
    } catch (error) {
      console.error('Failed to fetch wallet info:', error);
    }
  }
  
  // Fetch on mount and when wallet updates
  useEffect(() => {
    fetchActiveWalletName();
  }, [walletState.address, walletState]); // Re-fetch when address changes or wallet state updates
  
  // Function to check for pending toast messages
  const checkPendingToast = async () => {
    try {
      const result = await browser.storage.local.get('pendingToast');
      if (result.pendingToast) {
        const { message, type, timestamp} = result.pendingToast;
        
        // Only show if less than 5 seconds old
        if (Date.now() - timestamp < 5000) {
          setToast({ message, type: type as 'success' | 'error' | 'info' });
        }
        
        // Clear the pending toast
        await browser.storage.local.remove('pendingToast');
      }
    } catch (error) {
      console.error('Failed to check pending toast:', error);
    }
  };
  
  // Check for pending toast messages (from approval pages) on mount
  useEffect(() => {
    checkPendingToast();
  }, []); // Run ONCE on mount only
  
  // Fetch inscriptions when network changes or wallet unlocks
  useEffect(() => {
    if (walletState.address && !walletState.isLocked) {
      loadInscriptions().catch(err => {
        console.error('Inscription loading failed in useEffect:', err);
        setToast({ message: 'Failed to load inscriptions', type: 'error' });
      });
    }
  }, [walletState.network, walletState.address, walletState.isLocked]); // Re-fetch when network/wallet changes
  
  // Auto-fetch balance when wallet opens/unlocks + poll for updates
  useEffect(() => {
    if (walletState.address && !walletState.isLocked) {
      setIsLoadingBalance(true);
      
      // Trigger actual balance refresh from blockchain if balance is 0 or stale
      const shouldRefresh = walletState.balance === 0 || !lastRefreshTime;
      if (shouldRefresh) {
        console.log('[Dashboard] Balance is 0 or stale, triggering refresh from blockchain...');
        browser.runtime.sendMessage({
          type: 'WALLET_ACTION',
          action: 'REFRESH_BALANCE',
          data: {},
        }).catch(err => {
          console.error('[Dashboard] Initial balance refresh failed:', err);
        });
      }
      
      onUpdate(); // Also reload from storage
      
      // Poll for balance updates every 500ms for up to 5 seconds
      let pollCount = 0;
      const pollInterval = setInterval(() => {
        pollCount++;
        console.log('[Dashboard] Polling for balance update...', pollCount);
        onUpdate();
        
        if (pollCount >= 10) {
          // Stop polling after 5 seconds (10 * 500ms)
          clearInterval(pollInterval);
          setIsLoadingBalance(false);
        }
      }, 500);
      
      return () => clearInterval(pollInterval);
    }
  }, [walletState.address, walletState.isLocked]); // Run ONCE on mount only
  
  // Stop loading when balance updates (with smooth transition delay)
  useEffect(() => {
    console.log('[Dashboard] Balance prop changed:', walletState.balance, 'zatoshis =', (walletState.balance / 100000000).toFixed(8), 'ZEC');
    
    if (walletState.balance > 0 && isLoadingBalance) {
      // Balance loaded! Wait a moment for smooth transition
      console.log('[Dashboard] Balance > 0, stopping skeleton loader');
      const smoothTransition = setTimeout(() => {
        setIsLoadingBalance(false);
      }, 300); // 300ms delay for smooth UX
      return () => clearTimeout(smoothTransition);
    }
  }, [walletState.balance, isLoadingBalance]);
  
  // Fetch ZEC price on mount and refresh every 5 minutes
  useEffect(() => {
    fetchZecPrice();
    const interval = setInterval(fetchZecPrice, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(interval);
  }, []);

  async function handleExpandView() {
    // Open extension in a popup window positioned on the right side
    try {
      const url = browser.runtime.getURL('src/popup/index.html');
      
      // Get screen dimensions
      const screenWidth = window.screen.availWidth;
      const screenHeight = window.screen.availHeight;
      
      // Create popup window on the right side
      await browser.windows.create({
        url,
        type: 'popup',
        width: 400,
        height: screenHeight - 100,
        left: screenWidth - 420,
        top: 50,
        focused: true
      });
    } catch (error) {
      console.error('Failed to open expanded view:', error);
      // Fallback: open in new tab
      const url = browser.runtime.getURL('src/popup/index.html');
      await browser.tabs.create({ url });
    }
  }

  async function handleSync() {
    // Rate limiting: 30 seconds between refreshes
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime;
    const RATE_LIMIT = 30000; // 30 seconds
    
    if (timeSinceLastRefresh < RATE_LIMIT && lastRefreshTime > 0) {
      const remainingSeconds = Math.ceil((RATE_LIMIT - timeSinceLastRefresh) / 1000);
      
      // Show prominent notification about cooldown
      setToast({ 
        message: `Please wait ${remainingSeconds} seconds before refreshing`, 
        type: 'info' 
      });
      
      // Briefly flash the button to show it was clicked
      setIsRefreshing(true);
      setTimeout(() => setIsRefreshing(false), 200);
      
      return;
    }
    
    setIsRefreshing(true);
    setLastRefreshTime(now);
    
    // Track start time for minimum spinner duration
    const startTime = Date.now();
    
    try {
      const response = await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'REFRESH_BALANCE',
        data: {},
      });
      onUpdate();
      
      // Show success toast
      if (response && !response.error) {
        setToast({ message: 'Wallet updated', type: 'success' });
      }
    } catch (error) {
      setToast({ message: 'Failed to refresh', type: 'error' });
    } finally {
      // Ensure spinner shows for at least 800ms for better visibility
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 800 - elapsed);
      
      setTimeout(() => {
        setIsRefreshing(false);
      }, remaining);
    }
  }

  async function handleCopyAddress() {
    if (walletState.address) {
      await navigator.clipboard.writeText(walletState.address);
      setToast({ message: 'Address copied to clipboard', type: 'success' });
    }
  }

  async function generateQRCode(address: string) {
    try {
      const qrDataUrl = await QRCode.toDataURL(address, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
      setQrCodeDataUrl(qrDataUrl);
    } catch (error) {
      console.error('Failed to generate QR code:', error);
    }
  }

  async function handleTransferToken() {
    if (!transferToken) return;
    
    setTransferError(null);
    setTransferLoading(true);
    
    try {
      // Validate recipient address
      if (!validateZcashAddress(transferRecipient)) {
        throw new Error('Invalid recipient address');
      }
      
      // Validate amount
      const amount = parseInt(transferAmount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Invalid amount');
      }
      
      if (amount > transferToken.balance) {
        throw new Error(`Insufficient balance. You have ${transferToken.balance} ${transferToken.tick}`);
      }
      
      // Send transfer request to background
      const response = await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'TRANSFER_ZRC20',
        data: {
          deployTxid: transferToken.deployTxid,
          amount: amount,
          to: transferRecipient
        }
      });
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      // Success!
      setToast({ 
        message: `Successfully sent ${amount} ${transferToken.tick}!`, 
        type: 'success' 
      });
      
      // Close modal and refresh
      setShowTransferModal(false);
      setTransferToken(null);
      setTransferRecipient('');
      setTransferAmount('');
      
      // Refresh balances
      await handleSync();
      
    } catch (error: any) {
      setTransferError(error.message || 'Transfer failed');
    } finally {
      setTransferLoading(false);
    }
  }

  async function handleTransferNFT() {
    if (!transferNFT) return;
    
    setNFTTransferError(null);
    setNFTTransferLoading(true);
    
    try {
      // Validate recipient address
      if (!validateZcashAddress(nftTransferRecipient)) {
        throw new Error('Invalid recipient address');
      }
      
      // Send transfer request to background
      const response = await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'TRANSFER_NFT',
        data: {
          inscriptionTxid: transferNFT.txid,
          to: nftTransferRecipient
        }
      });
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      // Success!
      setToast({ 
        message: `Successfully sent NFT!`, 
        type: 'success' 
      });
      
      // Close modal and refresh
      setShowNFTTransferModal(false);
      setTransferNFT(null);
      setNFTTransferRecipient('');
      
      // Refresh inscriptions
      await loadInscriptions();
      
    } catch (error: any) {
      setNFTTransferError(error.message || 'Transfer failed');
    } finally {
      setNFTTransferLoading(false);
    }
  }

  useEffect(() => {
    if (showReceive && walletState.address) {
      generateQRCode(walletState.address);
    }
  }, [showReceive, walletState.address]);

  async function loadInscriptions() {
    if (!walletState.address) return;
    
    setLoadingInscriptions(true);
    try {
      const response = await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'GET_INSCRIPTIONS',
        data: { address: walletState.address },
      });

      if (response.success) {
        setZrc20Tokens(response.zrc20 || []);
        setNfts(response.nfts || []);
      }
    } catch (error) {
      console.error('Failed to load inscriptions:', error);
      setToast({ message: 'Failed to load inscriptions', type: 'error' });
    } finally {
      setLoadingInscriptions(false);
    }
  }

  async function handleInscriptionSubmit(e: FormEvent) {
    e.preventDefault();
    setInscriptionStatus('creating');
    setInscriptionError(null);

    try {
      const response = await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'CREATE_INSCRIPTION',
        data: {
          type: showInscription,
          payload: inscriptionData,
        },
      });

      if (response.success) {
        setInscriptionStatus('success');
        setTimeout(() => {
          setShowInscription(null);
          setInscriptionStatus('idle');
          setInscriptionData({});
          onUpdate();
        }, 2000);
      } else {
        setInscriptionError(response.error || 'Failed to create inscription');
        setInscriptionStatus('idle');
      }
    } catch (error: any) {
      setInscriptionError(error.message || 'Unknown error');
      setInscriptionStatus('idle');
    }
  }

  function handleAddressChange(value: string) {
    setSendTo(value);
    
    // Validate as user types (if not empty)
    if (value.trim()) {
      const validation = validateZcashAddress(value);
      setAddressError(validation.valid ? null : validation.error || null);
    } else {
      setAddressError(null);
    }
  }

  function handleAmountChange(value: string) {
    setSendAmount(value);
    
    // Validate amount (if not empty)
    if (value.trim()) {
      const validation = validateZecAmount(value, walletState.balance);
      setAmountError(validation.valid ? null : validation.error || null);
    } else {
      setAmountError(null);
    }
  }


  async function handleProceedToConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    console.log('[Dashboard] Continue clicked, sendTo:', sendTo, 'sendAmount:', sendAmount);
    setSendError(null);
    setAddressError(null);
    setAmountError(null);

    // Final validation before showing confirmation
    const addressValidation = validateZcashAddress(sendTo);
    if (!addressValidation.valid) {
      console.log('[Dashboard] Address validation failed:', addressValidation.error);
      setAddressError(addressValidation.error || 'Invalid address');
      return;
    }

    const amountValidation = validateZecAmount(sendAmount, walletState.balance);
    if (!amountValidation.valid) {
      console.log('[Dashboard] Amount validation failed:', amountValidation.error);
      setAmountError(amountValidation.error || 'Invalid amount');
      return;
    }

    // Estimate fees now if not already done
    if (!feeEstimates) {
      console.log('[Dashboard] No fee estimates yet, estimating now...');
      setEstimatingFee(true);
      
      try {
        const response = await browser.runtime.sendMessage({
          type: 'WALLET_ACTION',
          action: 'ESTIMATE_FEE',
          data: {
            to: sendTo || 't1placeholder',
            amountZec: Number(sendAmount),
          },
        });
        
        console.log('[Dashboard] Fee estimation response:', response);
        
        if (!response.success || !response.fees) {
          console.log('[Dashboard] Fee estimation failed:', response.error);
          setSendError(response.error || 'Failed to estimate transaction fees. Please try again.');
          setEstimatingFee(false);
          return;
        }
        
        // Set fees and immediately proceed
        setFeeEstimates(response.fees);
        console.log('[Dashboard] Fees estimated, proceeding to confirmation');
      } catch (error: any) {
        console.error('[Dashboard] Fee estimation error:', error);
        setSendError('Failed to estimate transaction fees. Please try again.');
        setEstimatingFee(false);
        return;
      } finally {
        setEstimatingFee(false);
      }
    }

    // Show confirmation modal
    console.log('[Dashboard] All validation passed, showing confirmation');
    setShowConfirmation(true);
  }

  async function confirmSendTransaction() {
    setShowConfirmation(false);
    setSendStatus('sending');

    try {
      const selectedFeeRate = feeEstimates?.[feeSpeed]?.rate || 2;
      
      const result = await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'SEND_ZEC',
        data: {
          to: sendTo.trim(),
          amountZec: Number(sendAmount),
          feeRate: selectedFeeRate,
        },
      });

      if (result && result.success) {
        setSendStatus('success');
        setSendAmount('');
        setSendTo('');
        setFeeEstimates(null);
        setFeeSpeed('standard');
        setToast({ message: 'Transaction sent successfully!', type: 'success' });
        onUpdate();
      } else {
        setSendStatus('idle');
        setSendError(result?.error || 'Failed to send transaction');
        setToast({ message: result?.error || 'Transaction failed', type: 'error' });
      }
    } catch (error: any) {
      setSendStatus('idle');
      setSendError(error?.message || 'Failed to send transaction');
      setToast({ message: 'Transaction failed', type: 'error' });
    }
  }

  const balanceZEC = (walletState.balance / 100000000).toFixed(8);

  return (
    <div className="min-h-screen bg-zinc-black">
      {/* Header */}
      <div className="bg-zinc-darker border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowWalletMenu(true)}
            className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800 rounded-lg transition-colors text-white hover:text-amber-500 max-w-[180px]"
            title={activeWalletName}
          >
            <span className="text-sm font-medium truncate">{activeWalletName}</span>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowConnectedSites(true)}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-amber-500"
              title="Connected Sites"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            </button>
            <button
              onClick={handleSync}
              disabled={isRefreshing}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-amber-500 disabled:opacity-50"
              title="Refresh"
            >
              <svg 
                className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={() => setShowSettingsMenu(true)}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-amber-500"
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Balance Card - Always Visible */}
      <div className="p-6 pb-4">
        <div className="card text-center">
          <p className="text-xs text-zinc-400 mb-1">Total Balance</p>
          
          {isLoadingBalance || isLoadingPrice ? (
            // Loading skeleton
            <>
              <div className="h-8 bg-zinc-700 rounded animate-pulse mb-2 mx-auto w-48"></div>
              <div className="h-5 bg-zinc-700 rounded animate-pulse mb-2 mx-auto w-24"></div>
            </>
          ) : (
            // Actual data
            <>
              <p className="text-2xl font-bold text-white mb-1">{balanceZEC} <span className="text-lg">ZEC</span></p>
              {zecPriceUsd && (
                <p className="text-sm text-zinc-400 mb-2">
                  ≈ ${(walletState.balance / 100000000 * zecPriceUsd).toFixed(2)} USD
                </p>
              )}
            </>
          )}
          
          {/* <div className="bg-zinc-800 p-2 rounded-lg mb-3 border border-zinc-700">
            <p className="text-xs text-zinc-400 mb-1">Your Address</p>
            <p className="font-mono text-xs break-all text-amber-500">{walletState.address}</p>
          </div> */}

          {/* Modern Action Buttons */}
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              type="button"
              onClick={() => setShowReceive(true)}
              className="flex flex-col items-center justify-center gap-1.5 w-20 h-20 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-all hover:scale-105 border border-zinc-700 hover:border-amber-500/50"
            >
              <div className="w-9 h-9 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-700">
                <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              <span className="text-xs font-medium text-white">Receive</span>
            </button>
            
            <button
              type="button"
              onClick={() => {
                setShowSend(true);
                setSendError(null);
                setSendStatus('idle');
              }}
              className="flex flex-col items-center justify-center gap-1.5 w-20 h-20 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-all hover:scale-105 border border-zinc-700 hover:border-amber-500/50"
            >
              <div className="w-9 h-9 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-700">
                <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </div>
              <span className="text-xs font-medium text-white">Send</span>
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs - MetaMask Style */}
      <div className="bg-zinc-darker border-t border-b border-zinc-800 px-6">
        <div className="flex gap-4">
          <button
            onClick={() => setView('tokens')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              view === 'tokens'
                ? 'border-amber-500 text-amber-500'
                : 'border-transparent text-zinc-400 hover:text-amber-500'
            }`}
          >
            Tokens
          </button>
          <button
            onClick={() => setView('nfts')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              view === 'nfts'
                ? 'border-amber-500 text-amber-500'
                : 'border-transparent text-zinc-400 hover:text-amber-500'
            }`}
          >
            NFTs
          </button>
          <button
            onClick={() => setView('activity')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              view === 'activity'
                ? 'border-amber-500 text-amber-500'
                : 'border-transparent text-zinc-400 hover:text-amber-500'
            }`}
          >
            Activity
          </button>
          {ENABLE_CREATE_TAB && (
            <button
              onClick={() => setView('create')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                view === 'create'
                  ? 'border-amber-500 text-amber-500'
                  : 'border-transparent text-zinc-400 hover:text-amber-500'
              }`}
            >
              Create
            </button>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-6 pt-4">
        {view === 'tokens' && (
          <div className="card">
            <h3 className="font-bold mb-4 text-white">My Tokens</h3>
            <div className="space-y-2">
              {/* ZEC - Native Token */}
              <div 
                onClick={() => setShowSend(true)}
                className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 hover:border-amber-500 hover:bg-zinc-800 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 flex items-center justify-center">
                      <img 
                        src="/icons/zcash-zec-logo.svg" 
                        alt="Zcash" 
                        className="w-10 h-10"
                      />
                    </div>
                    <div>
                      <h4 className="font-semibold text-white flex items-center gap-2">
                        ZEC
                        <span className="text-[0.65rem] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">Native</span>
                      </h4>
                      <p className="text-xs text-zinc-500">Zcash</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {isLoadingBalance ? (
                      <>
                        <div className="h-5 bg-zinc-700 rounded animate-pulse mb-1 w-24 ml-auto"></div>
                        <div className="h-4 bg-zinc-700 rounded animate-pulse w-16 ml-auto"></div>
                      </>
                    ) : (
                      <>
                        <p className="text-white font-semibold">
                          {(walletState.balance / 100000000).toFixed(8)}
                        </p>
                        <p className="text-xs text-zinc-500">
                          ≈ ${((walletState.balance / 100000000) * (zecPriceUsd || 0)).toFixed(2)}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
              
              {/* ZRC-20 Tokens */}
              {zrc20Tokens.map((token) => (
                <div
                  key={token.tick}
                  onClick={() => {
                    setTransferToken(token);
                    setShowTransferModal(true);
                    setTransferRecipient('');
                    setTransferAmount('');
                    setTransferError(null);
                  }}
                  className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 hover:border-amber-500 hover:bg-zinc-800 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                        <span className="text-amber-400 font-bold text-sm">
                          {token.tick.slice(0, 2)}
                        </span>
                      </div>
                      <div>
                        <h4 className="font-semibold text-white">{token.tick}</h4>
                        <p className="text-xs text-zinc-500">ZRC-20</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-semibold">
                        {token.balance.toLocaleString()}
                      </p>
                      <p className="text-xs text-zinc-500">Balance</p>
                    </div>
                  </div>
                </div>
              ))}
              
              {zrc20Tokens.length === 0 && (
                <div className="text-center py-6 mt-2">
                  <p className="text-zinc-400 text-sm mb-1">No ZRC-20 tokens yet</p>
                  <p className="text-xs text-zinc-500">Deploy or mint tokens to see them here</p>
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'nfts' && (
          <NFTGallery 
            nfts={nfts} 
            onRefresh={loadInscriptions}
            onSendNFT={(nft) => {
              setTransferNFT(nft);
              setShowNFTTransferModal(true);
              setNFTTransferRecipient('');
              setNFTTransferError(null);
            }}
          />
        )}

        {view === 'activity' && (
          <TransactionHistory 
            walletAddress={walletState.address || ''} 
            isRefreshing={isRefreshing}
            network={walletState.network}
          />
        )}

        {ENABLE_CREATE_TAB && view === 'create' && !selectedProtocol && (
          <div className="card">
            <h3 className="font-bold mb-4 text-white">Select Protocol</h3>
            <p className="text-sm text-zinc-400 mb-4">Choose which inscription protocol to use</p>
            
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setSelectedProtocol('zinc')}
                className="p-6 hover:bg-zinc-800 rounded-lg border-2 border-zinc-700 hover:border-amber-500 transition-colors text-center"
              >
                <p className="font-bold text-white mb-2">Zinc</p>
                <p className="text-xs text-zinc-400">Uses OP_RETURN for efficient binary encoding</p>
              </button>
              
              <button
                onClick={() => setSelectedProtocol('zerdinals')}
                className="p-6 hover:bg-zinc-800 rounded-lg border-2 border-zinc-700 hover:border-amber-500 transition-colors text-center"
              >
                <p className="font-bold text-white mb-2">Zerdinals</p>
                <p className="text-xs text-zinc-400">Uses ScriptSig envelope like Bitcoin Ordinals</p>
              </button>
            </div>
          </div>
        )}
        
        {ENABLE_CREATE_TAB && view === 'create' && selectedProtocol === 'zinc' && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">Zinc Protocol</h3>
              <button
                onClick={() => setSelectedProtocol(null)}
                className="text-sm text-zinc-400 hover:text-white"
              >
                ← Back
              </button>
            </div>
            <div className="space-y-2">
              <button 
                onClick={() => { setShowInscription('zrc20-deploy'); setInscriptionData({}); setInscriptionError(null); }}
                className="w-full text-left p-3 hover:bg-zinc-800 rounded-lg border border-zinc-700 hover:border-amber-500 transition-colors"
              >
                <p className="font-medium text-white">Deploy ZRC-20 Token</p>
                <p className="text-xs text-zinc-400">Create a new fungible token</p>
              </button>
              <button 
                onClick={() => { setShowInscription('zrc20-mint'); setInscriptionData({}); setInscriptionError(null); }}
                className="w-full text-left p-3 hover:bg-zinc-800 rounded-lg border border-zinc-700 hover:border-amber-500 transition-colors"
              >
                <p className="font-medium text-white">Mint ZRC-20 Token</p>
                <p className="text-xs text-zinc-400">Mint existing token</p>
              </button>
              <button 
                onClick={() => { setShowInscription('nft-deploy'); setInscriptionData({}); setInscriptionError(null); }}
                className="w-full text-left p-3 hover:bg-zinc-800 rounded-lg border border-zinc-700 hover:border-amber-500 transition-colors"
              >
                <p className="font-medium text-white">Deploy NFT Collection</p>
                <p className="text-xs text-zinc-400">Create a new NFT collection</p>
              </button>
              <button 
                onClick={() => { setShowInscription('nft-mint'); setInscriptionData({}); setInscriptionError(null); }}
                className="w-full text-left p-3 hover:bg-zinc-800 rounded-lg border border-zinc-700 hover:border-amber-500 transition-colors"
              >
                <p className="font-medium text-white">Mint NFT</p>
                <p className="text-xs text-zinc-400">Create an NFT inscription</p>
              </button>
            </div>
          </div>
        )}
        
        {ENABLE_CREATE_TAB && view === 'create' && selectedProtocol === 'zerdinals' && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">Zerdinals Protocol</h3>
              <button
                onClick={() => setSelectedProtocol(null)}
                className="text-sm text-zinc-400 hover:text-white"
              >
                ← Back
              </button>
            </div>
            <div className="space-y-2">
              <button 
                onClick={() => { setShowInscription('zerdinals-zrc20-deploy'); setInscriptionData({}); setInscriptionError(null); }}
                className="w-full text-left p-3 hover:bg-zinc-800 rounded-lg border border-zinc-700 hover:border-amber-500 transition-colors"
              >
                <p className="font-medium text-white">Deploy ZRC-20 Token</p>
                <p className="text-xs text-zinc-400">Create fungible token (JSON format)</p>
              </button>
              <button 
                onClick={() => { setShowInscription('zerdinals-zrc20-mint'); setInscriptionData({}); setInscriptionError(null); }}
                className="w-full text-left p-3 hover:bg-zinc-800 rounded-lg border border-zinc-700 hover:border-amber-500 transition-colors"
              >
                <p className="font-medium text-white">Mint ZRC-20 Token</p>
                <p className="text-xs text-zinc-400">Mint existing token (JSON format)</p>
              </button>
              <button 
                onClick={() => { setShowInscription('zerdinals-text'); setInscriptionData({}); setInscriptionError(null); }}
                className="w-full text-left p-3 hover:bg-zinc-800 rounded-lg border border-zinc-700 hover:border-amber-500 transition-colors"
              >
                <p className="font-medium text-white">Inscribe Text</p>
                <p className="text-xs text-zinc-400">Plain text inscription</p>
              </button>
              <button 
                onClick={() => { setShowInscription('zerdinals-json'); setInscriptionData({}); setInscriptionError(null); }}
                className="w-full text-left p-3 hover:bg-zinc-800 rounded-lg border border-zinc-700 hover:border-amber-500 transition-colors"
              >
                <p className="font-medium text-white">Inscribe JSON</p>
                <p className="text-xs text-zinc-400">Structured data inscription</p>
              </button>
              <button 
                onClick={() => { setShowInscription('zerdinals-image'); setInscriptionData({}); setInscriptionError(null); }}
                className="w-full text-left p-3 hover:bg-zinc-800 rounded-lg border border-zinc-700 hover:border-amber-500 transition-colors"
              >
                <p className="font-medium text-white">Inscribe Image</p>
                <p className="text-xs text-zinc-400">Image inscription (base64)</p>
              </button>
            </div>
          </div>
        )}
      </div>

      {showSend && !showConfirmation && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-darker border border-zinc-700 rounded-xl w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-zinc-700">
              <h2 className="text-lg font-semibold text-white">Send ZEC</h2>
            </div>
            <form className="flex flex-col flex-1 min-h-0" onSubmit={handleProceedToConfirmation}>
              <div className="overflow-y-auto px-4 py-3 space-y-3">
                {/* Show address/amount inputs ONLY when fees are not yet estimated */}
                {!feeEstimates ? (
                  <>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Recipient address</label>
                      <input
                        className={`input text-sm ${addressError ? 'border-red-500 focus:border-red-500' : ''}`}
                        value={sendTo}
                        onChange={(e) => handleAddressChange(e.target.value)}
                        placeholder="t1..."
                      />
                      {addressError && (
                        <p className="text-xs text-red-400 mt-1">{addressError}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">Amount (ZEC)</label>
                      <input
                        className={`input text-sm ${amountError ? 'border-red-500 focus:border-red-500' : ''}`}
                        value={sendAmount}
                        onChange={(e) => handleAmountChange(e.target.value)}
                        placeholder="0.001"
                      />
                      {amountError && (
                        <p className="text-xs text-red-400 mt-1">{amountError}</p>
                      )}
                    </div>
                  </>
                ) : (
                  /* Fee Selection UI - hide address/amount inputs */
                  <>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1.5">Transaction Speed</label>
                      <div className="space-y-1.5">
                        {(['slow', 'standard', 'fast'] as const).map((speed) => (
                          <label
                            key={speed}
                            className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                              feeSpeed === speed
                                ? 'border-amber-500 bg-amber-500/10'
                                : 'border-zinc-700 hover:border-zinc-600 bg-zinc-800/50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {/* Custom Radio Button */}
                              <div className={`relative w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                feeSpeed === speed ? 'border-amber-500' : 'border-zinc-500'
                              }`}>
                                {feeSpeed === speed && (
                                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                                )}
                                <input
                                  type="radio"
                                  name="feeSpeed"
                                  value={speed}
                                  checked={feeSpeed === speed}
                                  onChange={() => setFeeSpeed(speed)}
                                  className="absolute inset-0 opacity-0 cursor-pointer"
                                />
                              </div>
                              <div>
                                <div className="text-sm font-medium text-white capitalize">{speed}</div>
                                <div className="text-xs text-zinc-400">{feeEstimates[speed].estimatedTime}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium text-white">
                                {(feeEstimates[speed].zatoshis / 100000000).toFixed(8)} ZEC
                              </div>
                              <div className="text-xs text-zinc-500">
                                ${((feeEstimates[speed].zatoshis / 100000000) * (zecPriceUsd || 0)).toFixed(4)}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="bg-zinc-800 rounded-lg p-2.5 space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-400">Amount</span>
                        <span className="text-white">{sendAmount} ZEC</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-400">Network Fee</span>
                        <span className="text-white">
                          {(feeEstimates[feeSpeed].zatoshis / 100000000).toFixed(8)} ZEC
                        </span>
                      </div>
                      <div className="border-t border-zinc-700 pt-1.5 flex justify-between font-medium text-sm">
                        <span className="text-white">Total</span>
                        <span className="text-white">
                          {(Number(sendAmount) + (feeEstimates[feeSpeed].zatoshis / 100000000)).toFixed(8)} ZEC
                        </span>
                      </div>
                    </div>
                  </>
                )}
                
                {estimatingFee && (
                  <div className="text-center text-xs text-zinc-400">Calculating fees...</div>
                )}
                {sendError && (
                  <p className="text-xs text-red-500">{sendError}</p>
                )}
                {sendStatus === 'success' && (
                  <p className="text-xs text-emerald-400">Transaction submitted (experimental stub).</p>
                )}
              </div>

              <div className="p-4 border-t border-zinc-700 flex gap-2">
                <button
                  type="button"
                  className="flex-1 btn btn-secondary py-2"
                  onClick={() => {
                    if (feeEstimates) {
                      // Go back to input mode
                      setFeeEstimates(null);
                      setSendError(null);
                    } else {
                      // Cancel entirely
                      setShowSend(false);
                      setSendStatus('idle');
                      setSendError(null);
                    }
                  }}
                >
                  {feeEstimates ? 'Back' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="flex-1 btn btn-primary py-2"
                  disabled={sendStatus === 'sending' || estimatingFee || !!addressError || !!amountError}
                >
                  {estimatingFee ? 'Estimating...' : (feeEstimates ? 'Review Order' : 'Continue')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showConfirmation && feeEstimates && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-darker border border-zinc-700 rounded-xl w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-zinc-700">
              <h2 className="text-lg font-semibold text-white">Confirm Transaction</h2>
            </div>
            
            <div className="overflow-y-auto px-4 py-3 space-y-3">
              <div className="bg-amber-500/10 border border-amber-500/50 rounded-lg p-2.5">
                <p className="text-xs text-amber-400">⚠️ Review carefully before confirming</p>
              </div>

              <div className="bg-zinc-800 rounded-lg p-3 space-y-2.5">
                <div>
                  <p className="text-xs text-zinc-500">Sending to</p>
                  <p className="text-xs text-white font-mono break-all leading-tight mt-1">{sendTo}</p>
                </div>
                
                <div className="border-t border-zinc-700 pt-2.5">
                  <p className="text-xs text-zinc-500">Amount</p>
                  <p className="text-base text-white font-semibold">{sendAmount} ZEC</p>
                  <p className="text-xs text-zinc-500">≈ ${((Number(sendAmount) || 0) * (zecPriceUsd || 0)).toFixed(2)}</p>
                </div>
                
                <div className="border-t border-zinc-700 pt-2.5">
                  <p className="text-xs text-zinc-500">Network Fee ({feeSpeed})</p>
                  <p className="text-sm text-white">{(feeEstimates[feeSpeed].zatoshis / 100000000).toFixed(8)} ZEC</p>
                  <p className="text-xs text-zinc-500">≈ ${((feeEstimates[feeSpeed].zatoshis / 100000000) * (zecPriceUsd || 0)).toFixed(4)}</p>
                </div>
                
                <div className="border-t border-zinc-700 pt-2.5">
                  <p className="text-xs text-zinc-500">Total</p>
                  <p className="text-lg text-amber-400 font-bold">{(Number(sendAmount) + (feeEstimates[feeSpeed].zatoshis / 100000000)).toFixed(8)} ZEC</p>
                  <p className="text-xs text-zinc-500">≈ ${((Number(sendAmount) + (feeEstimates[feeSpeed].zatoshis / 100000000)) * (zecPriceUsd || 0)).toFixed(2)}</p>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-2.5">
                <p className="text-xs text-zinc-400"><span className="text-white font-medium">Note:</span> This transaction cannot be reversed once confirmed.</p>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-700 flex gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmation(false)}
                className="flex-1 btn btn-secondary py-2"
                disabled={sendStatus === 'sending'}
              >
                Back
              </button>
              <button
                type="button"
                onClick={confirmSendTransaction}
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                disabled={sendStatus === 'sending'}
              >
                {sendStatus === 'sending' ? 'Sending...' : 'Confirm & Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showReceive && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-darker border border-zinc-700 rounded-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-white mb-4 text-center">Receive ZEC</h2>
            <p className="text-xs text-zinc-400 mb-4 text-center">Share this address to receive ZEC</p>
            
            {qrCodeDataUrl && (
              <div className="flex justify-center mb-4">
                <div className="bg-white p-3 rounded-lg">
                  <img 
                    src={qrCodeDataUrl} 
                    alt="QR Code" 
                    className="w-48 h-48"
                  />
                </div>
              </div>
            )}
            
            <p className="font-mono text-xs break-all text-amber-500 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 mb-4 text-center leading-tight">
              {walletState.address}
            </p>
            
            <div className="flex justify-center gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCopyAddress}
              >
                Copy address
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowReceive(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showTransferModal && transferToken && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-darker border border-zinc-700 rounded-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-white mb-4">Send {transferToken.tick}</h2>
            <p className="text-xs text-zinc-400 mb-4">
              Balance: {transferToken.balance.toLocaleString()} {transferToken.tick}
            </p>
            
            <div className="space-y-4">
              {transferError && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
                  <p className="text-sm text-red-400">{transferError}</p>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Recipient Address
                </label>
                <input
                  type="text"
                  value={transferRecipient}
                  onChange={(e) => setTransferRecipient(e.target.value)}
                  placeholder="t1..."
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none font-mono text-sm"
                  disabled={transferLoading}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Amount
                </label>
                <input
                  type="number"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="0"
                  min="1"
                  max={transferToken.balance}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
                  disabled={transferLoading}
                />
                <p className="text-xs text-zinc-500 mt-1">
                  Max: {transferToken.balance.toLocaleString()} {transferToken.tick}
                </p>
              </div>
              
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowTransferModal(false);
                    setTransferToken(null);
                    setTransferRecipient('');
                    setTransferAmount('');
                    setTransferError(null);
                  }}
                  className="flex-1 btn btn-secondary"
                  disabled={transferLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleTransferToken}
                  className="flex-1 btn btn-primary"
                  disabled={transferLoading || !transferRecipient || !transferAmount}
                >
                  {transferLoading ? 'Sending...' : `Send ${transferToken.tick}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNFTTransferModal && transferNFT && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-darker border border-zinc-700 rounded-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-white mb-4">Send NFT</h2>
            <p className="text-xs text-zinc-400 mb-4">
              {transferNFT.collection || transferNFT.contentType || 'Inscription'} #{transferNFT.id}
            </p>
            
            <div className="space-y-4">
              {nftTransferError && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
                  <p className="text-sm text-red-400">{nftTransferError}</p>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Recipient Address
                </label>
                <input
                  type="text"
                  value={nftTransferRecipient}
                  onChange={(e) => setNFTTransferRecipient(e.target.value)}
                  placeholder="t1..."
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none font-mono text-sm"
                  disabled={nftTransferLoading}
                />
              </div>
              
              <div className="bg-amber-500/10 border border-amber-500/50 rounded-lg p-3">
                <p className="text-xs text-amber-400">
                  ⚠️ This will transfer ownership of the NFT to the recipient address permanently.
                </p>
              </div>
              
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowNFTTransferModal(false);
                    setTransferNFT(null);
                    setNFTTransferRecipient('');
                    setNFTTransferError(null);
                  }}
                  className="flex-1 btn btn-secondary"
                  disabled={nftTransferLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleTransferNFT}
                  className="flex-1 btn btn-primary"
                  disabled={nftTransferLoading || !nftTransferRecipient}
                >
                  {nftTransferLoading ? 'Sending...' : 'Send NFT'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showWalletMenu && (
        <WalletSwitcher
          onClose={() => setShowWalletMenu(false)}
          onUpdate={onUpdate}
        />
      )}

      {showSettingsMenu && (
        <SettingsMenu
          onClose={() => setShowSettingsMenu(false)}
        />
      )}

      {showInscription && (
        <InscriptionModal
          type={showInscription}
          data={inscriptionData}
          onDataChange={setInscriptionData}
          onSubmit={handleInscriptionSubmit}
          onCancel={() => {
            setShowInscription(null);
            setInscriptionStatus('idle');
            setInscriptionError(null);
          }}
          status={inscriptionStatus}
          error={inscriptionError}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      
      {showConnectedSites && (
        <ConnectedSites 
          onClose={() => setShowConnectedSites(false)}
          onDisconnect={checkPendingToast}
        />
      )}
    </div>
  );
}
