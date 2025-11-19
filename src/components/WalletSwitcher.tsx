import { useState, useEffect } from 'react';
import browser from 'webextension-polyfill';
import CreateWalletModal from './CreateWalletModal';
import ImportWalletModal from './ImportWalletModal';

interface Wallet {
  id: string;
  name: string;
  address: string;
  createdAt: number;
  imported?: boolean;
}

interface Props {
  onClose: () => void;
  onUpdate: () => void;
}

export default function WalletSwitcher({ onClose, onUpdate }: Props) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [activeWalletId, setActiveWalletId] = useState<string | null>(null);
  const [switchingToId, setSwitchingToId] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateWallet, setShowCreateWallet] = useState(false);
  const [showImportWallet, setShowImportWallet] = useState(false);

  useEffect(() => {
    loadWallets();
  }, []);

  async function loadWallets() {
    try {
      const response = await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'GET_WALLETS',
        data: {},
      });

      if (response.success) {
        setWallets(response.wallets);
        setActiveWalletId(response.activeWalletId);
      }
    } catch (err) {
      console.error('Failed to load wallets:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSwitchWallet(e: React.FormEvent) {
    e.preventDefault();
    if (!switchingToId || !password) return;

    setError(null);

    try {
      const response = await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'SWITCH_WALLET',
        data: { walletId: switchingToId, password },
      });

      if (response.success) {
        setPassword('');
        setSwitchingToId(null);
        onUpdate();
        onClose();
      } else {
        setError(response.error || 'Invalid password');
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to switch wallet');
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-zinc-darker border border-zinc-700 rounded-xl p-6 w-full max-w-md mx-4">
          <div className="text-center text-zinc-400">Loading wallets...</div>
        </div>
      </div>
    );
  }

  // Password prompt for switching
  if (switchingToId) {
    const wallet = wallets.find(w => w.id === switchingToId);
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-zinc-darker border border-zinc-700 rounded-xl p-6 w-full max-w-md mx-4">
          <h2 className="text-lg font-semibold text-white mb-4">Switch to {wallet?.name}</h2>
          <form onSubmit={handleSwitchWallet} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Enter Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                placeholder="Enter wallet password"
                autoFocus
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSwitchingToId(null);
                  setPassword('');
                  setError(null);
                }}
                className="flex-1 btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!password}
                className="flex-1 btn btn-primary disabled:opacity-50"
              >
                Switch Wallet
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Wallet list
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-darker border border-zinc-700 rounded-xl p-6 w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        <h2 className="text-lg font-semibold text-white mb-4">Your Wallets</h2>
        
        <div className="flex-1 overflow-y-auto space-y-2 mb-4">
          {wallets.map((wallet) => {
            const isActive = wallet.id === activeWalletId;
            return (
              <div
                key={wallet.id}
                className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                  isActive
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-zinc-700 hover:border-zinc-600'
                }`}
                onClick={() => !isActive && setSwitchingToId(wallet.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-white truncate">
                        {wallet.name}
                      </h3>
                      {wallet.imported && (
                        <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                          Imported
                        </span>
                      )}
                      {isActive && (
                        <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-zinc-400 truncate mt-1">
                      {wallet.address}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      Created {new Date(wallet.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {!isActive && (
                    <svg className="w-5 h-5 text-zinc-500 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-zinc-700 pt-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setShowCreateWallet(true)}
              className="btn btn-primary text-sm"
            >
              Create New
            </button>
            <button
              type="button"
              onClick={() => setShowImportWallet(true)}
              className="btn btn-primary text-sm"
            >
              Import Wallet
            </button>
          </div>
          
          <div className="text-xs text-zinc-500 text-center">
            Total: {wallets.length} wallet{wallets.length !== 1 ? 's' : ''}
          </div>
          
          <button
            type="button"
            onClick={onClose}
            className="w-full btn btn-secondary"
          >
            Close
          </button>
        </div>
      </div>

      {showCreateWallet && (
        <CreateWalletModal
          onClose={() => setShowCreateWallet(false)}
          onSuccess={() => {
            setShowCreateWallet(false);
            loadWallets();
            onUpdate();
          }}
        />
      )}

      {showImportWallet && (
        <ImportWalletModal
          onClose={() => setShowImportWallet(false)}
          onSuccess={() => {
            setShowImportWallet(false);
            loadWallets();
            onUpdate();
          }}
        />
      )}
    </div>
  );
}
