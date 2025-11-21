import { useState } from 'react';
import type { NFTInscription } from '@/services/inscriptionIndexer';
import ContentRenderer from './ContentRenderer';

interface Props {
  nfts: NFTInscription[];
  onRefresh?: () => void;
}

export default function NFTGallery({ nfts, onRefresh }: Props) {
  const [selectedNFT, setSelectedNFT] = useState<NFTInscription | null>(null);

  if (nfts.length === 0) {
    return (
      <div className="card">
        <h3 className="font-bold mb-4 text-white">NFT Inscriptions</h3>
        <div className="text-center py-8">
          <svg className="w-16 h-16 text-zinc-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-zinc-400 mb-2">No NFTs yet</p>
          <p className="text-sm text-zinc-500">Create NFT inscriptions to see them here</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-white">NFT Inscriptions</h3>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="text-xs text-amber-500 hover:text-amber-400"
            >
              Refresh
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {nfts.map((nft) => (
            <div
              key={nft.id}
              onClick={() => setSelectedNFT(nft)}
              className="bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden hover:border-amber-500 transition-colors cursor-pointer"
            >
              <div className="aspect-square">
                {nft.contentType ? (
                  <ContentRenderer
                    txid={nft.txid}
                    contentType={nft.contentType}
                    className="w-full h-full"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-amber-500/20 to-purple-500/20 flex items-center justify-center">
                    <svg className="w-12 h-12 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="p-2">
                <p className="text-sm font-semibold text-white truncate">{nft.collection || nft.contentType || 'Inscription'}</p>
                <p className="text-xs text-zinc-500">#{nft.id}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* NFT Detail Modal */}
      {selectedNFT && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-darker border border-zinc-700 rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">NFT Details</h3>
              <button
                onClick={() => setSelectedNFT(null)}
                className="text-zinc-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              <div className="aspect-square rounded-lg overflow-hidden">
                {selectedNFT.contentType ? (
                  <ContentRenderer
                    txid={selectedNFT.txid}
                    contentType={selectedNFT.contentType}
                    className="w-full h-full"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-amber-500/20 to-purple-500/20 flex items-center justify-center">
                    <svg className="w-24 h-24 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>

              <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-zinc-400">Type</p>
                    <p className="text-white font-medium text-xs">{selectedNFT.contentType || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-zinc-400">ID</p>
                    <p className="text-white font-medium">#{selectedNFT.id}</p>
                  </div>
                  {selectedNFT.contentSize && (
                    <div className="col-span-2">
                      <p className="text-zinc-400">Size</p>
                      <p className="text-white font-medium">{(selectedNFT.contentSize / 1024).toFixed(2)} KB</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3">
                <p className="text-xs text-zinc-400 mb-1">Transaction ID</p>
                <p className="font-mono text-xs text-amber-500 break-all">{selectedNFT.txid}</p>
              </div>

              {selectedNFT.metadata && (
                <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3">
                  <p className="text-xs text-zinc-400 mb-2">Metadata</p>
                  <pre className="text-xs text-zinc-300 overflow-auto max-h-32">
                    {JSON.stringify(selectedNFT.metadata, null, 2)}
                  </pre>
                </div>
              )}

              <button
                onClick={() => window.open(`https://explorer.zcha.in/transactions/${selectedNFT.txid}`, '_blank')}
                className="w-full btn btn-secondary"
              >
                View on Explorer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
