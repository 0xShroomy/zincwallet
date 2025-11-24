import { useState, useEffect } from 'react';
import browser from 'webextension-polyfill';

interface Props {
  onClose: () => void;
}

export default function SettingsMenu({ onClose }: Props) {
  const [currentNetwork, setCurrentNetwork] = useState<'mainnet' | 'testnet'>('mainnet');
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    loadCurrentNetwork();
  }, []);

  async function loadCurrentNetwork() {
    try {
      const response = await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'GET_NETWORK',
        data: {},
      });
      
      if (response.success) {
        setCurrentNetwork(response.network);
      }
    } catch (error) {
      console.error('Failed to load network:', error);
    }
  }

  async function handleNetworkSwitch(network: 'mainnet' | 'testnet') {
    if (network === currentNetwork) return;
    
    setSwitching(true);
    try {
      await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'SWITCH_NETWORK',
        data: { network },
      });
      
      setCurrentNetwork(network);
      
      // Reload the page to reflect network change
      window.location.reload();
    } catch (error) {
      console.error('Failed to switch network:', error);
    } finally {
      setSwitching(false);
    }
  }

  function handleSupport() {
    window.open('https://twitter.com/0xShinno', '_blank');
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
      />
      
      {/* Menu */}
      <div className="fixed top-16 right-4 bg-zinc-darker border border-zinc-700 rounded-xl shadow-xl z-50 w-64 overflow-hidden">
        {/* Network Section */}
        <div className="p-3 border-b border-zinc-700">
          <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium mb-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            <span>NETWORK</span>
          </div>
          
          <div className="space-y-1">
            <button
              onClick={() => handleNetworkSwitch('mainnet')}
              disabled={switching}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                currentNetwork === 'mainnet'
                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
                  : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <span className="text-sm font-medium">Mainnet</span>
              {currentNetwork === 'mainnet' && (
                <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
              )}
            </button>
            
            <button
              onClick={() => handleNetworkSwitch('testnet')}
              disabled={switching}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                currentNetwork === 'testnet'
                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
                  : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <span className="text-sm font-medium">Testnet</span>
              {currentNetwork === 'testnet' && (
                <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
              )}
            </button>
          </div>
        </div>

        {/* Actions Section */}
        <div className="p-3 space-y-1">
          <button
            onClick={() => window.open('https://docs.zyncwallet.xyz', '_blank')}
            className="w-full flex items-center gap-3 px-3 py-2 text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <div className="flex-1 text-left">
              <div className="text-sm font-medium">Developer Docs</div>
              <div className="text-xs text-zinc-500">Integration guide</div>
            </div>
            <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>

          <button
            onClick={handleSupport}
            className="w-full flex items-center gap-3 px-3 py-2 text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <div className="flex-1 text-left">
              <div className="text-sm font-medium">Support</div>
              <div className="text-xs text-zinc-500">@0xShinno</div>
            </div>
            <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>

          <button
            onClick={async () => {
              await browser.runtime.sendMessage({
                type: 'WALLET_ACTION',
                action: 'LOCK_WALLET',
                data: {},
              });
              onClose();
              window.location.reload();
            }}
            className="w-full flex items-center gap-3 px-3 py-2 text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <div className="flex-1 text-left">
              <div className="text-sm font-medium">Lock Wallet</div>
            </div>
          </button>
        </div>
      </div>
    </>
  );
}
