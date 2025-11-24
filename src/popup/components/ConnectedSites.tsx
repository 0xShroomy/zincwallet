import { useState, useEffect } from 'react';
import browser from 'webextension-polyfill';

interface ConnectedSite {
  origin: string;
  metadata: {
    title: string;
    favicon: string;
    url: string;
  };
  timestamp: number;
}

interface Props {
  onClose: () => void;
  onDisconnect?: () => void;
}

export default function ConnectedSites({ onClose, onDisconnect }: Props) {
  const [sites, setSites] = useState<ConnectedSite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConnectedSites();
  }, []);

  async function loadConnectedSites() {
    try {
      const result = await browser.storage.local.get('dapp_permissions');
      const permissions = result.dapp_permissions || {};
      
      const connectedSites: ConnectedSite[] = Object.entries(permissions).map(([origin, data]: [string, any]) => ({
        origin,
        metadata: data.metadata || { title: origin, favicon: '', url: origin },
        timestamp: data.timestamp || Date.now()
      }));
      
      setSites(connectedSites);
    } catch (error) {
      console.error('Failed to load connected sites:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect(origin: string) {
    try {
      // Send disconnect request to background
      await browser.runtime.sendMessage({
        type: 'DAPP_REQUEST',
        data: {
          method: 'disconnect',
          origin
        }
      });
      
      // Close modal immediately (better UX - no empty state flash)
      onClose();
      
      // Notify parent to check for toast after modal closes
      if (onDisconnect) {
        setTimeout(() => onDisconnect(), 50);
      }
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-zinc-darker border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <h2 className="text-xl font-bold text-white">Connected Sites</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
            </div>
          ) : sites.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto text-zinc-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <p className="text-zinc-500 font-medium mb-1">No connections yet</p>
              <p className="text-sm text-zinc-600">Connect to a dApp to see it here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sites.map((site) => (
                <div
                  key={site.origin}
                  className="bg-zinc-800 rounded-lg p-4 flex items-center justify-between hover:bg-zinc-750 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {site.metadata.favicon ? (
                      <img
                        src={site.metadata.favicon}
                        alt=""
                        className="w-10 h-10 rounded-lg flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center flex-shrink-0">
                        <svg className="w-6 h-6 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                        </svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">
                        {site.metadata.title || 'Unknown Site'}
                      </p>
                      <p className="text-sm text-zinc-500 truncate">{site.origin}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDisconnect(site.origin)}
                    className="ml-3 px-3 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors text-sm font-medium flex-shrink-0"
                  >
                    Disconnect
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {sites.length > 0 && (
          <div className="p-6 border-t border-zinc-800">
            <p className="text-sm text-zinc-500 text-center">
              {sites.length} site{sites.length === 1 ? '' : 's'} connected
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
