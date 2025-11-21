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
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null);
  const [newWalletName, setNewWalletName] = useState('');
  const [deletingWalletId, setDeletingWalletId] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  async function handleRenameWallet(e: React.FormEvent) {
    e.preventDefault();
    if (!editingWalletId || !newWalletName.trim()) return;

    try {
      const response = await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'RENAME_WALLET',
        data: { walletId: editingWalletId, name: newWalletName.trim() },
      });

      if (response.success) {
        setEditingWalletId(null);
        setNewWalletName('');
        loadWallets();
        onUpdate();
      }
    } catch (err) {
      console.error('Failed to rename wallet:', err);
    }
  }

  async function handleDeleteWallet(e: React.FormEvent) {
    e.preventDefault();
    if (!deletingWalletId || !deletePassword) return;

    setDeleteError(null);

    try {
      const response = await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'DELETE_WALLET',
        data: { walletId: deletingWalletId, password: deletePassword },
      });

      if (response.success) {
        setDeletingWalletId(null);
        setDeletePassword('');
        setDeleteError(null);
        
        // Wait for wallet list to reload before closing
        await loadWallets();
        onUpdate();
        
        // If we deleted and switched the active wallet, close the modal
        if (response.switched) {
          // Small delay to ensure UI updates
          setTimeout(() => {
            onClose();
          }, 100);
        }
      } else {
        setDeleteError(response.error || 'Invalid password');
      }
    } catch (err) {
      setDeleteError((err as Error).message || 'Failed to delete wallet');
    }
  }

  function startRename(wallet: Wallet, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingWalletId(wallet.id);
    setNewWalletName(wallet.name);
  }

  function startDelete(wallet: Wallet, e: React.MouseEvent) {
    e.stopPropagation();
    setDeletingWalletId(wallet.id);
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
                className={`border rounded-lg p-3 transition-colors ${
                  isActive
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-zinc-700 hover:border-zinc-600'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div 
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => !isActive && setSwitchingToId(wallet.id)}
                  >
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
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={(e) => startRename(wallet, e)}
                      className="p-1.5 hover:bg-zinc-700 rounded transition-colors"
                      title="Rename wallet"
                    >
                      <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => startDelete(wallet, e)}
                      className="p-1.5 hover:bg-red-500/20 rounded transition-colors"
                      title="Delete wallet"
                    >
                      <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                    {!isActive && (
                      <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
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

      {editingWalletId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-darker border border-zinc-700 rounded-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-white mb-4">Rename Wallet</h2>
            <form onSubmit={handleRenameWallet} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  New Name
                </label>
                <input
                  type="text"
                  value={newWalletName}
                  onChange={(e) => setNewWalletName(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  placeholder="Enter wallet name"
                  autoFocus
                  maxLength={50}
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingWalletId(null);
                    setNewWalletName('');
                  }}
                  className="flex-1 btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newWalletName.trim()}
                  className="flex-1 btn btn-primary disabled:opacity-50"
                >
                  Rename
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingWalletId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-darker border border-zinc-700 rounded-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-white mb-4">Delete Wallet</h2>
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-400">
                ⚠️ This will permanently delete this wallet. Make sure you have backed up your recovery phrase.
              </p>
              {deletingWalletId === activeWalletId && wallets.length > 1 && (
                <p className="text-sm text-amber-400 mt-2">
                  This is your active wallet. You will be automatically switched to another wallet.
                </p>
              )}
            </div>
            <form onSubmit={handleDeleteWallet} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Enter Password to Confirm
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  placeholder="Enter wallet password"
                  autoFocus
                />
              </div>

              {deleteError && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
                  <p className="text-sm text-red-400">{deleteError}</p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeletingWalletId(null);
                    setDeletePassword('');
                    setDeleteError(null);
                  }}
                  className="flex-1 btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!deletePassword}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                >
                  Delete Wallet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
