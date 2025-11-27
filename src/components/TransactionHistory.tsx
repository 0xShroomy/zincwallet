import { useState, useEffect, useRef, useCallback } from 'react';
import browser from 'webextension-polyfill';

interface Transaction {
  txid: string;
  type: 'sent' | 'received';
  amount: number;
  timestamp: number;
  confirmations: number;
  address?: string;
  protocol?: 'zinc' | 'zerdinals'; // Added for explorer detection
}

interface Props {
  walletAddress: string;
  isRefreshing?: boolean;
  network?: string;
}

export default function TransactionHistory({ walletAddress, isRefreshing, network = 'mainnet' }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const observerTarget = useRef<HTMLDivElement>(null);
  const ITEMS_PER_PAGE = 15;

  async function loadTransactions(reset = false) {
    const isInitialLoad = reset || page === 0;
    if (isInitialLoad) {
      setLoading(true);
      setPage(0);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    try {
      const currentPage = reset ? 0 : page;
      const response = await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'GET_TRANSACTIONS',
        data: { 
          address: walletAddress,
          limit: ITEMS_PER_PAGE,
          offset: currentPage * ITEMS_PER_PAGE
        },
      });

      if (response.success) {
        const newTxs = response.transactions || [];
        if (reset) {
          setTransactions(newTxs);
        } else {
          setTransactions(prev => [...prev, ...newTxs]);
        }
        setHasMore(newTxs.length === ITEMS_PER_PAGE);
        if (!reset) {
          setPage(prev => prev + 1);
        }
      } else {
        setError(response.error || 'Failed to load transactions');
      }
    } catch (err) {
      setError('Failed to load transactions');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  const loadMore = useCallback(() => {
    if (!loading && !loadingMore && hasMore) {
      loadTransactions(false);
    }
  }, [loading, loadingMore, hasMore, page]);

  useEffect(() => {
    setPage(0);
    setTransactions([]);
    loadTransactions(true);
  }, [walletAddress]);

  // Reload when isRefreshing changes
  useEffect(() => {
    if (isRefreshing) {
      setPage(0);
      loadTransactions(true);
    }
  }, [isRefreshing]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, loading, loadingMore, loadMore]);

  function formatAmount(zatoshis: number): string {
    return (zatoshis / 100000000).toFixed(8);
  }

  function formatDate(timestamp: number): string {
    // Handle missing or invalid timestamp
    if (!timestamp || timestamp === 0) {
      return 'Recent';
    }
    
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  function shortenTxid(txid: string): string {
    return `${txid.slice(0, 8)}...${txid.slice(-8)}`;
  }

  function openExplorer(txid: string, protocol?: 'zinc' | 'zerdinals') {
    // Zinc Protocol → Blockchair (supports OP_RETURN inscriptions)
    // Zerdinals/Regular → zcashexplorer.app (better for regular transactions and Zerdinals)
    let explorerUrl: string;
    
    if (protocol === 'zinc') {
      explorerUrl = `https://blockchair.com/zcash/transaction/${txid}`;
    } else {
      // Default to zcashexplorer for Zerdinals and regular transactions
      explorerUrl = `https://mainnet.zcashexplorer.app/transactions/${txid}`;
    }
    
    window.open(explorerUrl, '_blank');
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Recent Transactions</h3>
        </div>
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
          <p className="text-sm text-zinc-400 mt-3">Loading transactions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Recent Transactions</h3>
          <button
            onClick={() => loadTransactions(true)}
            className="text-xs text-amber-500 hover:text-amber-400"
          >
            Retry
          </button>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 text-center">
          <p className="text-sm text-zinc-400">{error}</p>
        </div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Recent Transactions</h3>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-8 text-center">
          <svg className="w-12 h-12 text-zinc-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm text-zinc-400">No transactions yet</p>
          <p className="text-xs text-zinc-500 mt-1">Your transaction history will appear here</p>
        </div>
      </div>
    );
  }

  function openAddressExplorer() {
    // Use Blockchair for address lookups
    const explorerUrl = `https://blockchair.com/zcash/address/${walletAddress}`;
    window.open(explorerUrl, '_blank');
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Recent Transactions</h3>
        <button
          onClick={openAddressExplorer}
          className="text-xs font-medium text-amber-500 hover:text-amber-400 transition-colors flex items-center gap-1"
        >
          See All
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      </div>

      <div className="space-y-2">
        {transactions.map((tx) => (
          <div
            key={tx.txid}
            onClick={() => openExplorer(tx.txid, tx.protocol)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 hover:border-zinc-600 transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  tx.type === 'received' 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  {tx.type === 'received' ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-white capitalize">
                      {tx.type}
                    </p>
                    <p className={`text-sm font-semibold ${
                      tx.type === 'received' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {tx.type === 'received' ? '+' : '-'}{formatAmount(tx.amount)} ZEC
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-1">
                    <p className="text-xs font-mono text-zinc-500 truncate">
                      {shortenTxid(tx.txid)}
                    </p>
                    <p className="text-xs text-zinc-500 flex-shrink-0">
                      {formatDate(tx.timestamp)}
                    </p>
                  </div>

                  {tx.confirmations < 6 && (
                    <div className="mt-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-zinc-800 rounded-full h-1">
                          <div 
                            className="bg-amber-500 h-1 rounded-full transition-all duration-300"
                            style={{ width: `${(tx.confirmations / 6) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-zinc-500 flex-shrink-0">
                          {tx.confirmations}/6
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {/* Observer target for infinite scroll */}
        <div ref={observerTarget} className="h-4" />
        
        {/* Loading more indicator */}
        {loadingMore && (
          <div className="text-center py-4">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500"></div>
            <p className="text-xs text-zinc-400 mt-2">Loading more...</p>
          </div>
        )}
        
        {/* End of list indicator */}
        {!hasMore && transactions.length > 0 && (
          <div className="text-center py-4">
            <p className="text-xs text-zinc-500">No more transactions</p>
          </div>
        )}
      </div>
    </div>
  );
}
