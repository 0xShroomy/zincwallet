import { useState } from 'react';
import type { ZRC20Token } from '@/services/inscriptionIndexer';

interface Props {
  tokens: ZRC20Token[];
  onRefresh?: () => void;
}

export default function ZRC20List({ tokens, onRefresh }: Props) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTokens = tokens.filter(token => 
    token.tick.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (tokens.length === 0) {
    return (
      <div className="card">
        <h3 className="font-bold mb-4 text-white">ZRC-20 Tokens</h3>
        <div className="text-center py-8">
          <svg className="w-16 h-16 text-zinc-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-zinc-400 mb-2">No ZRC-20 tokens yet</p>
          <p className="text-sm text-zinc-500">Deploy or mint tokens to see them here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-white">ZRC-20 Tokens</h3>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="text-xs text-amber-500 hover:text-amber-400"
          >
            Refresh
          </button>
        )}
      </div>

      {tokens.length > 5 && (
        <div className="mb-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tokens..."
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
          />
        </div>
      )}

      <div className="space-y-2">
        {filteredTokens.map((token) => (
          <div
            key={token.tick}
            className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 hover:border-zinc-600 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <span className="text-amber-400 font-bold text-sm">
                    {token.tick.slice(0, 2)}
                  </span>
                </div>
                <div>
                  <h4 className="font-semibold text-white">{token.tick}</h4>
                  <p className="text-xs text-zinc-500">ZRC-20 Token</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-white font-semibold">
                  {token.balance.toLocaleString()}
                </p>
                <p className="text-xs text-zinc-500">Balance</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredTokens.length === 0 && searchQuery && (
        <div className="text-center py-4 text-zinc-400 text-sm">
          No tokens found matching "{searchQuery}"
        </div>
      )}
    </div>
  );
}
