# Zync Wallet dApp Integration Guide

## Overview
Enable your website or dApp to interact with Zync Wallet, similar to how MetaMask works for Ethereum.

---

## Quick Start for Developers

### 1. Detect Zync Wallet

```javascript
// Check if Zync Wallet is installed
if (window.zyncProvider) {
  console.log('Zync Wallet is installed!');
} else {
  console.log('Please install Zync Wallet');
}
```

### 2. Connect to Wallet

```javascript
async function connectWallet() {
  try {
    const response = await window.zyncProvider.request({
      method: 'zync_requestAccounts'
    });
    
    const address = response.result[0];
    console.log('Connected address:', address);
    return address;
  } catch (error) {
    console.error('User rejected connection:', error);
  }
}
```

### 3. Send Transaction

```javascript
async function sendZEC(recipient, amount) {
  try {
    const response = await window.zyncProvider.request({
      method: 'zync_sendTransaction',
      params: [{
        to: recipient,
        amount: amount * 100000000, // Convert ZEC to zatoshis
      }]
    });
    
    console.log('Transaction ID:', response.result);
    return response.result;
  } catch (error) {
    console.error('Transaction failed:', error);
  }
}
```

### 4. Create Inscription (ZRC-20 Deploy)

```javascript
async function deployToken() {
  try {
    const response = await window.zyncProvider.request({
      method: 'zync_createInscription',
      params: [{
        protocol: 'zinc', // or 'zerdinals'
        type: 'zrc20-deploy',
        data: {
          ticker: 'MYTOKEN',
          maxSupply: 1000000,
          mintLimit: 1000,
          decimals: 8
        }
      }]
    });
    
    console.log('Inscription created:', response.result);
    return response.result;
  } catch (error) {
    console.error('Inscription failed:', error);
  }
}
```

---

## Complete API Reference

### Provider Interface

```typescript
interface ZyncProvider {
  // Check if connected
  isConnected(): boolean;
  
  // Request permission to access accounts
  request(args: RequestArguments): Promise<ProviderResponse>;
  
  // Listen to events
  on(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
}

interface RequestArguments {
  method: string;
  params?: any[];
}

interface ProviderResponse {
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}
```

---

## Available Methods

### Account Management

#### `zync_requestAccounts`
Request user permission to access their accounts.

**Parameters:** None

**Returns:** `string[]` - Array of Zcash addresses

**Example:**
```javascript
const accounts = await window.zyncProvider.request({
  method: 'zync_requestAccounts'
});

console.log('Address:', accounts[0]);
```

---

#### `zync_accounts`
Get currently connected accounts (no permission prompt).

**Parameters:** None

**Returns:** `string[]` - Array of connected addresses

**Example:**
```javascript
const accounts = await window.zyncProvider.request({
  method: 'zync_accounts'
});
```

---

### Transaction Methods

#### `zync_sendTransaction`
Send ZEC to an address.

**Parameters:**
```typescript
{
  to: string;       // Recipient address
  amount: number;   // Amount in zatoshis (1 ZEC = 100,000,000 zatoshis)
  memo?: string;    // Optional transaction memo
}
```

**Returns:** `string` - Transaction ID (txid)

**Example:**
```javascript
const txid = await window.zyncProvider.request({
  method: 'zync_sendTransaction',
  params: [{
    to: 't1YourRecipientAddress...',
    amount: 100000000, // 1 ZEC
    memo: 'Payment for services'
  }]
});
```

---

#### `zync_signTransaction`
Sign a transaction without broadcasting.

**Parameters:**
```typescript
{
  hex: string;  // Raw transaction hex
}
```

**Returns:** `string` - Signed transaction hex

**Example:**
```javascript
const signedTx = await window.zyncProvider.request({
  method: 'zync_signTransaction',
  params: [{ hex: rawTxHex }]
});
```

---

### Inscription Methods

#### `zync_createInscription`
Create an inscription (Zinc or Zerdinals).

**Parameters:**
```typescript
{
  protocol: 'zinc' | 'zerdinals';
  type: 'zrc20-deploy' | 'zrc20-mint' | 'zrc20-transfer' | 'nft';
  data: any;  // Protocol-specific data
}
```

**Returns:** `string` - Transaction ID

**Example - Deploy ZRC-20:**
```javascript
const txid = await window.zyncProvider.request({
  method: 'zync_createInscription',
  params: [{
    protocol: 'zinc',
    type: 'zrc20-deploy',
    data: {
      ticker: 'CASH',
      maxSupply: 1000000,
      mintLimit: 1000,
      decimals: 8
    }
  }]
});
```

**Example - Mint ZRC-20:**
```javascript
const txid = await window.zyncProvider.request({
  method: 'zync_createInscription',
  params: [{
    protocol: 'zinc',
    type: 'zrc20-mint',
    data: {
      ticker: 'CASH',
      amount: 1000
    }
  }]
});
```

**Example - Create NFT:**
```javascript
const txid = await window.zyncProvider.request({
  method: 'zync_createInscription',
  params: [{
    protocol: 'zerdinals',
    type: 'nft',
    data: {
      contentType: 'image/png',
      content: base64ImageData,
      metadata: {
        name: 'Cool NFT',
        description: 'My first Zcash NFT'
      }
    }
  }]
});
```

---

### Query Methods

#### `zync_getBalance`
Get account balance.

**Parameters:** None

**Returns:**
```typescript
{
  balance: number;      // Balance in zatoshis
  zec: number;          // Balance in ZEC
  usd: number;          // Balance in USD (if available)
}
```

**Example:**
```javascript
const balance = await window.zyncProvider.request({
  method: 'zync_getBalance'
});

console.log(`Balance: ${balance.zec} ZEC`);
```

---

#### `zync_getInscriptions`
Get user's inscriptions.

**Parameters:** None

**Returns:**
```typescript
{
  zinc: {
    zrc20: TokenBalance[];
    nfts: NFT[];
  };
  zerdinals: {
    inscriptions: Inscription[];
  };
}
```

**Example:**
```javascript
const inscriptions = await window.zyncProvider.request({
  method: 'zync_getInscriptions'
});

console.log('ZRC-20 Tokens:', inscriptions.zinc.zrc20);
```

---

### Network Methods

#### `zync_getChainId`
Get current network chain ID.

**Parameters:** None

**Returns:** `string` - Chain ID (`"mainnet"` or `"testnet"`)

**Example:**
```javascript
const chainId = await window.zyncProvider.request({
  method: 'zync_getChainId'
});
```

---

## Events

### `accountsChanged`
Fired when user switches accounts.

**Handler:** `(accounts: string[]) => void`

**Example:**
```javascript
window.zyncProvider.on('accountsChanged', (accounts) => {
  console.log('New account:', accounts[0]);
  // Update your UI
});
```

---

### `chainChanged`
Fired when user switches networks.

**Handler:** `(chainId: string) => void`

**Example:**
```javascript
window.zyncProvider.on('chainChanged', (chainId) => {
  console.log('Network changed to:', chainId);
  // Reload your dApp
  window.location.reload();
});
```

---

### `disconnect`
Fired when wallet is disconnected.

**Handler:** `() => void`

**Example:**
```javascript
window.zyncProvider.on('disconnect', () => {
  console.log('Wallet disconnected');
  // Clear user session
});
```

---

## Complete Example: NFT Marketplace

```html
<!DOCTYPE html>
<html>
<head>
  <title>Zcash NFT Marketplace</title>
</head>
<body>
  <h1>Zcash NFT Marketplace</h1>
  
  <button id="connect">Connect Wallet</button>
  <div id="account"></div>
  <div id="balance"></div>
  
  <hr>
  
  <h2>Mint NFT</h2>
  <input type="file" id="imageInput" accept="image/*">
  <button id="mintBtn">Mint NFT</button>
  
  <script>
    let currentAccount = null;
    
    // Check if Zync Wallet is installed
    if (!window.zyncProvider) {
      alert('Please install Zync Wallet!');
    }
    
    // Connect button
    document.getElementById('connect').addEventListener('click', async () => {
      try {
        const accounts = await window.zyncProvider.request({
          method: 'zync_requestAccounts'
        });
        
        currentAccount = accounts[0];
        document.getElementById('account').textContent = 
          `Connected: ${currentAccount}`;
        
        // Get balance
        const balance = await window.zyncProvider.request({
          method: 'zync_getBalance'
        });
        
        document.getElementById('balance').textContent = 
          `Balance: ${balance.zec} ZEC`;
          
      } catch (error) {
        console.error('Connection failed:', error);
      }
    });
    
    // Mint NFT button
    document.getElementById('mintBtn').addEventListener('click', async () => {
      if (!currentAccount) {
        alert('Please connect wallet first!');
        return;
      }
      
      const fileInput = document.getElementById('imageInput');
      if (!fileInput.files[0]) {
        alert('Please select an image!');
        return;
      }
      
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target.result.split(',')[1];
        
        try {
          const txid = await window.zyncProvider.request({
            method: 'zync_createInscription',
            params: [{
              protocol: 'zerdinals',
              type: 'nft',
              data: {
                contentType: fileInput.files[0].type,
                content: base64,
                metadata: {
                  name: 'My NFT',
                  description: 'Created via marketplace'
                }
              }
            }]
          });
          
          alert(`NFT minted! Transaction: ${txid}`);
        } catch (error) {
          console.error('Mint failed:', error);
          alert('Minting failed: ' + error.message);
        }
      };
      
      reader.readAsDataURL(fileInput.files[0]);
    });
    
    // Listen for account changes
    window.zyncProvider.on('accountsChanged', (accounts) => {
      currentAccount = accounts[0] || null;
      document.getElementById('account').textContent = 
        currentAccount ? `Connected: ${currentAccount}` : 'Disconnected';
    });
  </script>
</body>
</html>
```

---

## React Example

```tsx
import { useState, useEffect } from 'react';

declare global {
  interface Window {
    zyncProvider?: any;
  }
}

export default function ZyncWalletConnect() {
  const [account, setAccount] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  
  useEffect(() => {
    if (window.zyncProvider) {
      // Listen for account changes
      window.zyncProvider.on('accountsChanged', (accounts: string[]) => {
        setAccount(accounts[0] || null);
      });
    }
  }, []);
  
  async function connect() {
    try {
      const accounts = await window.zyncProvider.request({
        method: 'zync_requestAccounts'
      });
      
      setAccount(accounts[0]);
      
      const balanceRes = await window.zyncProvider.request({
        method: 'zync_getBalance'
      });
      
      setBalance(balanceRes.zec);
    } catch (error) {
      console.error('Connection failed:', error);
    }
  }
  
  async function sendTransaction() {
    try {
      const txid = await window.zyncProvider.request({
        method: 'zync_sendTransaction',
        params: [{
          to: 't1RecipientAddress...',
          amount: 10000000 // 0.1 ZEC
        }]
      });
      
      alert(`Transaction sent: ${txid}`);
    } catch (error) {
      console.error('Transaction failed:', error);
    }
  }
  
  return (
    <div>
      {account ? (
        <div>
          <p>Connected: {account}</p>
          <p>Balance: {balance} ZEC</p>
          <button onClick={sendTransaction}>Send 0.1 ZEC</button>
        </div>
      ) : (
        <button onClick={connect}>Connect Zync Wallet</button>
      )}
    </div>
  );
}
```

---

## Testing Your Integration

### 1. Install Zync Wallet
Download from Chrome Web Store (or load unpacked for development)

### 2. Open Browser Console
```javascript
// Check if provider is available
console.log(window.zyncProvider);

// Test connection
await window.zyncProvider.request({ method: 'zync_requestAccounts' });
```

### 3. Test on Testnet First
Always test your dApp on Zcash testnet before mainnet!

---

## Best Practices

### 1. Always Check Provider Exists
```javascript
if (!window.zyncProvider) {
  // Show "Install Zync Wallet" button
}
```

### 2. Handle Errors Gracefully
```javascript
try {
  await window.zyncProvider.request({ ... });
} catch (error) {
  if (error.code === 4001) {
    // User rejected
  } else {
    // Other error
  }
}
```

### 3. Listen to Events
```javascript
window.zyncProvider.on('accountsChanged', updateUI);
window.zyncProvider.on('chainChanged', () => window.location.reload());
```

### 4. Convert Amounts Correctly
```javascript
// ZEC to zatoshis
const zatoshis = zec * 100000000;

// Zatoshis to ZEC
const zec = zatoshis / 100000000;
```

---

## Support

- Documentation: https://docs.zyncwallet.com
- GitHub: https://github.com/your-repo/zync-wallet
- Discord: https://discord.gg/zyncwallet
- Email: support@zyncwallet.com

---

## Examples Repository

Check out our examples repo for more integration samples:
- https://github.com/your-repo/zync-wallet-examples

Includes:
- NFT marketplace
- Token swap DEX
- DeFi lending platform
- Gaming integration
