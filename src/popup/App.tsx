import { useEffect, useState } from 'react';
import browser from 'webextension-polyfill';
import type { WalletState } from '@/types/wallet';
import OnboardingPage from './pages/OnboardingPage';
import UnlockPage from './pages/UnlockPage';
import DashboardPage from './pages/DashboardPage';

function App() {
  const [walletState, setWalletState] = useState<WalletState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWalletState();
    
    // Listen for storage changes (when background updates balance)
    const handleStorageChange = (changes: any) => {
      // If wallet state changes in storage, reload
      if (changes.walletState || changes.wallets) {
        console.log('[App] Storage changed, reloading state...');
        loadWalletState();
      }
    };
    
    browser.storage.onChanged.addListener(handleStorageChange);
    
    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  async function loadWalletState() {
    try {
      console.log('[App] Loading wallet state...');
      
      // STEP 1: ALWAYS check storage first (most reliable)
      const stored = await browser.storage.local.get(['wallets', 'encryptedSeed']);
      console.log('[App] Storage check:', { 
        hasWallets: !!stored.wallets, 
        walletCount: stored.wallets?.length || 0,
        hasLegacySeed: !!stored.encryptedSeed 
      });
      
      const hasWallets = (stored.wallets && stored.wallets.length > 0) || !!stored.encryptedSeed;
      
      // If no wallets exist in storage, definitely show onboarding
      if (!hasWallets) {
        console.log('[App] No wallets found in storage - showing onboarding');
        setWalletState({ 
          isInitialized: false, 
          isLocked: false, 
          address: '', 
          balance: 0, 
          network: 'mainnet' 
        });
        setLoading(false);
        return;
      }
      
      // STEP 2: Wallets exist, now get full state from background script
      console.log('[App] Wallets found, requesting full state from background...');
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Background script timeout')), 3000)
      );
      
      const messagePromise = browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'GET_STATE',
        data: {},
      });
      
      try {
        const response = await Promise.race([messagePromise, timeoutPromise]);
        console.log('[App] Background state response:', response);
        setWalletState(response as WalletState);
      } catch (bgError) {
        // Background script failed, but we know wallets exist from storage
        console.warn('[App] Background script not responding, using storage data');
        setWalletState({ 
          isInitialized: true, 
          isLocked: true, 
          address: '', 
          balance: 0, 
          network: 'mainnet' 
        });
      }
      
    } catch (error) {
      console.error('[App] Critical error loading wallet state:', error);
      // Even on error, try to check storage one more time
      const stored = await browser.storage.local.get(['wallets', 'encryptedSeed']);
      const isInitialized = (stored.wallets && stored.wallets.length > 0) || !!stored.encryptedSeed;
      
      setWalletState({ 
        isInitialized, 
        isLocked: true, 
        address: '', 
        balance: 0, 
        network: 'mainnet' 
      });
    } finally {
      setLoading(false);
    }
  }

  function handleWalletUpdate() {
    loadWalletState();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zcash-yellow"></div>
      </div>
    );
  }

  if (!walletState?.isInitialized) {
    return <OnboardingPage onComplete={handleWalletUpdate} />;
  }

  if (walletState.isLocked) {
    return <UnlockPage onUnlock={handleWalletUpdate} />;
  }

  return <DashboardPage walletState={walletState} onUpdate={handleWalletUpdate} />;
}

export default App;
