import { useState } from 'react';
import browser from 'webextension-polyfill';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function ImportWalletModal({ onClose, onSuccess }: Props) {
  const [step, setStep] = useState<'mnemonic' | 'password'>('mnemonic');
  const [walletName, setWalletName] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    if (!mnemonic.trim()) {
      setError('Please enter your seed phrase');
      return;
    }

    const words = mnemonic.trim().split(/\s+/);
    if (words.length !== 24) {
      setError('Seed phrase must be exactly 24 words');
      return;
    }

    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setImporting(true);
    setError(null);

    try {
      const response = await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'IMPORT_WALLET',
        data: {
          mnemonic: mnemonic.trim(),
          password,
          name: walletName || undefined,
        },
      });

      if (response.success) {
        onSuccess();
        onClose();
      } else {
        setError(response.error || 'Failed to import wallet');
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to import wallet');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-darker border border-zinc-700 rounded-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {step === 'mnemonic' && (
          <>
            <h2 className="text-lg font-semibold text-white mb-4">Import Wallet</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Wallet Name (Optional)
                </label>
                <input
                  type="text"
                  value={walletName}
                  onChange={(e) => setWalletName(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  placeholder="My Imported Wallet"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Seed Phrase (24 words)
                </label>
                <textarea
                  value={mnemonic}
                  onChange={(e) => setMnemonic(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-amber-500 font-mono text-sm"
                  placeholder="word1 word2 word3 ..."
                  rows={4}
                  autoFocus
                />
                <p className="text-xs text-zinc-500 mt-1">
                  Enter your 24-word seed phrase separated by spaces
                </p>
              </div>

              {error && step === 'mnemonic' && !mnemonic.trim().split(/\s+/).includes('') && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const words = mnemonic.trim().split(/\s+/);
                    if (!mnemonic.trim()) {
                      setError('Please enter your seed phrase');
                      return;
                    }
                    if (words.length !== 24) {
                      setError('Seed phrase must be exactly 24 words');
                      return;
                    }
                    setError(null);
                    setStep('password');
                  }}
                  disabled={!mnemonic.trim()}
                  className="flex-1 btn btn-primary disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </div>
          </>
        )}

        {step === 'password' && (
          <>
            <h2 className="text-lg font-semibold text-white mb-4">Set Password</h2>
            <div className="space-y-4">
              <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3">
                <p className="text-xs text-zinc-400">
                  Create a password to encrypt this wallet on your device
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  placeholder="Enter password"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  placeholder="Confirm password"
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
                    setStep('mnemonic');
                    setError(null);
                  }}
                  className="flex-1 btn btn-secondary"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing || !password || !confirmPassword}
                  className="flex-1 btn btn-primary disabled:opacity-50"
                >
                  {importing ? 'Importing...' : 'Import Wallet'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
