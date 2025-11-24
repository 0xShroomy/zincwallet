/**
 * Zync Wallet Provider - Injected into every webpage
 * This script is injected into the page context and provides the window.zyncwallet API
 */

(function() {
  'use strict';
  
  console.log('[ZyncWallet] Provider injecting...');
  
  // Prevent double injection
  if (window.zyncwallet) {
    console.log('[ZyncWallet] Provider already injected');
    return;
  }
  
  // Event emitter for provider events
  class EventEmitter {
    constructor() {
      this.events = {};
    }
    
    on(event, callback) {
      if (!this.events[event]) {
        this.events[event] = [];
      }
      this.events[event].push(callback);
    }
    
    removeListener(event, callback) {
      if (!this.events[event]) return;
      this.events[event] = this.events[event].filter(cb => cb !== callback);
    }
    
    emit(event, data) {
      if (!this.events[event]) return;
      this.events[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[ZyncWallet] Error in ${event} listener:`, error);
        }
      });
    }
  }
  
  // Request ID generator
  let requestId = 0;
  function generateRequestId() {
    return `zyncwallet_${Date.now()}_${++requestId}`;
  }
  
  // Pending requests
  const pendingRequests = new Map();
  
  // Send message to content script
  function sendMessageToExtension(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = generateRequestId();
      
      // Store promise callbacks
      pendingRequests.set(id, { resolve, reject });
      
      // Set timeout
      const timeout = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }, 30000); // 30 second timeout
      
      // Clear timeout when resolved
      const originalResolve = resolve;
      const originalReject = reject;
      
      pendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          pendingRequests.delete(id);
          originalResolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          pendingRequests.delete(id);
          originalReject(error);
        }
      });
      
      // Send message via custom event
      window.postMessage({
        target: 'zyncwallet-contentscript',
        data: {
          id,
          method,
          params
        }
      }, '*');
    });
  }
  
  // Listen for responses from content script
  window.addEventListener('message', (event) => {
    // Only accept messages from same window
    if (event.source !== window) return;
    
    // Only accept messages for us
    if (!event.data || event.data.target !== 'zyncwallet-inpage') return;
    
    const { id, result, error, event: eventName, eventData } = event.data.data;
    
    // Handle events
    if (eventName) {
      emitter.emit(eventName, eventData);
      return;
    }
    
    // Handle responses
    const pending = pendingRequests.get(id);
    if (!pending) return;
    
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
  });
  
  // Event emitter instance
  const emitter = new EventEmitter();
  
  // Connection state
  let isConnected = false;
  let currentAddress = null;
  let currentNetwork = 'mainnet';
  
  // Zync Wallet Provider API
  const zyncwallet = {
    // Provider info
    isZyncWallet: true,
    version: '1.0.0',
    
    // Connection methods
    async connect() {
      try {
        const result = await sendMessageToExtension('connect');
        isConnected = true;
        currentAddress = result.address;
        currentNetwork = result.network;
        emitter.emit('connect', { address: currentAddress });
        return result;
      } catch (error) {
        console.error('[ZyncWallet] Connect error:', error);
        throw error;
      }
    },
    
    async disconnect() {
      try {
        await sendMessageToExtension('disconnect');
        isConnected = false;
        currentAddress = null;
        emitter.emit('disconnect');
        return { success: true };
      } catch (error) {
        console.error('[ZyncWallet] Disconnect error:', error);
        throw error;
      }
    },
    
    isConnected() {
      return isConnected;
    },
    
    // Account methods
    async getAddress() {
      if (!isConnected) {
        throw new Error('Not connected. Call connect() first.');
      }
      return sendMessageToExtension('getAddress');
    },
    
    async getPublicKey() {
      if (!isConnected) {
        throw new Error('Not connected. Call connect() first.');
      }
      return sendMessageToExtension('getPublicKey');
    },
    
    async getNetwork() {
      if (!isConnected) {
        throw new Error('Not connected. Call connect() first.');
      }
      return sendMessageToExtension('getNetwork');
    },
    
    // Balance methods
    async getBalance() {
      if (!isConnected) {
        throw new Error('Not connected. Call connect() first.');
      }
      return sendMessageToExtension('getBalance');
    },
    
    // Transaction methods
    async sendZec({ to, amount }) {
      if (!isConnected) {
        throw new Error('Not connected. Call connect() first.');
      }
      return sendMessageToExtension('sendZec', { to, amount });
    },
    
    // Zinc Protocol (OP_RETURN) methods
    async deployZrc20({ tick, max, limit, decimals }) {
      if (!isConnected) {
        throw new Error('Not connected. Call connect() first.');
      }
      return sendMessageToExtension('deployZrc20', { tick, max, limit, decimals });
    },
    
    async mintZrc20({ deployTxid, amount }) {
      if (!isConnected) {
        throw new Error('Not connected. Call connect() first.');
      }
      return sendMessageToExtension('mintZrc20', { deployTxid, amount });
    },
    
    async transferZrc20({ deployTxid, amount, to }) {
      if (!isConnected) {
        throw new Error('Not connected. Call connect() first.');
      }
      return sendMessageToExtension('transferZrc20', { deployTxid, amount, to });
    },
    
    async deployCollection({ name, metadata }) {
      if (!isConnected) {
        throw new Error('Not connected. Call connect() first.');
      }
      return sendMessageToExtension('deployCollection', { name, metadata });
    },
    
    async mintNft({ collectionTxid, content, mimeType }) {
      if (!isConnected) {
        throw new Error('Not connected. Call connect() first.');
      }
      return sendMessageToExtension('mintNft', { collectionTxid, content, mimeType });
    },
    
    // Zerdinals Protocol (ScriptSig) methods
    async inscribe({ contentType, content }) {
      if (!isConnected) {
        throw new Error('Not connected. Call connect() first.');
      }
      return sendMessageToExtension('inscribe', { contentType, content });
    },
    
    // Signature methods
    async signMessage(message) {
      if (!isConnected) {
        throw new Error('Not connected. Call connect() first.');
      }
      return sendMessageToExtension('signMessage', { message });
    },
    
    // Event methods
    on(event, callback) {
      emitter.on(event, callback);
    },
    
    off(event, callback) {
      emitter.removeListener(event, callback);
    },
    
    removeListener(event, callback) {
      emitter.removeListener(event, callback);
    }
  };
  
  // Freeze the provider to prevent modifications
  Object.freeze(zyncwallet);
  
  // Inject into window
  window.zyncwallet = zyncwallet;
  
  console.log('[ZyncWallet] Provider injected successfully');
  
  // Announce provider availability
  window.dispatchEvent(new Event('zyncwallet#initialized'));
})();
