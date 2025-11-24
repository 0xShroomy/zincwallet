import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import browser from 'webextension-polyfill';
import type { WalletState } from '@/types/wallet';
import InscriptionModal from '@/components/InscriptionModal';
import WalletSwitcher from '@/components/WalletSwitcher';
import SettingsMenu from '@/components/SettingsMenu';
import ConnectedSites from '../components/ConnectedSites';
import Toast from '@/components/Toast';
import TransactionHistory from '@/components/TransactionHistory';
import ZRC20List from '@/components/ZRC20List';
import NFTGallery from '@/components/NFTGallery';
import type { ZRC20Token, NFTInscription } from '@/services/inscriptionIndexer';

interface Props {
  walletState: WalletState;
  onUpdate: () => void;
}

// Feature flag: Enable Create tab for testing
// Set to false before launch to position wallet as infrastructure only
const ENABLE_CREATE_TAB = true;

export default function DashboardPage({ walletState, onUpdate }: Props) {
  const [view, setView] = useState<'tokens' | 'nfts' | 'activity' | 'create'>('tokens');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(0);
  const [showSend, setShowSend] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showConnectedSites, setShowConnectedSites] = useState(false);
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'success'>('idle');
  
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
      loadInscriptions();
    }
  }, [walletState.network, walletState.address, walletState.isLocked]); // Re-fetch when network/wallet changes
  
  // Auto-fetch balance when wallet opens/unlocks (once only)
  useEffect(() => {
    if (walletState.address && !walletState.isLocked) {
      setIsLoadingBalance(true);
      onUpdate(); // Trigger parent to refresh balance
      
      // Poll for balance updates for up to 5 seconds
      let pollCount = 0;
      const pollInterval = setInterval(() => {
        pollCount++;
        if (pollCount >= 10) { // 10 attempts * 500ms = 5 seconds
          clearInterval(pollInterval);
          return;
        }
        onUpdate(); // Keep refreshing until balance loads
      }, 500);
      
      return () => clearInterval(pollInterval);
    }
  }, []); // Run ONCE on mount only
  
  // Stop loading when balance updates (with smooth transition delay)
  useEffect(() => {
    // Only stop loading if we actually received data (non-zero or after delay)
    if (walletState.balance > 0) {
      // Balance loaded! Wait a moment for smooth transition
      const smoothTransition = setTimeout(() => {
        setIsLoadingBalance(false);
      }, 400); // 400ms delay for smooth UX
      return () => clearTimeout(smoothTransition);
    } else if (walletState.balance === 0) {
      // If balance is 0, wait longer to see if it updates
      const timer = setTimeout(() => {
        setIsLoadingBalance(false);
      }, 2000); // Wait 2 seconds max for actual 0 balance
      return () => clearTimeout(timer);
    }
  }, [walletState.balance]);
  
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
    try {
      if (walletState.address) {
        await navigator.clipboard.writeText(walletState.address);
        setToast({ message: 'Address copied to clipboard!', type: 'success' });
      }
    } catch (error) {
      console.error('Failed to copy address:', error);
      setToast({ message: 'Failed to copy address', type: 'error' });
    }
  }

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

  async function handleSendSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSendError(null);

    const to = sendTo.trim();
    if (!to) {
      setSendError('Enter a recipient address');
      return;
    }

    const amountNumber = Number(sendAmount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setSendError('Enter a valid amount in ZEC');
      return;
    }

    if (!walletState.address) {
      setSendError('Wallet address not available');
      return;
    }

    setSendStatus('sending');

    try {
      const result = await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'SEND_ZEC',
        data: {
          to,
          amountZec: amountNumber,
        },
      });

      if (result && result.success) {
        setSendStatus('success');
        setSendAmount('');
        onUpdate();
      } else {
        setSendStatus('idle');
        setSendError(result?.error || 'Sending ZEC is not available yet in this build');
      }
    } catch (error: any) {
      setSendStatus('idle');
      setSendError(error?.message || 'Failed to send transaction');
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

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setShowSend(true);
                setSendError(null);
                setSendStatus('idle');
              }}
            >
              Send
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowReceive(true)}
            >
              Receive
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
          <ZRC20List tokens={zrc20Tokens} onRefresh={loadInscriptions} />
        )}

        {view === 'nfts' && (
          <NFTGallery nfts={nfts} onRefresh={loadInscriptions} />
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

      {showSend && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-darker border border-zinc-700 rounded-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-white mb-4">Send ZEC</h2>
            <form className="space-y-4" onSubmit={handleSendSubmit}>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Recipient address</label>
                <input
                  className="input"
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                  placeholder="t1..."
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Amount (ZEC)</label>
                <input
                  className="input"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  placeholder="0.001"
                />
              </div>
              {sendError && (
                <p className="text-sm text-red-500">{sendError}</p>
              )}
              {sendStatus === 'success' && (
                <p className="text-sm text-emerald-400">Transaction submitted (experimental stub).</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowSend(false);
                    setSendStatus('idle');
                    setSendError(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={sendStatus === 'sending'}
                >
                  {sendStatus === 'sending' ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showReceive && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-darker border border-zinc-700 rounded-xl p-6 w-full max-w-md mx-4 text-center">
            <h2 className="text-lg font-semibold text-white mb-4">Receive ZEC</h2>
            <p className="text-xs text-zinc-400 mb-2">Share this address to receive ZEC</p>
            <p className="font-mono text-sm break-all text-amber-500 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 mb-4">
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
