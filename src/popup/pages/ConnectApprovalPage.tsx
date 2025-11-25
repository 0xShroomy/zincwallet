import { useState, useEffect } from 'react';
import browser from 'webextension-polyfill';

interface ApprovalRequest {
  id: string;
  origin: string;
  metadata: {
    title: string;
    favicon: string;
    url: string;
  };
  timestamp: number;
}

export default function ConnectApprovalPage() {
  const [request, setRequest] = useState<ApprovalRequest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadApprovalRequest();
  }, []);

  async function loadApprovalRequest() {
    try {
      // Get pending approval request from storage
      const result = await browser.storage.local.get('pendingApproval');
      
      if (result.pendingApproval && result.pendingApproval.type === 'connect') {
        setRequest(result.pendingApproval);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Failed to load approval request:', error);
      setLoading(false);
    }
  }

  async function handleApprove() {
    if (!request) return;
    
    try {
      // Send approval to background
      await browser.runtime.sendMessage({
        type: 'APPROVAL_RESPONSE',
        data: {
          id: request.id,
          approved: true
        }
      });
      
      // Clear approval from storage
      await browser.storage.local.remove('pendingApproval');
      
      // FIX: Use programmatic navigation instead of reload
      window.location.href = '/src/popup/index.html';
    } catch (error) {
      console.error('Failed to approve:', error);
    }
  }

  async function handleReject() {
    if (!request) return;
    
    try {
      // Send rejection to background
      await browser.runtime.sendMessage({
        type: 'APPROVAL_RESPONSE',
        data: {
          id: request.id,
          approved: false
        }
      });
      
      // Clear approval from storage
      await browser.storage.local.remove('pendingApproval');
      
      // FIX: Use programmatic navigation instead of reload
      window.location.href = '/src/popup/index.html';
    } catch (error) {
      console.error('Failed to reject:', error);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-zinc-400">No pending approval request</p>
          <button
            onClick={() => window.close()}
            className="mt-4 px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-900 p-6 pb-20">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-800 flex items-center justify-center">
            {request.metadata.favicon ? (
              <img 
                src={request.metadata.favicon} 
                alt="dApp icon"
                className="w-10 h-10 rounded-full"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Connection Request</h1>
          <p className="text-zinc-400">
            {request.metadata.title || 'Unknown dApp'}
          </p>
          {request.origin !== 'file://' && (
            <p className="text-sm text-zinc-500 mt-1">{request.origin}</p>
          )}
        </div>

        {/* Info Card */}
        <div className="card mb-6">
          <div className="space-y-4">
            <div>
              <p className="text-sm text-zinc-400 mb-2">This site is requesting to:</p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-white font-medium">View your wallet address</p>
                    <p className="text-sm text-zinc-500">See your public Zcash address</p>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-white font-medium">View your balance</p>
                    <p className="text-sm text-zinc-500">See your ZEC balance</p>
                  </div>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-white font-medium">Request transaction approval</p>
                    <p className="text-sm text-zinc-500">You'll approve each transaction</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="bg-amber-500/10 border border-amber-500/50 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-sm text-amber-200 font-medium">Only connect to sites you trust</p>
              <p className="text-sm text-amber-300/80 mt-1">
                Connecting gives this site permission to view your address and request transactions.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4 mb-16">
          <button
            onClick={handleReject}
            className="py-3 px-4 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors font-medium"
          >
            Reject
          </button>
          <button
            onClick={handleApprove}
            className="py-3 px-4 bg-amber-500 text-black rounded-lg hover:bg-amber-600 transition-colors font-medium"
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}
