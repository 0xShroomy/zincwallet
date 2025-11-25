import { useState, useEffect } from 'react';
import browser from 'webextension-polyfill';

interface ApprovalRequest {
  id: string;
  origin: string;
  type: 'transaction' | 'signature';
  metadata: {
    title: string;
    favicon: string;
    url: string;
  };
  transaction?: {
    type: string;
    params: any;
  };
  message?: string;
  timestamp: number;
}

export default function TransactionApprovalPage() {
  const [request, setRequest] = useState<ApprovalRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [estimatedFee, setEstimatedFee] = useState<number>(0);

  useEffect(() => {
    loadApprovalRequest();
  }, []);

  useEffect(() => {
    if (request?.transaction && request.transaction.type === 'sendZec') {
      estimateTransactionFee();
    }
  }, [request]);

  async function loadApprovalRequest() {
    try {
      // Get pending approval request from storage
      const result = await browser.storage.local.get('pendingApproval');
      
      if (result.pendingApproval && (result.pendingApproval.type === 'transaction' || result.pendingApproval.type === 'signature')) {
        setRequest(result.pendingApproval);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Failed to load approval request:', error);
      setLoading(false);
    }
  }

  async function estimateTransactionFee() {
    if (!request?.transaction) return;
    
    try {
      const response = await browser.runtime.sendMessage({
        type: 'WALLET_ACTION',
        action: 'ESTIMATE_FEE',
        data: {
          to: request.transaction.params.to,
          amountZec: request.transaction.params.amount || request.transaction.params.amountZec,
        },
      });

      if (response.success && response.fees) {
        // Use standard fee rate by default
        setEstimatedFee(response.fees.standard.zatoshis);
      }
    } catch (error) {
      console.error('Failed to estimate fee:', error);
      // Fallback to rough estimate: 200 bytes * 2 zat/byte
      setEstimatedFee(400);
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
      
      // Store appropriate message based on request type
      if (request.type === 'signature') {
        await browser.storage.local.set({
          pendingToast: {
            message: 'Message signed',
            type: 'success',
            timestamp: Date.now()
          }
        });
      } else {
        await browser.storage.local.set({
          pendingToast: {
            message: 'Transaction pending...',
            type: 'info',
            timestamp: Date.now()
          }
        });
      }
      
      // Return to dashboard
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
      
      // Store appropriate message based on request type
      if (request.type === 'signature') {
        await browser.storage.local.set({
          pendingToast: {
            message: 'Signature rejected',
            type: 'info',
            timestamp: Date.now()
          }
        });
      } else {
        await browser.storage.local.set({
          pendingToast: {
            message: 'Transaction rejected',
            type: 'info',
            timestamp: Date.now()
          }
        });
      }
      
      // Return to dashboard
      window.location.href = '/src/popup/index.html';
    } catch (error) {
      console.error('Failed to reject:', error);
    }
  }

  function getTransactionTitle(type: string | undefined): string {
    if (type === 'signature') {
      return 'Sign Message';
    }
    const titles: Record<string, string> = {
      sendZec: 'Send ZEC',
      deployZrc20: 'Deploy ZRC-20 Token',
      mintZrc20: 'Mint ZRC-20 Tokens',
      transferZrc20: 'Transfer ZRC-20 Tokens',
      deployCollection: 'Deploy NFT Collection',
      mintNft: 'Mint NFT',
      inscribe: 'Create Inscription'
    };
    return titles[type || ''] || 'Transaction Request';
  }

  function getTransactionIcon(type: string | undefined): JSX.Element {
    if (type === 'signature') {
      return (
        <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      );
    }
    if (type === 'sendZec') {
      return (
        <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    }
    return (
      <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
      </svg>
    );
  }

  function renderTransactionDetails() {
    if (!request) return null;

    // Handle signature requests
    if (request.type === 'signature') {
      return (
        <div className="space-y-3">
          <div className="bg-zinc-800 rounded-lg p-4">
            <p className="text-sm text-zinc-400 mb-2">Message to sign:</p>
            <p className="text-white font-mono text-sm break-all whitespace-pre-wrap">
              {request.message}
            </p>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <p className="text-xs text-amber-200">
              ⓘ Signing this message does not cost any gas fees or execute any transactions on-chain.
            </p>
          </div>
        </div>
      );
    }

    if (!request.transaction) return null;
    
    const { type, params } = request.transaction;

    switch (type) {
      case 'sendZec':
        return (
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-zinc-400">To</span>
              <span className="text-white font-mono text-sm break-all">{params.to}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Amount</span>
              <span className="text-white font-bold">{params.amount} ZEC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Network Fee</span>
              <span className="text-white">
                {estimatedFee > 0 
                  ? `${(estimatedFee / 100000000).toFixed(8)} ZEC`
                  : 'Calculating...'
                }
              </span>
            </div>
            <div className="flex justify-between font-medium pt-2 border-t border-zinc-700">
              <span className="text-white">Total</span>
              <span className="text-white">
                {estimatedFee > 0
                  ? `${(Number(params.amount) + (estimatedFee / 100000000)).toFixed(8)} ZEC`
                  : `${params.amount} ZEC + fee`
                }
              </span>
            </div>
          </div>
        );

      case 'deployZrc20':
        return (
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-zinc-400">Ticker</span>
              <span className="text-white font-bold">{params.tick}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Max Supply</span>
              <span className="text-white">{params.max}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Mint Limit</span>
              <span className="text-white">{params.limit}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Decimals</span>
              <span className="text-white">{params.decimals}</span>
            </div>
            <div className="pt-2 border-t border-zinc-700">
              <div className="flex justify-between">
                <span className="text-zinc-400">Treasury Tip</span>
                <span className="text-amber-500 font-medium">0.0015 ZEC</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-zinc-400">Network Fee</span>
                <span className="text-white">~0.0001 ZEC</span>
              </div>
            </div>
          </div>
        );

      case 'mintZrc20':
        return (
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-zinc-400">Token TXID</span>
              <span className="text-white font-mono text-xs break-all">{params.deployTxid}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Amount</span>
              <span className="text-white font-bold">{params.amount}</span>
            </div>
            <div className="pt-2 border-t border-zinc-700">
              <div className="flex justify-between">
                <span className="text-zinc-400">Treasury Tip</span>
                <span className="text-amber-500 font-medium">0.0015 ZEC</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-zinc-400">Network Fee</span>
                <span className="text-white">~0.0001 ZEC</span>
              </div>
            </div>
          </div>
        );

      case 'transferZrc20':
        return (
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-zinc-400">Token TXID</span>
              <span className="text-white font-mono text-xs break-all">{params.deployTxid}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">To</span>
              <span className="text-white font-mono text-sm break-all">{params.to}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Amount</span>
              <span className="text-white font-bold">{params.amount}</span>
            </div>
            <div className="pt-2 border-t border-zinc-700">
              <div className="flex justify-between">
                <span className="text-zinc-400">Treasury Tip</span>
                <span className="text-amber-500 font-medium">0.0015 ZEC</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-zinc-400">Network Fee</span>
                <span className="text-white">~0.0001 ZEC</span>
              </div>
            </div>
          </div>
        );

      case 'deployCollection':
        return (
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-zinc-400">Collection Name</span>
              <span className="text-white font-bold">{params.name}</span>
            </div>
            {params.metadata && (
              <div className="flex justify-between">
                <span className="text-zinc-400">Metadata</span>
                <span className="text-white text-sm">{JSON.stringify(params.metadata).substring(0, 50)}...</span>
              </div>
            )}
            <div className="pt-2 border-t border-zinc-700">
              <div className="flex justify-between">
                <span className="text-zinc-400">Treasury Tip</span>
                <span className="text-amber-500 font-medium">0.0015 ZEC</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-zinc-400">Network Fee</span>
                <span className="text-white">~0.0001 ZEC</span>
              </div>
            </div>
          </div>
        );

      case 'mintNft':
        return (
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-zinc-400">Collection TXID</span>
              <span className="text-white font-mono text-xs break-all">{params.collectionTxid}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Content Type</span>
              <span className="text-white">{params.mimeType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Content</span>
              <span className="text-white text-sm">{params.content.substring(0, 50)}...</span>
            </div>
            <div className="pt-2 border-t border-zinc-700">
              <div className="flex justify-between">
                <span className="text-zinc-400">Treasury Tip</span>
                <span className="text-amber-500 font-medium">0.0015 ZEC</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-zinc-400">Network Fee</span>
                <span className="text-white">~0.0001 ZEC</span>
              </div>
            </div>
          </div>
        );

      case 'inscribe':
        return (
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-zinc-400">Content Type</span>
              <span className="text-white">{params.contentType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Content</span>
              <span className="text-white text-sm">{params.content.substring(0, 50)}...</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Protocol</span>
              <span className="text-white">Zerdinals (ScriptSig)</span>
            </div>
            <div className="pt-2 border-t border-zinc-700">
              <div className="flex justify-between">
                <span className="text-zinc-400">Network Fee</span>
                <span className="text-white">~0.0001 ZEC</span>
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div className="text-center text-zinc-400">
            Unknown transaction type
          </div>
        );
    }
  }

  function requiresTreasuryTip(type: string): boolean {
    return ['deployZrc20', 'mintZrc20', 'transferZrc20', 'deployCollection', 'mintNft'].includes(type);
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
            {getTransactionIcon(request.type === 'signature' ? 'signature' : request.transaction?.type)}
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {getTransactionTitle(request.type === 'signature' ? 'signature' : request.transaction?.type)}
          </h1>
          <p className="text-zinc-400">
            {request.metadata.title || 'Unknown dApp'}
          </p>
          {request.origin !== 'file://' && (
            <p className="text-sm text-zinc-500 mt-1">{request.origin}</p>
          )}
        </div>

        {/* Transaction Details Card */}
        <div className="card mb-6">
          <h3 className="text-sm text-zinc-400 mb-4">Transaction Details</h3>
          {renderTransactionDetails()}
        </div>

        {/* Treasury Tip Warning (for Zinc Protocol) */}
        {request.transaction && requiresTreasuryTip(request.transaction.type) && (
          <div className="bg-amber-500/10 border border-amber-500/50 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-sm text-amber-200 font-medium">Zinc Protocol Fee</p>
                <p className="text-sm text-amber-300/80 mt-1">
                  This transaction includes a 0.0015 ZEC tip to the Zinc treasury to support protocol development.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Security Warning */}
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-sm text-red-200 font-medium">Review carefully</p>
              <p className="text-sm text-red-300/80 mt-1">
                Only approve this transaction if you trust the requesting site and understand what it will do.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4 mb-20">
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
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
