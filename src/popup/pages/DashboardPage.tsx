import { useState } from 'react';
import type { FormEvent } from 'react';
import browser from 'webextension-polyfill';
import type { WalletState } from '@/types/wallet';
import InscriptionModal from '@/components/InscriptionModal';
import WalletSwitcher from '@/components/WalletSwitcher';
import Toast from '@/components/Toast';
import TransactionHistory from '@/components/TransactionHistory';
import ZRC20List from '@/components/ZRC20List';
import NFTGallery from '@/components/NFTGallery';
import type { ZRC20Token, NFTInscription } from '@/services/inscriptionIndexer';

interface Props {
  walletState: WalletState;
  onUpdate: () => void;
}

export default function DashboardPage({ walletState, onUpdate }: Props) {
  const [view, setView] = useState<'tokens' | 'nfts' | 'activity' | 'create'>('tokens');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'success'>('idle');
  
  const [showInscription, setShowInscription] = useState<string | null>(null);
  const [inscriptionData, setInscriptionData] = useState<Record<string, string>>({});
  const [inscriptionStatus, setInscriptionStatus] = useState<'idle' | 'creating' | 'success'>('idle');
  const [inscriptionError, setInscriptionError] = useState<string | null>(null);
  
  // Toast notifications
  const [toast, setToast] = useState<{message: string; type: 'success' | 'error' | 'info'} | null>(null);
  
  // Inscriptions state
  const [zrc20Tokens, setZrc20Tokens] = useState<ZRC20Token[]>([]);
  const [nfts, setNfts] = useState<NFTInscription[]>([]);
  const [loadingInscriptions, setLoadingInscriptions] = useState(false);
  

  async function handleLock() {
    await browser.runtime.sendMessage({
      type: 'WALLET_ACTION',
      action: 'LOCK_WALLET',
      data: {},
    });
    onUpdate();
  }

  async function handleSync() {
    setIsRefreshing(true);
    
    // Track start time for minimum spinner duration
    const startTime = Date.now();
    
    try {
      const response = await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'REFRESH_BALANCE',
        data: {},
      });
      onUpdate();
      
      // Show success toast only if balance actually updated
      if (response && !response.error) {
        setToast({ message: 'Balance updated', type: 'success' });
      }
    } catch (error) {
      setToast({ message: 'Failed to refresh balance', type: 'error' });
    } finally {
      // Ensure spinner shows for at least 500ms for better UX
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 500 - elapsed);
      
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
          <h1 className="text-xl font-bold text-white">Zinc Wallet</h1>
          <div className="flex items-center gap-2">
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
              onClick={() => setShowWalletMenu(true)}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-amber-500"
              title="Switch Wallet"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
            <button
              onClick={handleLock}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-amber-500"
              title="Lock Wallet"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Balance Card - Always Visible */}
      <div className="p-6 pb-4">
        <div className="card text-center">
          <p className="text-xs text-zinc-400 mb-1">Total Balance</p>
          <p className="text-2xl font-bold text-white mb-1">{balanceZEC} <span className="text-lg">ZEC</span></p>
          <p className="text-xs text-zinc-500 mb-3">
            Network: <span className="font-medium text-amber-500">{walletState.network}</span>
          </p>
          
          <div className="bg-zinc-800 p-2 rounded-lg mb-3 border border-zinc-700">
            <p className="text-xs text-zinc-400 mb-1">Your Address</p>
            <p className="font-mono text-xs break-all text-amber-500">{walletState.address}</p>
          </div>

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
          <TransactionHistory walletAddress={walletState.address || ''} />
        )}

        {view === 'create' && (
          <div className="card">
            <h3 className="font-bold mb-4 text-white">Create Inscription</h3>
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
    </div>
  );
}
