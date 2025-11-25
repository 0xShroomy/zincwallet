import { useState } from 'react';
import browser from 'webextension-polyfill';
import PasswordStrength from './PasswordStrength';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateWalletModal({ onClose, onSuccess }: Props) {
  const [step, setStep] = useState<'name' | 'password' | 'mnemonic' | 'confirm'>('name');
  const [walletName, setWalletName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmChecked1, setConfirmChecked1] = useState(false);
  const [confirmChecked2, setConfirmChecked2] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const response = await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'CREATE_WALLET',
        data: {
          password,
          name: walletName || undefined,
        },
      });

      if (response.success) {
        setMnemonic(response.mnemonic);
        setStep('mnemonic');
      } else {
        setError(response.error || 'Failed to create wallet');
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to create wallet');
    } finally {
      setCreating(false);
    }
  }

  function handleConfirmed() {
    onSuccess();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-zinc-darker border border-zinc-700 rounded-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {step === 'name' && (
          <>
            <h2 className="text-lg font-semibold text-white mb-4">Create New Wallet</h2>
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
                  placeholder="My Wallet"
                  autoFocus
                />
                <p className="text-xs text-zinc-500 mt-1">
                  Give your wallet a memorable name
                </p>
              </div>

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
                  onClick={() => setStep('password')}
                  className="flex-1 btn btn-primary"
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
                  onClick={() => setStep('name')}
                  className="flex-1 btn btn-secondary"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating || !password || !confirmPassword}
                  className="flex-1 btn btn-primary disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Wallet'}
                </button>
              </div>
            </div>
          </>
        )}

        {step === 'mnemonic' && (
          <>
            <h2 className="text-lg font-semibold text-white mb-4">Backup Seed Phrase</h2>
            <div className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/50 rounded-lg p-3">
                <p className="text-sm text-amber-400 font-medium">
                  ⚠️ Write down these 24 words in order and store them safely!
                </p>
              </div>

              <div className="bg-zinc-900 p-4 rounded-lg border border-zinc-700">
                <div className="grid grid-cols-3 gap-2 font-mono text-sm">
                  {mnemonic.split(' ').map((word, i) => (
                    <div key={i} className="bg-zinc-800 p-2 rounded">
                      <span className="text-zinc-500 mr-1">{i + 1}.</span>
                      <span className="text-white">{word}</span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(mnemonic);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="mt-3 w-full py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded transition-colors"
                >
                  {copied ? '✓ Copied!' : '📋 Copy to clipboard'}
                </button>
              </div>

              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
                <p className="text-sm text-red-400 font-medium">
                  🔴 CRITICAL: Never share your seed phrase with anyone. Anyone with these words can access your funds.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setStep('confirm')}
                className="w-full btn btn-primary"
              >
                I Have Saved My Seed Phrase
              </button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <>
            <h2 className="text-lg font-semibold text-white mb-4">Confirm Backup</h2>
            <div className="space-y-4">
              <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={confirmChecked1}
                    onChange={(e) => setConfirmChecked1(e.target.checked)}
                    className="w-5 h-5 mt-0.5 rounded border-zinc-600 text-amber-500 focus:ring-amber-500 focus:ring-offset-0 bg-zinc-800 cursor-pointer"
                  />
                  <div className="flex-1">
                    <p className="text-sm text-white font-medium group-hover:text-amber-400 transition-colors">
                      I have written down my seed phrase
                    </p>
                    <p className="text-xs text-zinc-400 mt-1">Stored in a safe physical location</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={confirmChecked2}
                    onChange={(e) => setConfirmChecked2(e.target.checked)}
                    className="w-5 h-5 mt-0.5 rounded border-zinc-600 text-amber-500 focus:ring-amber-500 focus:ring-offset-0 bg-zinc-800 cursor-pointer"
                  />
                  <div className="flex-1">
                    <p className="text-sm text-white font-medium group-hover:text-amber-400 transition-colors">
                      I understand I cannot recover my wallet without it
                    </p>
                    <p className="text-xs text-zinc-400 mt-1">There is no other way to restore access</p>
                  </div>
                </label>
              </div>

              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
                <p className="text-xs text-red-400">
                  ⚠️ Zync Wallet does not store your seed phrase. We cannot help you recover it if lost.
                </p>
              </div>

              <button
                type="button"
                onClick={handleConfirmed}
                disabled={!confirmChecked1 || !confirmChecked2}
                className="w-full btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Complete Setup
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
