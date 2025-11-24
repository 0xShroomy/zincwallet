/**
 * Zync Wallet TypeScript Definitions
 * 
 * Copy this file to your TypeScript project for full IntelliSense support
 * when integrating with Zync Wallet.
 * 
 * Place in: src/types/zyncwallet.d.ts
 */

/**
 * Zync Wallet Provider Interface
 * Injected as window.zyncwallet
 */
interface ZyncWallet {
  // Provider identification
  readonly isZyncWallet: true;
  readonly version: string;
  
  // ============================================================================
  // CONNECTION METHODS
  // ============================================================================
  
  /**
   * Connect to the wallet
   * Opens approval popup for user to grant permission
   * @returns Connection result with address and network
   */
  connect(): Promise<{
    address: string;
    network: 'mainnet' | 'testnet';
    connected: boolean;
    publicKey: string | null;
  }>;
  
  /**
   * Disconnect from the wallet
   * Revokes all permissions
   */
  disconnect(): Promise<{
    success: boolean;
  }>;
  
  /**
   * Check if wallet is currently connected
   */
  isConnected(): boolean;
  
  // ============================================================================
  // ACCOUNT METHODS
  // ============================================================================
  
  /**
   * Get current wallet address
   * Requires: User must be connected
   */
  getAddress(): Promise<{
    address: string;
  }>;
  
  /**
   * Get wallet public key
   * Requires: User must be connected
   */
  getPublicKey(): Promise<{
    publicKey: string | null;
  }>;
  
  /**
   * Get current network (mainnet or testnet)
   * Requires: User must be connected
   */
  getNetwork(): Promise<{
    network: 'mainnet' | 'testnet';
  }>;
  
  /**
   * Get wallet ZEC balance
   * Requires: User must be connected
   */
  getBalance(): Promise<{
    balance: number;      // Balance in zatoshis
    balanceZec: string;   // Balance in ZEC (formatted string)
  }>;
  
  // ============================================================================
  // SIGNATURE METHODS
  // ============================================================================
  
  /**
   * Sign a message for authentication or proof of ownership
   * No gas fees, off-chain operation
   * 
   * @param message - Message to sign
   * @returns Signature details
   * 
   * @example
   * const result = await window.zyncwallet.signMessage('Login to MyApp');
   * // Verify signature on your backend
   */
  signMessage(message: string): Promise<{
    signature: string;  // DER-encoded secp256k1 signature (hex)
    address: string;    // Signer's address
    message: string;    // Original message
  }>;
  
  // ============================================================================
  // TRANSACTION METHODS
  // ============================================================================
  
  /**
   * Send ZEC to an address
   * Opens approval popup for user confirmation
   * 
   * @param params - Transaction parameters
   * @returns Transaction result with txid
   */
  sendZec(params: {
    to: string;      // Recipient t-address
    amount: number;  // Amount in ZEC (e.g., 0.01)
  }): Promise<{
    success: boolean;
    txid: string;
  }>;
  
  // ============================================================================
  // ZINC PROTOCOL (OP_RETURN) - TOKEN METHODS
  // ============================================================================
  
  /**
   * Deploy a new ZRC-20 token
   * 
   * @param params - Token parameters
   * @returns Deploy transaction result
   */
  deployZrc20(params: {
    tick: string;     // Token ticker (4 characters)
    max: number;      // Maximum supply
    limit: number;    // Per-mint limit
    decimals: number; // Decimal places (0-8)
  }): Promise<{
    success: boolean;
    txid: string;
  }>;
  
  /**
   * Mint ZRC-20 tokens
   * 
   * @param params - Mint parameters
   * @returns Mint transaction result
   */
  mintZrc20(params: {
    deployTxid: string;  // Deploy transaction ID
    amount: number;      // Amount to mint
  }): Promise<{
    success: boolean;
    txid: string;
  }>;
  
  /**
   * Transfer ZRC-20 tokens to another address
   * 
   * @param params - Transfer parameters
   * @returns Transfer transaction result
   */
  transferZrc20(params: {
    deployTxid: string;  // Token deploy transaction ID
    amount: number;      // Amount to transfer
    to: string;          // Recipient t-address
  }): Promise<{
    success: boolean;
    txid: string;
  }>;
  
  // ============================================================================
  // ZINC PROTOCOL (OP_RETURN) - NFT METHODS
  // ============================================================================
  
  /**
   * Deploy an NFT collection
   * 
   * @param params - Collection parameters
   * @returns Deploy transaction result
   */
  deployCollection(params: {
    name: string;                    // Collection name
    metadata: Record<string, unknown>;  // Collection metadata (JSON)
  }): Promise<{
    success: boolean;
    txid: string;
  }>;
  
  /**
   * Mint an NFT in a collection
   * 
   * @param params - NFT parameters
   * @returns Mint transaction result
   */
  mintNft(params: {
    collectionTxid: string;  // Collection deploy transaction ID
    content: string;         // NFT content (SVG, base64, etc.)
    mimeType: string;        // Content MIME type
  }): Promise<{
    success: boolean;
    txid: string;
  }>;
  
  // ============================================================================
  // ZERDINALS PROTOCOL (SCRIPTSIG) - INSCRIPTION METHODS
  // ============================================================================
  
  /**
   * Create a Zerdinals inscription
   * Embeds arbitrary data in the blockchain
   * 
   * @param params - Inscription parameters
   * @returns Inscription transaction result
   * 
   * @example
   * // Text inscription
   * await window.zyncwallet.inscribe({
   *   contentType: 'text/plain',
   *   content: 'Hello, blockchain!'
   * });
   * 
   * // JSON inscription
   * await window.zyncwallet.inscribe({
   *   contentType: 'application/json',
   *   content: JSON.stringify({ message: 'Data' })
   * });
   */
  inscribe(params: {
    contentType: string;  // MIME type (text/plain, application/json, image/svg+xml, etc.)
    content: string;      // Content to inscribe
  }): Promise<{
    success: boolean;
    txid: string;
  }>;
  
  // ============================================================================
  // EVENT METHODS
  // ============================================================================
  
  /**
   * Listen for wallet events
   * 
   * @param event - Event name
   * @param callback - Event handler
   * 
   * @example
   * window.zyncwallet.on('accountsChanged', ({ address }) => {
   *   console.log('Switched to:', address);
   * });
   */
  on(event: 'accountsChanged', callback: (data: { address: string }) => void): void;
  on(event: 'networkChanged', callback: (data: { network: 'mainnet' | 'testnet' }) => void): void;
  on(event: 'disconnect', callback: () => void): void;
  on(event: 'connect', callback: (data: { address: string }) => void): void;
  
  /**
   * Remove event listener (alias for removeListener)
   * 
   * @param event - Event name
   * @param callback - Event handler to remove
   */
  off(event: string, callback: (...args: unknown[]) => void): void;
  
  /**
   * Remove event listener
   * 
   * @param event - Event name
   * @param callback - Event handler to remove
   */
  removeListener(event: string, callback: (...args: unknown[]) => void): void;
}

/**
 * Extend Window interface to include zyncwallet
 */
declare global {
  interface Window {
    /**
     * Zync Wallet Provider
     * Injected by the Zync Wallet browser extension
     * 
     * Check for existence before using:
     * ```typescript
     * if (window.zyncwallet) {
     *   await window.zyncwallet.connect();
     * }
     * ```
     */
    zyncwallet?: ZyncWallet;
  }
}

// Allow this file to be treated as a module
export {};
