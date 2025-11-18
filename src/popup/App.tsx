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
  }, []);

  async function loadWalletState() {
    try {
      console.log('[App] Requesting wallet state...');
      
      // Shorter timeout (500ms) for better UX
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Background script timeout')), 500)
      );
      
      const messagePromise = browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'GET_STATE',
        data: {},
      });
      
      const response = await Promise.race([messagePromise, timeoutPromise]);
      console.log('[App] Wallet state response:', response);
      setWalletState(response as WalletState);
    } catch (error) {
      console.error('[App] Failed to load wallet state:', error);
      // Fallback: Check storage directly for now
      const stored = await browser.storage.local.get(['encryptedSeed']);
      const isInitialized = !!stored.encryptedSeed;
      
      setWalletState({ 
        isInitialized, 
        isLocked: true, 
        address: '', 
        balance: 0, 
        network: 'testnet' 
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
