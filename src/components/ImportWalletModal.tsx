import { useState } from 'react';
import browser from 'webextension-polyfill';
import PasswordStrength from './PasswordStrength';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function ImportWalletModal({ onClose, onSuccess }: Props) {
  const [step, setStep] = useState<'method' | 'input' | 'password'>('method');
  const [importMethod, setImportMethod] = useState<'phrase' | 'privateKey'>('phrase');
  const [walletName, setWalletName] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validateInput() {
    if (importMethod === 'phrase') {
      if (!mnemonic.trim()) {
        setError('Please enter your seed phrase');
        return false;
      }
      const words = mnemonic.trim().split(/\s+/);
      if (words.length !== 12 && words.length !== 24) {
        setError('Seed phrase must be 12 or 24 words');
        return false;
      }
    } else {
      if (!privateKey.trim()) {
        setError('Please enter your private key');
        return false;
      }
      // Basic validation - private keys are typically 52 characters (WIF format)
      if (privateKey.trim().length < 50) {
        setError('Private key appears to be invalid');
        return false;
      }
    }
    return true;
  }

  async function handleImport() {
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters');
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
          method: importMethod,
          mnemonic: importMethod === 'phrase' ? mnemonic.trim() : undefined,
          privateKey: importMethod === 'privateKey' ? privateKey.trim() : undefined,
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
        {/* Step 1: Choose Import Method */}
        {step === 'method' && (
          <>
            <h2 className="text-lg font-semibold text-white mb-4">Import Wallet</h2>
            <div className="space-y-4">
              <p className="text-sm text-zinc-400 mb-4">
                Choose how you want to import your wallet
              </p>

              <button
                onClick={() => {
                  setImportMethod('phrase');
                  setStep('input');
                }}
                className="w-full p-4 bg-zinc-900 border-2 border-zinc-700 rounded-lg hover:border-amber-500 transition-colors text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/30 transition-colors">
                    <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-white">Seed Phrase</div>
                    <div className="text-sm text-zinc-400">12 or 24-word recovery phrase</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  setImportMethod('privateKey');
                  setStep('input');
                }}
                className="w-full p-4 bg-zinc-900 border-2 border-zinc-700 rounded-lg hover:border-amber-500 transition-colors text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/30 transition-colors">
                    <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-white">Private Key</div>
                    <div className="text-sm text-zinc-400">Import using private key</div>
                  </div>
                </div>
              </button>

              <button
                onClick={onClose}
                className="w-full btn btn-secondary mt-2"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {/* Step 2: Input */}
        {step === 'input' && (
          <>
            <h2 className="text-lg font-semibold text-white mb-4">
              {importMethod === 'phrase' ? 'Enter Seed Phrase' : 'Enter Private Key'}
            </h2>
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

              {importMethod === 'phrase' ? (
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Seed Phrase (12 or 24 words)
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
                    Enter your 12 or 24-word seed phrase separated by spaces
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Private Key
                  </label>
                  <textarea
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-amber-500 font-mono text-sm"
                    placeholder="L... or 0x..."
                    rows={3}
                    autoFocus
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    Supports WIF format (L...) or hex format (0x...)
                  </p>
                </div>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep('method');
                    setError(null);
                  }}
                  className="flex-1 btn btn-secondary"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (validateInput()) {
                      setError(null);
                      setStep('password');
                    }
                  }}
                  disabled={(importMethod === 'phrase' && !mnemonic.trim()) || (importMethod === 'privateKey' && !privateKey.trim())}
                  className="flex-1 btn btn-primary disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </div>
          </>
        )}

        {/* Step 3: Password */}
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
                  Password (min. 6 characters)
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  placeholder="Enter password"
                  autoFocus
                />
                <div className="mt-2">
                  <PasswordStrength password={password} />
                </div>
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
                    setStep('input');
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
