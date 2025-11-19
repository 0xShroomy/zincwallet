import { useState } from 'react';
import browser from 'webextension-polyfill';

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

  async function handleCreate() {
    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters');
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
                  Write down these 24 words in order and store them safely!
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
              </div>

              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
                <p className="text-sm text-red-400">
                  Never share your seed phrase with anyone. Anyone with these words can access your funds.
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
              <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium">I have written down my seed phrase</p>
                    <p className="text-xs text-zinc-400 mt-1">Stored in a safe location</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium">I understand I cannot recover my wallet without it</p>
                    <p className="text-xs text-zinc-400 mt-1">This is the only backup</p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleConfirmed}
                className="w-full btn btn-primary"
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
