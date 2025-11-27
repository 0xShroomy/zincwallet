import { useEffect, useState } from 'react';
import browser from 'webextension-polyfill';
import type { WalletState } from '@/types/wallet';
import OnboardingPage from './pages/OnboardingPage';
import UnlockPage from './pages/UnlockPage';
import DashboardPage from './pages/DashboardPage';
import ConnectApprovalPage from './pages/ConnectApprovalPage';
import TransactionApprovalPage from './pages/TransactionApprovalPage';

function App() {
  const [walletState, setWalletState] = useState<WalletState | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingApproval, setPendingApproval] = useState<any>(null);

  useEffect(() => {
    loadWalletState();
    checkPendingApproval();
    
    // Listen for storage changes (when background updates balance or approvals)
    const handleStorageChange = (changes: any, areaName: string) => {
      console.log('[App] Storage change detected in', areaName, ':', Object.keys(changes));
      console.log('[App] Changed keys:', changes);
      
      // If wallet state changes in storage, reload
      if (changes.wallet_state || changes.walletState || changes.wallets) {
        console.log('[App] WalletState changed! Old:', changes.wallet_state?.oldValue, 'New:', changes.wallet_state?.newValue);
        loadWalletState();
      }
      
      // If pending approval changes, check for it
      if (changes.pendingApproval) {
        console.log('[App] Pending approval changed');
        checkPendingApproval();
      }
    };
    
    browser.storage.onChanged.addListener(handleStorageChange);
    
    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  async function checkPendingApproval() {
    try {
      const result = await browser.storage.local.get('pendingApproval');
      if (result.pendingApproval) {
        console.log('[App] Pending approval found:', result.pendingApproval.type);
        setPendingApproval(result.pendingApproval);
      }
    } catch (error) {
      console.error('[App] Error checking pending approval:', error);
    }
  }

  async function loadWalletState() {
    try {
      console.log('[App] Loading wallet state...');
      
      // STEP 1: Read wallet state DIRECTLY from storage (instant, reliable)
      // Storage is the single source of truth - background script updates it
      const stored = await browser.storage.local.get(['wallet_state', 'wallets', 'encryptedSeed']);
      console.log('[App] Storage check:', { 
        hasWalletState: !!stored.wallet_state,
        walletState: stored.wallet_state,
        hasWallets: !!stored.wallets, 
        walletCount: stored.wallets?.length || 0,
        hasLegacySeed: !!stored.encryptedSeed 
      });
      
      const hasWallets = (stored.wallets && stored.wallets.length > 0) || !!stored.encryptedSeed;
      
      // If no wallets exist in storage, show onboarding
      if (!hasWallets) {
        console.log('[App] No wallets found - showing onboarding');
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
      
      // STEP 2: Use wallet state from storage directly
      // This is instant, reliable, and accurate - no race conditions!
      const walletState = stored.wallet_state || {
        isInitialized: true,
        isLocked: true, // Default to locked if no state stored yet
        address: '',
        balance: 0,
        network: 'mainnet'
      };
      
      // Ensure isInitialized matches storage reality
      walletState.isInitialized = hasWallets;
      
      console.log('[App] Wallet state from storage:', walletState);
      setWalletState(walletState as WalletState);
      
    } catch (error) {
      console.error('[App] Critical error loading wallet state:', error);
      // Fallback: Check if wallet exists, default to locked
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
    checkPendingApproval();
  }

  // Show approval pages if there's a pending approval
  if (pendingApproval) {
    if (pendingApproval.type === 'connect') {
      return <ConnectApprovalPage />;
    }
    if (pendingApproval.type === 'transaction' || pendingApproval.type === 'signature') {
      return <TransactionApprovalPage />;
    }
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
