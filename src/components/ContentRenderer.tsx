import { useState } from 'react';

interface Props {
  txid: string;
  contentType: string;
  className?: string;
}

const PROXY_URL = 'https://vercel-proxy-loghorizon.vercel.app';

export default function ContentRenderer({ txid, contentType, className = '' }: Props) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const contentUrl = `${PROXY_URL}/api/content/${txid}`;

  // Handle load error
  const handleError = () => {
    setError(true);
    setLoading(false);
  };

  // Handle load success
  const handleLoad = () => {
    setLoading(false);
  };

  // Error fallback
  if (error) {
    return (
      <div className={`flex items-center justify-center bg-zinc-900 ${className}`}>
        <div className="text-center p-4">
          <svg className="w-12 h-12 text-red-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm text-zinc-400">Failed to load content</p>
        </div>
      </div>
    );
  }

  // IMAGE RENDERING
  if (contentType?.startsWith('image/')) {
    return (
      <div className={`relative ${className}`}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
          </div>
        )}
        <img
          src={contentUrl}
          alt="Inscription"
          className={`w-full h-full object-cover ${loading ? 'opacity-0' : 'opacity-100'} transition-opacity`}
          onError={handleError}
          onLoad={handleLoad}
        />
      </div>
    );
  }

  // VIDEO RENDERING
  if (contentType?.startsWith('video/')) {
    return (
      <div className={`relative ${className}`}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
          </div>
        )}
        <video
          src={contentUrl}
          controls
          className="w-full h-full"
          onError={handleError}
          onLoadedData={handleLoad}
        >
          Your browser does not support video playback.
        </video>
      </div>
    );
  }

  // AUDIO RENDERING
  if (contentType?.startsWith('audio/')) {
    return (
      <div className={`flex items-center justify-center bg-zinc-900 ${className}`}>
        <div className="p-4 w-full">
          <div className="mb-4 text-center">
            <svg className="w-16 h-16 text-amber-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <audio
            src={contentUrl}
            controls
            className="w-full"
            onError={handleError}
            onLoadedData={handleLoad}
          >
            Your browser does not support audio playback.
          </audio>
        </div>
      </div>
    );
  }

  // HTML/TEXT RENDERING (sandboxed iframe)
  if (contentType?.includes('html') || contentType?.includes('text/plain')) {
    return (
      <div className={`relative ${className}`}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
          </div>
        )}
        <iframe
          src={contentUrl}
          sandbox="allow-scripts allow-same-origin"
          className="w-full h-full border-0"
          onError={handleError}
          onLoad={handleLoad}
          title="Inscription content"
        />
      </div>
    );
  }

  // SVG RENDERING
  if (contentType === 'image/svg+xml') {
    return (
      <div className={`relative ${className}`}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
          </div>
        )}
        <img
          src={contentUrl}
          alt="SVG Inscription"
          className="w-full h-full object-contain"
          onError={handleError}
          onLoad={handleLoad}
        />
      </div>
    );
  }

  // 3D MODEL RENDERING (basic support)
  if (contentType?.includes('model/gltf') || contentType?.includes('model/glb')) {
    return (
      <div className={`flex items-center justify-center bg-zinc-900 ${className}`}>
        <div className="text-center p-4">
          <svg className="w-16 h-16 text-amber-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <p className="text-sm text-white mb-2">3D Model</p>
          <p className="text-xs text-zinc-400 mb-3">{contentType}</p>
          <a
            href={contentUrl}
            download
            className="inline-block px-4 py-2 bg-amber-500 text-black rounded-lg hover:bg-amber-400 transition-colors text-sm font-medium"
          >
            Download Model
          </a>
        </div>
      </div>
    );
  }

  // JAVASCRIPT RENDERING (display as text)
  if (contentType?.includes('javascript')) {
    return (
      <div className={`bg-zinc-900 ${className} overflow-auto`}>
        <div className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13 7H7v6h6V7z" />
              <path fillRule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-zinc-400">JavaScript Code</span>
          </div>
          <pre className="text-xs text-amber-400 font-mono bg-black p-3 rounded overflow-auto max-h-96">
            {/* Code will be loaded here */}
            <code>Loading...</code>
          </pre>
        </div>
      </div>
    );
  }

  // JSON RENDERING
  if (contentType?.includes('json')) {
    return (
      <div className={`bg-zinc-900 ${className} overflow-auto`}>
        <div className="p-4">
          <div className="mb-2 text-sm text-zinc-400">JSON Data</div>
          <pre className="text-xs text-green-400 font-mono bg-black p-3 rounded overflow-auto max-h-96">
            Loading...
          </pre>
        </div>
      </div>
    );
  }

  // FALLBACK - Unknown type, show download button
  return (
    <div className={`flex items-center justify-center bg-zinc-900 ${className}`}>
      <div className="text-center p-4">
        <svg className="w-16 h-16 text-zinc-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <p className="text-sm text-white mb-1">Unknown Content Type</p>
        <p className="text-xs text-zinc-400 mb-3">{contentType || 'application/octet-stream'}</p>
        <a
          href={contentUrl}
          download
          className="inline-block px-4 py-2 bg-amber-500 text-black rounded-lg hover:bg-amber-400 transition-colors text-sm font-medium"
        >
          Download
        </a>
      </div>
    </div>
  );
}
