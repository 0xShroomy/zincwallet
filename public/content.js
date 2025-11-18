/**
 * Zinc Wallet Content Script
 * Injects the Zinc Provider API into web pages
 * 
 * IMPORTANT: This is plain JavaScript with NO bundling to avoid CSS/React injection
 */

'use strict';

(function() {
  // Check if already injected
  if (window.zincProvider) {
    return;
  }

  // Create the provider object
  const provider = {
    isZincWallet: true,
    isConnected: false,
    
    async connect() {
      const response = await sendRequest('connect', {});
      this.isConnected = true;
      return response;
    },
    
    async disconnect() {
      this.isConnected = false;
    },
    
    async getAddress() {
      return await sendRequest('getAddress', {});
    },
    
    async getBalance() {
      return await sendRequest('getBalance', {});
    },
    
    async getNetwork() {
      return await sendRequest('getNetwork', {});
    },
    
    async deployZrc20(params) {
      return await sendRequest('deployZrc20', params);
    },
    
    async mintZrc20(params) {
      return await sendRequest('mintZrc20', params);
    },
    
    async transferZrc20(params) {
      return await sendRequest('transferZrc20', params);
    },
    
    async deployCollection(params) {
      return await sendRequest('deployCollection', params);
    },
    
    async mintNft(params) {
      return await sendRequest('mintNft', params);
    },
    
    async getInscriptions() {
      return await sendRequest('getInscriptions', {});
    },
    
    on(event, handler) {
      window.addEventListener(`zincProvider:${event}`, (e) => {
        handler(e.detail);
      });
    },
    
    removeListener(event, handler) {
      window.removeEventListener(`zincProvider:${event}`, handler);
    },
  };

  /**
   * Sends a request to the background script
   */
  async function sendRequest(method, params) {
    const requestId = `${Date.now()}-${Math.random()}`;
    
    const response = await chrome.runtime.sendMessage({
      type: 'PROVIDER_REQUEST',
      data: {
        id: requestId,
        method,
        params,
        origin: window.location.origin,
        timestamp: Date.now(),
      },
    });
    
    if (response.error) {
      throw new Error(response.error.message);
    }
    
    return response.result;
  }

  // Inject the provider into the page
  window.zincProvider = provider;
  
  // Announce provider availability
  window.dispatchEvent(new Event('zincProvider#initialized'));
  
  console.log('[Zinc] Provider injected successfully');
})();
