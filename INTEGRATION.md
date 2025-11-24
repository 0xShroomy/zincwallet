# Zync Wallet Integration Guide

Complete guide for integrating Zync Wallet into your Zcash dApp.

## Table of Contents
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Methods](#core-methods)
- [Token & NFT Methods](#token--nft-methods)
- [Event Listeners](#event-listeners)
- [Error Handling](#error-handling)
- [TypeScript Support](#typescript-support)
- [Examples](#examples)

---

## Installation

Zync Wallet is a browser extension. Users install it from the Chrome Web Store (or load it unpacked for development).

**No npm package needed** - the wallet injects `window.zyncwallet` into every webpage automatically.

---

## Quick Start

```javascript
// 1. Check if Zync Wallet is installed
if (window.zyncwallet) {
  console.log('Zync Wallet detected!');
  
  // 2. Connect to the wallet
  const result = await window.zyncwallet.connect();
  console.log('Connected:', result.address);
  console.log('Network:', result.network);
  
  // 3. Get balance
  const balance = await window.zyncwallet.getBalance();
  console.log('Balance:', balance.balanceZec, 'ZEC');
  
  // 4. Sign a message (for authentication)
  const signature = await window.zyncwallet.signMessage('Login to MyApp');
  console.log('Signature:', signature.signature);
  
} else {
  console.log('Please install Zync Wallet');
}
```

---

## Core Methods

### connect()
Request connection to user's wallet. Opens approval popup.

```javascript
const result = await window.zyncwallet.connect();
// Returns: {
//   address: "t1...",
//   network: "mainnet" | "testnet",
//   connected: true
// }
```

**When to use:** First time your dApp needs wallet access.

---

### disconnect()
Disconnect from the wallet.

```javascript
await window.zyncwallet.disconnect();
// Returns: { success: true }
```

---

### getAddress()
Get user's Zcash address.

```javascript
const result = await window.zyncwallet.getAddress();
// Returns: { address: "t1..." }
```

**Requires:** User must be connected first.

---

### getBalance()
Get user's ZEC balance.

```javascript
const result = await window.zyncwallet.getBalance();
// Returns: {
//   balance: 1685775,      // zatoshis
//   balanceZec: "0.01685775" // ZEC
// }
```

---

### getNetwork()
Get current network (mainnet/testnet).

```javascript
const result = await window.zyncwallet.getNetwork();
// Returns: { network: "mainnet" | "testnet" }
```

---

### signMessage(message)
Sign a message for authentication or proof of ownership.

```javascript
const result = await window.zyncwallet.signMessage('Login to MyApp at ' + Date.now());
// Returns: {
//   signature: "304402...", // DER-encoded secp256k1 signature
//   address: "t1...",
//   message: "Login to MyApp..."
// }
```

**Use cases:**
- Login/authentication ("Sign in with Wallet")
- Proof of ownership
- Off-chain verification
- Zero-cost authentication (no gas fees)

---

### sendZec({ to, amount })
Send ZEC to an address.

```javascript
const result = await window.zyncwallet.sendZec({
  to: 't1...',      // Recipient address
  amount: 0.001     // Amount in ZEC
});
// Returns: { success: true, txid: "abc..." }
```

**Note:** Opens approval popup for user confirmation.

---

## Token & NFT Methods

### Deploy ZRC-20 Token
```javascript
const result = await window.zyncwallet.deployZrc20({
  tick: 'TEST',     // Token ticker (4 chars)
  max: 21000000,    // Max supply
  limit: 1000,      // Per-mint limit
  decimals: 8       // Decimal places
});
// Returns: { success: true, txid: "..." }
```

---

### Mint ZRC-20 Tokens
```javascript
const result = await window.zyncwallet.mintZrc20({
  deployTxid: 'abc...',  // Deploy transaction ID
  amount: 100            // Amount to mint
});
// Returns: { success: true, txid: "..." }
```

---

### Transfer ZRC-20 Tokens
```javascript
const result = await window.zyncwallet.transferZrc20({
  deployTxid: 'abc...',  // Token deploy txid
  amount: 50,            // Amount to transfer
  to: 't1...'           // Recipient address
});
// Returns: { success: true, txid: "..." }
```

---

### Deploy NFT Collection
```javascript
const result = await window.zyncwallet.deployCollection({
  name: 'My Collection',
  metadata: { description: '...' }
});
// Returns: { success: true, txid: "..." }
```

---

### Mint NFT
```javascript
const result = await window.zyncwallet.mintNft({
  collectionTxid: 'abc...',  // Collection deploy txid
  content: '<svg>...</svg>',  // NFT content
  mimeType: 'image/svg+xml'   // Content type
});
// Returns: { success: true, txid: "..." }
```

---

### Create Inscription (Zerdinals)
```javascript
const result = await window.zyncwallet.inscribe({
  contentType: 'text/plain',     // MIME type
  content: 'Hello, blockchain!'  // Content to inscribe
});
// Returns: { success: true, txid: "..." }
```

**Supported types:** text/plain, application/json, image/png, image/svg+xml, etc.

---

## Event Listeners

Listen for wallet changes in real-time.

### accountsChanged
Triggered when user switches wallets.

```javascript
window.zyncwallet.on('accountsChanged', ({ address }) => {
  console.log('User switched to:', address);
  // Update your UI with new address
});
```

---

### networkChanged
Triggered when user switches network (mainnet ↔ testnet).

```javascript
window.zyncwallet.on('networkChanged', ({ network }) => {
  console.log('Network changed to:', network);
  // Reload data for new network
});
```

---

### disconnect
Triggered when wallet disconnects.

```javascript
window.zyncwallet.on('disconnect', () => {
  console.log('Wallet disconnected');
  // Clear user session
});
```

---

### Remove Listeners
```javascript
const handler = ({ address }) => console.log(address);

// Add listener
window.zyncwallet.on('accountsChanged', handler);

// Remove listener
window.zyncwallet.off('accountsChanged', handler);
```

---

## Error Handling

All methods return promises and throw errors on failure.

```javascript
try {
  const result = await window.zyncwallet.connect();
  console.log('Success:', result);
} catch (error) {
  console.error('Error:', error.message);
  
  // Common errors:
  // - "User rejected connection request"
  // - "Wallet is locked"
  // - "Not connected. Call connect() first."
  // - "Permission denied"
}
```

### Check Connection Before Actions
```javascript
async function sendTransaction() {
  if (!window.zyncwallet) {
    alert('Please install Zync Wallet');
    return;
  }
  
  try {
    await window.zyncwallet.sendZec({ to: '...', amount: 0.01 });
  } catch (error) {
    if (error.message.includes('Not connected')) {
      // Reconnect and retry
      await window.zyncwallet.connect();
      await window.zyncwallet.sendZec({ to: '...', amount: 0.01 });
    } else {
      alert('Transaction failed: ' + error.message);
    }
  }
}
```

---

## TypeScript Support

For TypeScript projects, copy the `zyncwallet.d.ts` file from this repository into your project's `src/types/` directory.

This provides full IntelliSense and type checking for all Zync Wallet methods.

```typescript
// Your TypeScript file
const result = await window.zyncwallet.connect();
// TypeScript knows result has: { address: string, network: string }
```

---

## Examples

### Login with Wallet
```javascript
async function loginWithWallet() {
  try {
    // Connect
    const { address } = await window.zyncwallet.connect();
    
    // Sign message for authentication
    const message = `Login to MyDapp at ${new Date().toISOString()}`;
    const { signature } = await window.zyncwallet.signMessage(message);
    
    // Send to your backend for verification
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, message, signature })
    });
    
    const { token } = await response.json();
    localStorage.setItem('authToken', token);
    
    console.log('Logged in as:', address);
  } catch (error) {
    console.error('Login failed:', error.message);
  }
}
```

---

### Payment Button
```javascript
async function handlePayment() {
  const recipientAddress = 't1YourAddressHere';
  const amount = 0.01; // 0.01 ZEC
  
  try {
    const result = await window.zyncwallet.sendZec({
      to: recipientAddress,
      amount: amount
    });
    
    alert('Payment successful! TXID: ' + result.txid);
    
    // Verify payment on your backend
    await fetch('/api/verify-payment', {
      method: 'POST',
      body: JSON.stringify({ txid: result.txid })
    });
    
  } catch (error) {
    alert('Payment failed: ' + error.message);
  }
}
```

---

### Real-time Updates
```javascript
// Initialize app
async function initWallet() {
  if (!window.zyncwallet) {
    showInstallPrompt();
    return;
  }
  
  // Set up event listeners
  window.zyncwallet.on('accountsChanged', async ({ address }) => {
    console.log('Account changed:', address);
    await loadUserData(address);
  });
  
  window.zyncwallet.on('networkChanged', ({ network }) => {
    console.log('Network changed:', network);
    showNetworkBadge(network);
  });
  
  window.zyncwallet.on('disconnect', () => {
    console.log('Disconnected');
    clearUserSession();
  });
  
  // Try to connect
  try {
    const { address } = await window.zyncwallet.connect();
    await loadUserData(address);
  } catch (error) {
    console.log('Not connected yet');
  }
}

// Load on page load
window.addEventListener('load', initWallet);
```

---

### Check Balance Before Action
```javascript
async function mintToken() {
  try {
    // Check balance first
    const { balanceZec } = await window.zyncwallet.getBalance();
    const balance = parseFloat(balanceZec);
    
    if (balance < 0.001) {
      alert('Insufficient balance. Need at least 0.001 ZEC for fees.');
      return;
    }
    
    // Proceed with minting
    const result = await window.zyncwallet.mintZrc20({
      deployTxid: 'abc123...',
      amount: 100
    });
    
    alert('Mint successful! TXID: ' + result.txid);
    
  } catch (error) {
    alert('Mint failed: ' + error.message);
  }
}
```

---

## Best Practices

### 1. Always Check for Wallet
```javascript
if (!window.zyncwallet) {
  // Show install prompt
  return;
}
```

### 2. Handle Rejections Gracefully
```javascript
try {
  await window.zyncwallet.connect();
} catch (error) {
  if (error.message.includes('rejected')) {
    console.log('User cancelled connection');
  }
}
```

### 3. Listen for Changes
Always set up event listeners to detect wallet/network changes.

### 4. Verify on Backend
Never trust client-side signatures alone. Always verify signatures and transactions on your backend.

### 5. Show Network Badge
Let users know which network they're on (mainnet vs testnet).

---

## Support

- **Twitter:** [@0xShinno](https://twitter.com/0xShinno)
- **GitHub:** [github.com/zyncwallet](https://github.com/zyncwallet)
- **Email:** support@zyncwallet.xyz

---

## License

MIT License - Free to use in commercial and open-source projects.
