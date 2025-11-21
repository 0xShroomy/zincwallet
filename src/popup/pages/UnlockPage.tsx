import { useState } from 'react';
import browser from 'webextension-polyfill';

interface Props {
  onUnlock: () => void;
}

export default function UnlockPage({ onUnlock }: Props) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleUnlock() {
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'UNLOCK_WALLET',
        data: { password },
      });

      onUnlock();
    } catch (err: any) {
      setError(err.message || 'Invalid password');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handleUnlock();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
      <div className="card max-w-md w-full">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold mb-2">Zync Wallet</h1>
          <p className="text-zinc-600">Enter your password to unlock</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              className="input"
              placeholder="Enter your password"
              autoFocus
            />
          </div>

          <button
            onClick={handleUnlock}
            disabled={loading}
            className="btn btn-primary w-full"
          >
            {loading ? 'Unlocking...' : 'Unlock Wallet'}
          </button>
        </div>
      </div>
    </div>
  );
}
