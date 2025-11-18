import { useState } from 'react';
import browser from 'webextension-polyfill';
import type { WalletState } from '@/types/wallet';

interface Props {
  walletState: WalletState;
  onUpdate: () => void;
}

export default function DashboardPage({ walletState, onUpdate }: Props) {
  const [view, setView] = useState<'home' | 'inscriptions'>('home');

  async function handleLock() {
    await browser.runtime.sendMessage({
      type: 'WALLET_ACTION',
      action: 'LOCK_WALLET',
      data: {},
    });
    onUpdate();
  }

  async function handleSync() {
    await browser.runtime.sendMessage({
      type: 'WALLET_ACTION',
      action: 'SYNC',
      data: {},
    });
    onUpdate();
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
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-amber-500"
              title="Refresh"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
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

      {/* Navigation */}
      <div className="bg-zinc-darker border-b border-zinc-800 px-6">
        <div className="flex gap-6">
          <button
            onClick={() => setView('home')}
            className={`py-3 border-b-2 font-medium transition-colors ${
              view === 'home'
                ? 'border-amber-500 text-amber-500'
                : 'border-transparent text-zinc-400 hover:text-amber-500'
            }`}
          >
            Home
          </button>
          <button
            onClick={() => setView('inscriptions')}
            className={`py-3 border-b-2 font-medium transition-colors ${
              view === 'inscriptions'
                ? 'border-amber-500 text-amber-500'
                : 'border-transparent text-zinc-400 hover:text-amber-500'
            }`}
          >
            Inscriptions
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {view === 'home' && (
          <div className="space-y-6">
            {/* Balance Card */}
            <div className="card text-center">
              <p className="text-sm text-zinc-400 mb-2">Total Balance</p>
              <p className="text-4xl font-bold text-white mb-1">{balanceZEC} ZEC</p>
              <p className="text-xs text-zinc-400 mb-4">
                Network: <span className="font-medium text-amber-500">{walletState.network}</span>
              </p>
              
              <div className="bg-zinc-800 p-3 rounded-lg mb-4 border border-zinc-700">
                <p className="text-xs text-zinc-400 mb-1">Your Address</p>
                <p className="font-mono text-sm break-all text-amber-500">{walletState.address}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button className="btn btn-primary">
                  Send
                </button>
                <button className="btn btn-secondary">
                  Receive
                </button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="card">
              <h3 className="font-bold mb-4 text-white">Create Inscription</h3>
              <div className="space-y-2">
                <button className="w-full text-left p-3 hover:bg-zinc-800 rounded-lg border border-zinc-700 hover:border-amber-500 transition-colors">
                  <p className="font-medium text-white">Deploy ZRC-20 Token</p>
                  <p className="text-xs text-zinc-400">Create a new fungible token</p>
                </button>
                <button className="w-full text-left p-3 hover:bg-zinc-800 rounded-lg border border-zinc-700 hover:border-amber-500 transition-colors">
                  <p className="font-medium text-white">Mint ZRC-20</p>
                  <p className="text-xs text-zinc-400">Mint tokens from existing deployment</p>
                </button>
                <button className="w-full text-left p-3 hover:bg-zinc-800 rounded-lg border border-zinc-700 hover:border-amber-500 transition-colors">
                  <p className="font-medium text-white">Deploy NFT Collection</p>
                  <p className="text-xs text-zinc-400">Create a new NFT collection</p>
                </button>
                <button className="w-full text-left p-3 hover:bg-zinc-800 rounded-lg border border-zinc-700 hover:border-amber-500 transition-colors">
                  <p className="font-medium text-white">Mint NFT</p>
                  <p className="text-xs text-zinc-400">Create an NFT inscription</p>
                </button>
              </div>
            </div>
          </div>
        )}

        {view === 'inscriptions' && (
          <div className="space-y-6">
            {/* ZRC-20 Tokens */}
            <div className="card">
              <h3 className="font-bold mb-4 text-white">ZRC-20 Tokens</h3>
              <div className="text-center py-8 text-zinc-400">
                <p>No tokens found</p>
                <p className="text-sm mt-2">Deploy or mint tokens to see them here</p>
              </div>
            </div>

            {/* NFTs */}
            <div className="card">
              <h3 className="font-bold mb-4 text-white">NFT Inscriptions</h3>
              <div className="text-center py-8 text-zinc-400">
                <p>No NFTs found</p>
                <p className="text-sm mt-2">Mint NFTs to see them here</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
