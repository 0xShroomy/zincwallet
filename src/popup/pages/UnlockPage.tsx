import { useState, useEffect } from 'react';
import browser from 'webextension-polyfill';

interface Props {
  onUnlock: () => void;
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

export default function UnlockPage({ onUnlock }: Props) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutEndTime, setLockoutEndTime] = useState<number | null>(null);
  const [remainingTime, setRemainingTime] = useState(0);

  // Load failed attempts and lockout state on mount
  useEffect(() => {
    const loadLockoutState = async () => {
      const stored = await browser.storage.local.get(['failedUnlockAttempts', 'unlockLockoutEndTime']);
      const attempts = stored.failedUnlockAttempts || 0;
      const endTime = stored.unlockLockoutEndTime || null;
      
      setFailedAttempts(attempts);
      
      if (endTime && endTime > Date.now()) {
        setLockoutEndTime(endTime);
        setRemainingTime(Math.ceil((endTime - Date.now()) / 1000));
      } else if (endTime) {
        // Lockout expired, reset
        await browser.storage.local.remove(['failedUnlockAttempts', 'unlockLockoutEndTime']);
        setFailedAttempts(0);
        setLockoutEndTime(null);
      }
    };
    
    loadLockoutState();
  }, []);

  // Countdown timer for lockout
  useEffect(() => {
    if (!lockoutEndTime) return;
    
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockoutEndTime - Date.now()) / 1000);
      
      if (remaining <= 0) {
        // Lockout expired
        setLockoutEndTime(null);
        setFailedAttempts(0);
        setRemainingTime(0);
        browser.storage.local.remove(['failedUnlockAttempts', 'unlockLockoutEndTime']);
      } else {
        setRemainingTime(remaining);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [lockoutEndTime]);

  async function handleUnlock() {
    if (!password) {
      setError('Please enter your password');
      return;
    }

    // Check if locked out
    if (lockoutEndTime && lockoutEndTime > Date.now()) {
      setError(`Too many failed attempts. Try again in ${Math.ceil(remainingTime / 60)} minutes.`);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'UNLOCK_WALLET',
        data: { password },
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to unlock wallet');
      }
      
      // Success - reset failed attempts
      await browser.storage.local.remove(['failedUnlockAttempts', 'unlockLockoutEndTime']);
      setFailedAttempts(0);

      // Poll storage until we see isLocked: false
      // This is more reliable than setTimeout
      let attempts = 0;
      const maxAttempts = 20; // 2 seconds max (20 * 100ms)
      
      const checkUnlocked = async () => {
        const stored = await browser.storage.local.get('wallet_state');
        const walletState = stored.wallet_state;
        
        console.log('[UnlockPage] Checking unlock status, attempt', attempts + 1, 'state:', walletState);
        
        if (walletState && !walletState.isLocked) {
          // Successfully unlocked!
          console.log('[UnlockPage] Wallet unlocked successfully!');
          setLoading(false);
          onUnlock();
          return;
        }
        
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkUnlocked, 100);
        } else {
          // Timeout - force reload anyway
          console.warn('[UnlockPage] Timeout waiting for unlock, forcing reload');
          setLoading(false);
          onUnlock();
        }
      };
      
      checkUnlocked();
    } catch (err: any) {
      // Track failed attempt
      const newFailedAttempts = failedAttempts + 1;
      setFailedAttempts(newFailedAttempts);
      await browser.storage.local.set({ failedUnlockAttempts: newFailedAttempts });
      
      if (newFailedAttempts >= MAX_ATTEMPTS) {
        // Lock out for 5 minutes
        const lockoutEnd = Date.now() + LOCKOUT_DURATION;
        setLockoutEndTime(lockoutEnd);
        setRemainingTime(Math.ceil(LOCKOUT_DURATION / 1000));
        await browser.storage.local.set({ unlockLockoutEndTime: lockoutEnd });
        setError(`Too many failed attempts. Locked out for 5 minutes.`);
      } else {
        const attemptsRemaining = MAX_ATTEMPTS - newFailedAttempts;
        setError(`Invalid password. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining.`);
      }
      
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
          <div className="flex justify-center mb-6">
            <img 
              src="/icons/ZYNCWALLETICON.png" 
              alt="Zync Wallet Logo" 
              className="w-20 h-20"
            />
          </div>
          <h1 className="text-3xl font-bold mb-2">Zync Wallet</h1>
          <p className="text-zinc-600">Enter your password to unlock</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {lockoutEndTime && lockoutEndTime > Date.now() && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg mb-4 text-center">
            <div className="font-bold text-lg">🔒 Wallet Locked</div>
            <div className="text-sm mt-1">
              Too many failed attempts. Please wait {Math.floor(remainingTime / 60)}:{String(remainingTime % 60).padStart(2, '0')}
            </div>
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
              disabled={lockoutEndTime !== null && lockoutEndTime > Date.now()}
            />
          </div>

          <button
            onClick={handleUnlock}
            disabled={loading || (lockoutEndTime !== null && lockoutEndTime > Date.now())}
            className="btn btn-primary w-full"
          >
            {loading ? 'Unlocking...' : lockoutEndTime && lockoutEndTime > Date.now() ? 'Locked' : 'Unlock Wallet'}
          </button>
        </div>
      </div>
    </div>
  );
}
