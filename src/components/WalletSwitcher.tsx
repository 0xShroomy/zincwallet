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
  importMethod?: 'privateKey' | 'phrase';
  coinType?: number | null;
  derivationPath?: string;
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
  const [exportingWalletId, setExportingWalletId] = useState<string | null>(null);
  const [exportType, setExportType] = useState<'seedPhrase' | 'privateKey' | null>(null);
  const [exportPassword, setExportPassword] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportData, setExportData] = useState<{ mnemonic?: string; privateKey?: string; walletImportMethod?: string } | null>(null);

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
        console.log('[WalletSwitcher] Loaded wallets:', response.wallets);
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

  function startExport(wallet: Wallet, e: React.MouseEvent) {
    e.stopPropagation();
    console.log('[WalletSwitcher] Exporting wallet:', wallet.name, 'importMethod:', wallet.importMethod);
    setExportingWalletId(wallet.id);
    
    // Detect if wallet was imported via private key
    // Method 1: Check importMethod field (new wallets)
    // Method 2: Fallback for old wallets - if coinType is null, it's a private key wallet
    const isPrivateKeyWallet = wallet.importMethod === 'privateKey' || 
                               wallet.coinType === null ||
                               wallet.derivationPath === 'imported';
    
    // If wallet was imported via private key, skip choice and go straight to private key export
    if (isPrivateKeyWallet) {
      console.log('[WalletSwitcher] Private key wallet detected - skipping choice screen');
      setExportType('privateKey');
    } else {
      console.log('[WalletSwitcher] Seed phrase wallet - showing choice screen');
      setExportType(null); // Reset to show choice screen for seed phrase wallets
    }
    
    setExportPassword('');
    setExportError(null);
    setExportData(null);
  }

  async function handleExportWallet(e: React.FormEvent) {
    e.preventDefault();
    if (!exportingWalletId || !exportPassword || !exportType) return;

    setExportError(null);

    try {
      const response = await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'EXPORT_WALLET',
        data: { 
          walletId: exportingWalletId, 
          password: exportPassword,
          exportType 
        },
      });

      if (response.success) {
        setExportData({
          mnemonic: response.mnemonic,
          privateKey: response.privateKey,
          walletImportMethod: response.walletImportMethod,
        });
        setExportPassword('');
      } else {
        setExportError(response.error || 'Invalid password');
      }
    } catch (err) {
      setExportError((err as Error).message || 'Failed to export wallet');
    }
  }

  function copyToClipboard(text: string, type: string) {
    navigator.clipboard.writeText(text).then(() => {
      alert(`${type} copied to clipboard!`);
    }).catch(() => {
      alert('Failed to copy. Please copy manually.');
    });
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
        <div className="bg-zinc-darker border border-zinc-700 rounded-xl p-6 w-full max-w-md">
          <div className="text-center text-zinc-400">Loading wallets...</div>
        </div>
      </div>
    );
  }

  // Password prompt for switching
  if (switchingToId) {
    const wallet = wallets.find(w => w.id === switchingToId);
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
        <div className="bg-zinc-darker border border-zinc-700 rounded-xl p-6 w-full max-w-md">
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-zinc-darker border border-zinc-700 rounded-xl p-4 w-full max-w-md max-h-[80vh] flex flex-col">
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
                <div 
                  className="cursor-pointer"
                  onClick={() => !isActive && setSwitchingToId(wallet.id)}
                >
                  {/* Wallet Name - Top Priority */}
                  <h3 className="text-base font-semibold text-white truncate mb-2">
                    {wallet.name}
                  </h3>
                  
                  {/* Badges and Action Buttons - Same Line */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
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
                    
                    <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
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
                        onClick={(e) => startExport(wallet, e)}
                        className="p-1.5 hover:bg-amber-500/20 rounded transition-colors"
                        title="Export wallet"
                      >
                        <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
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
                  
                  {/* Address and Date - Below */}
                  <p className="text-xs font-mono text-zinc-400 truncate">
                    {wallet.address}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Created {new Date(wallet.createdAt).toLocaleDateString()}
                  </p>
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-zinc-darker border border-zinc-700 rounded-xl p-6 w-full max-w-md">
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-zinc-darker border border-zinc-700 rounded-xl p-6 w-full max-w-md">
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

      {exportingWalletId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-zinc-darker border border-zinc-700 rounded-xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-white mb-4">Export Wallet</h2>
            
            {/* Step 1: Choose export type */}
            {!exportType && !exportData && (
              <div className="space-y-4">
                <div className="bg-amber-500/10 border border-amber-500/50 rounded-lg p-3">
                  <p className="text-sm text-amber-400">
                    ⚠️ Choose what you want to export. Never share this information with anyone!
                  </p>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() => setExportType('seedPhrase')}
                    className="w-full p-4 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 hover:border-amber-500 rounded-lg text-left transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-white font-medium mb-1">Seed Phrase</h3>
                        <p className="text-sm text-zinc-400">Export 12 or 24 recovery words. Can restore full wallet.</p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setExportType('privateKey')}
                    className="w-full p-4 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 hover:border-amber-500 rounded-lg text-left transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-white font-medium mb-1">Private Key</h3>
                        <p className="text-sm text-zinc-400">Export private key for this address only.</p>
                      </div>
                    </div>
                  </button>
                </div>

                <button
                  onClick={() => {
                    setExportingWalletId(null);
                    setExportType(null);
                    setExportError(null);
                  }}
                  className="w-full btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Step 2: Enter password */}
            {exportType && !exportData && (
              <form onSubmit={handleExportWallet} className="space-y-4">
                <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3">
                  <p className="text-sm text-zinc-300">
                    Exporting: <span className="text-amber-400 font-medium">
                      {exportType === 'seedPhrase' ? 'Seed Phrase' : 'Private Key'}
                    </span>
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Enter Password
                  </label>
                  <input
                    type="password"
                    value={exportPassword}
                    onChange={(e) => setExportPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                    placeholder="Enter wallet password"
                    autoFocus
                  />
                </div>

                {exportError && (
                  <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
                    <p className="text-sm text-red-400">{exportError}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      // Check if this is a private key wallet
                      const wallet = wallets.find(w => w.id === exportingWalletId);
                      const isPrivateKeyWallet = wallet && (
                        wallet.importMethod === 'privateKey' || 
                        wallet.coinType === null ||
                        wallet.derivationPath === 'imported'
                      );
                      
                      if (isPrivateKeyWallet) {
                        // Private key wallet: close modal entirely (never showed choice screen)
                        setExportingWalletId(null);
                        setExportType(null);
                        setExportPassword('');
                        setExportError(null);
                      } else {
                        // Seed phrase wallet: go back to choice screen
                        setExportType(null);
                        setExportPassword('');
                        setExportError(null);
                      }
                    }}
                    className="flex-1 btn btn-secondary"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={!exportPassword}
                    className="flex-1 btn btn-primary disabled:opacity-50"
                  >
                    Export
                  </button>
                </div>
              </form>
            )}

            {/* Step 3: Show exported data */}
            {exportData && (
              <div className="space-y-4">
                {exportData.mnemonic && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Seed Phrase (12 or 24 words)
                    </label>
                    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 break-words text-sm text-white font-mono">
                      {exportData.mnemonic}
                    </div>
                    <button
                      onClick={() => copyToClipboard(exportData.mnemonic!, 'Seed phrase')}
                      className="mt-2 text-sm text-amber-400 hover:text-amber-300"
                    >
                      📋 Copy to clipboard
                    </button>
                  </div>
                )}

                {exportData.privateKey && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Private Key
                    </label>
                    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 break-all text-sm text-white font-mono">
                      {exportData.privateKey}
                    </div>
                    <button
                      onClick={() => copyToClipboard(exportData.privateKey!, 'Private key')}
                      className="mt-2 text-sm text-amber-400 hover:text-amber-300"
                    >
                      📋 Copy to clipboard
                    </button>
                  </div>
                )}

                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
                  <p className="text-sm text-red-400">
                    ⚠️ Make sure to store this information in a safe place. Anyone with access to this can control your wallet!
                  </p>
                </div>

                <button
                  onClick={() => {
                    setExportingWalletId(null);
                    setExportType(null);
                    setExportPassword('');
                    setExportData(null);
                    setExportError(null);
                  }}
                  className="w-full btn btn-secondary"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
