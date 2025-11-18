import browser from 'webextension-polyfill';
import type { ZincProvider } from '@/types/provider';

/**
 * Content script that injects the Zinc Provider API into web pages
 */

// Create the provider object
const provider: ZincProvider = {
  isZincWallet: true,
  isConnected: false,
  
  async connect(): Promise<string> {
    const response = await sendRequest('connect', {});
    this.isConnected = true;
    return response;
  },
  
  async disconnect(): Promise<void> {
    this.isConnected = false;
  },
  
  async getAddress(): Promise<string> {
    return await sendRequest('getAddress', {});
  },
  
  async getBalance(): Promise<number> {
    return await sendRequest('getBalance', {});
  },
  
  async getNetwork(): Promise<'mainnet' | 'testnet'> {
    return await sendRequest('getNetwork', {});
  },
  
  async deployZrc20(params): Promise<string> {
    return await sendRequest('deployZrc20', params);
  },
  
  async mintZrc20(params): Promise<string> {
    return await sendRequest('mintZrc20', params);
  },
  
  async transferZrc20(params): Promise<string> {
    return await sendRequest('transferZrc20', params);
  },
  
  async deployCollection(params): Promise<string> {
    return await sendRequest('deployCollection', params);
  },
  
  async mintNft(params): Promise<string> {
    return await sendRequest('mintNft', params);
  },
  
  async getInscriptions(): Promise<any> {
    return await sendRequest('getInscriptions', {});
  },
  
  on(event: string, handler: (data: any) => void): void {
    // Event handling implementation
    window.addEventListener(`zincProvider:${event}`, ((e: CustomEvent) => {
      handler(e.detail);
    }) as EventListener);
  },
  
  removeListener(event: string, handler: (data: any) => void): void {
    window.removeEventListener(`zincProvider:${event}`, handler as EventListener);
  },
};

/**
 * Sends a request to the background script
 */
async function sendRequest(method: string, params: any): Promise<any> {
  const requestId = `${Date.now()}-${Math.random()}`;
  
  const response = await browser.runtime.sendMessage({
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
if (typeof window !== 'undefined') {
  (window as any).zincProvider = provider;
  
  // Announce provider availability
  window.dispatchEvent(new Event('zincProvider#initialized'));
  
  console.log('Zinc Provider injected');
}
