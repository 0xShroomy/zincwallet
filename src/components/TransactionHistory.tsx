import { useState, useEffect } from 'react';
import browser from 'webextension-polyfill';

interface Transaction {
  txid: string;
  type: 'sent' | 'received';
  amount: number;
  timestamp: number;
  confirmations: number;
  address?: string;
}

interface Props {
  walletAddress: string;
}

export default function TransactionHistory({ walletAddress }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTransactions();
  }, [walletAddress]);

  async function loadTransactions() {
    setLoading(true);
    setError(null);

    try {
      const response = await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'GET_TRANSACTIONS',
        data: { address: walletAddress },
      });

      if (response.success) {
        setTransactions(response.transactions || []);
      } else {
        setError(response.error || 'Failed to load transactions');
      }
    } catch (err) {
      setError('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }

  function formatAmount(zatoshis: number): string {
    return (zatoshis / 100000000).toFixed(8);
  }

  function formatDate(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
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

  function openExplorer(txid: string) {
    const explorerUrl = `https://explorer.zcha.in/transactions/${txid}`;
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
            onClick={loadTransactions}
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Recent Transactions</h3>
        <button
          onClick={loadTransactions}
          className="text-xs text-amber-500 hover:text-amber-400"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-2">
        {transactions.map((tx) => (
          <div
            key={tx.txid}
            onClick={() => openExplorer(tx.txid)}
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
      </div>
    </div>
  );
}
