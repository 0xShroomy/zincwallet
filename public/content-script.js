/**
 * Zync Wallet Content Script - Bridge between webpage and extension
 * Runs in isolated context with access to both page and extension APIs
 */

console.log('[ZyncWallet] Content script loaded');

// Inject the provider script into the page
function injectProvider() {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = function() {
      this.remove();
      console.log('[ZyncWallet] Provider script injected');
    };
    (document.head || document.documentElement).appendChild(script);
  } catch (error) {
    console.error('[ZyncWallet] Failed to inject provider:', error);
  }
}

// Inject as soon as possible
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectProvider);
} else {
  injectProvider();
}

// Listen for messages from the injected provider
window.addEventListener('message', async (event) => {
  // Only accept messages from same window
  if (event.source !== window) return;
  
  // Only accept messages for us
  if (!event.data || event.data.target !== 'zyncwallet-contentscript') return;
  
  const { id, method, params } = event.data.data;
  
  console.log('[ZyncWallet] Received request:', method, params);
  
  try {
    // Forward to background script
    const response = await chrome.runtime.sendMessage({
      type: 'DAPP_REQUEST',
      data: {
        id,
        method,
        params,
        origin: window.location.origin,
        url: window.location.href,
        favicon: getFavicon(),
        title: document.title
      }
    });
    
    console.log('[ZyncWallet] Response from background:', response);
    
    // Send response back to page
    window.postMessage({
      target: 'zyncwallet-inpage',
      data: {
        id,
        result: response.success ? response.data : null,
        error: response.success ? null : response.error
      }
    }, '*');
    
  } catch (error) {
    console.error('[ZyncWallet] Request failed:', error);
    
    // Send error back to page
    window.postMessage({
      target: 'zyncwallet-inpage',
      data: {
        id,
        result: null,
        error: error.message || 'Request failed'
      }
    }, '*');
  }
});

// Listen for events from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DAPP_EVENT') {
    console.log('[ZyncWallet] Received event from background:', message.event);
    
    // Forward event to page
    window.postMessage({
      target: 'zyncwallet-inpage',
      data: {
        event: message.event,
        eventData: message.data
      }
    }, '*');
    
    sendResponse({ success: true });
  }
  
  return true; // Keep message channel open for async response
});

// Helper: Get favicon URL
function getFavicon() {
  // Try to find favicon link
  const faviconLink = document.querySelector('link[rel~="icon"]');
  if (faviconLink && faviconLink.href) {
    return faviconLink.href;
  }
  
  // Try default favicon.ico
  const origin = window.location.origin;
  return `${origin}/favicon.ico`;
}

// Notify that content script is ready
console.log('[ZyncWallet] Content script ready');
