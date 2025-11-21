# Zync Wallet - Browser Extension

A fully functional browser extension wallet for the **Zinc Protocol** on Zcash, supporting ZRC-20 tokens, NFT inscriptions, and dApp integration.

## Features

- **Secure Wallet Management**: Generate or import 24-word mnemonic seed phrases with encrypted local storage
- **Transparent Addresses**: Full support for Zcash t-addresses (P2PKH)
- **ZRC-20 Tokens**: Deploy, mint, and transfer fungible tokens on Zinc Protocol
- **NFT Inscriptions**: Deploy collections and mint NFTs with IPFS, Arweave, HTTP, or plaintext content
- **dApp Provider API**: Enable web applications to interact with your wallet via `window.zincProvider`
- **Treasury Tips**: Automatic inclusion of mandatory 150,000 zatoshi tips for Zinc indexer
- **Testnet & Mainnet**: Switch between networks for safe testing

## Prerequisites

- Node.js 18+ and pnpm
- Chrome or Firefox browser
- Access to a lightwalletd proxy (testnet or mainnet)

## Installation (Development)

### 1. Clone and Setup

```bash
cd ZincWallet
pnpm install
```

### 2. Configure Network

Create a `.env` file in the root directory:

```env
# Testnet
VITE_LIGHTWALLETD_URL=https://testnet.lightwalletd.com:9067
VITE_NETWORK=testnet

# Mainnet (uncomment to use)
# VITE_LIGHTWALLETD_URL=https://mainnet.lightwalletd.com:9067
# VITE_NETWORK=mainnet

# Zinc Protocol
VITE_ZINC_TREASURY_ADDRESS=t1YourTreasuryAddressHere
VITE_ZINC_MIN_TIP=150000
```

### 3. Build the Extension

```bash
# Development build with hot reload
pnpm dev

# Production build
pnpm build
```

### 4. Load in Browser

#### Chrome/Edge:
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `dist/` folder

#### Firefox:
1. Navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file in the `dist/` folder (e.g., `manifest.json`)

## Usage

### Creating a Wallet

1. Click the Zinc Wallet extension icon
2. Select "Create New Wallet"
3. Securely save your 24-word seed phrase
4. Set a strong password to encrypt your wallet
5. Your wallet is ready!

### Importing a Wallet

1. Click the extension icon
2. Select "Import Wallet"
3. Enter your 24-word seed phrase
4. Set a password
5. Click "Import"

### Sending ZEC

1. Open the wallet dashboard
2. Click "Send"
3. Enter recipient address and amount
4. Confirm the transaction

### Creating Inscriptions

#### Deploy ZRC-20 Token:
```javascript
// From a dApp
await window.zincProvider.deployZrc20({
  ticker: 'ZINC',
  max: '21000000',
  limit: '1000',
  decimals: 8,
  tip: 150000
});
```

#### Mint ZRC-20 Tokens:
```javascript
await window.zincProvider.mintZrc20({
  deployTxId: 'abc123...',
  amount: '100',
  tip: 150000
});
```

#### Transfer ZRC-20:
```javascript
await window.zincProvider.transferZrc20({
  deployTxId: 'abc123...',
  amount: '50',
  recipient: 't1RecipientAddress...',
  tip: 150000
});
```

#### Mint NFT:
```javascript
await window.zincProvider.mintNft({
  collectionTxId: 'def456...',
  content: 'ipfs://QmYourHash',
  protocol: 'ipfs',
  mimeType: 'image/png',
  tip: 150000
});
```

## Project Structure

```
ZincWallet/
├── src/
│   ├── background/          # Service worker for wallet logic
│   │   ├── index.ts
│   │   ├── wallet.ts
│   │   └── transactions.ts
│   ├── content/             # Content script for provider injection
│   │   └── index.ts
│   ├── popup/               # React UI
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── components/
│   │   ├── pages/
│   │   └── styles/
│   ├── shared/              # Shared utilities
│   │   ├── crypto.ts
│   │   ├── storage.ts
│   │   ├── webzjs.ts
│   │   └── inscriptions/
│   │       ├── zrc20.ts
│   │       └── nft.ts
│   └── types/               # TypeScript definitions
├── public/                  # Static assets
├── tests/                   # Unit and integration tests
├── manifest.json
├── vite.config.ts
├── tailwind.config.js
├── package.json
└── README.md
```

## Security Best Practices

### For Users:
- **Never share your seed phrase** with anyone
- Use a strong, unique password for encryption
- Verify all transaction details before confirming
- Only install the extension from official sources
- Keep your browser and extension updated

### For Developers:
- All private keys are encrypted using AES-GCM (Web Crypto API)
- Keys never leave the client (no backend transmission)
- Content Security Policy prevents XSS attacks
- Input validation on all inscription data
- Minimum treasury tip enforced (150,000 zatoshis)
- Secure random number generation for seed creation

## Testing

```bash
# Run unit tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm test:watch
```

## Building for Production

```bash
# Build optimized bundle
pnpm build

# Create distributable packages
pnpm package
```

This creates:
- `zinc-wallet-chrome.zip` for Chrome Web Store
- `zinc-wallet-firefox.zip` for Firefox Add-ons

## Distribution Options

### 1. Developer Mode (Testing)
Load the unpacked `dist/` folder as described in Installation section.

### 2. Chrome Web Store
1. Create a [Chrome Web Store Developer account](https://chrome.google.com/webstore/devconsole/) ($5 fee)
2. Upload `zinc-wallet-chrome.zip`
3. Fill in store listing details
4. Submit for review (typically 1-3 days)

### 3. Firefox Add-ons
1. Create a [Firefox Add-ons account](https://addons.mozilla.org/developers/) (free)
2. Upload `zinc-wallet-firefox.zip`
3. Complete listing information
4. Submit for review (typically 1-7 days)

### 4. Self-Hosted
Provide the ZIP files via GitHub Releases or your website. Users can install manually.

## Troubleshooting

### Extension won't load
- Ensure you built the extension (`pnpm build`)
- Check browser console for errors
- Verify manifest.json is valid

### Can't connect to lightwalletd
- Check your `.env` configuration
- Ensure the lightwalletd URL is accessible
- Try using a different proxy server
- Check network (testnet vs mainnet) configuration

### Transactions failing
- Verify sufficient ZEC balance for tx + fees + tip
- Ensure treasury tip is at least 150,000 zatoshis
- Check inscription data format (ticker length, etc.)
- Try on testnet first

### Balance not updating
- Wait for blockchain sync (can take a few minutes)
- Check lightwalletd connection status
- Verify you're on the correct network

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## Security Audit

Before using with mainnet funds, please note:
- This is a proof-of-concept implementation
- Professional security audit recommended before production use
- Use testnet for development and testing
- Start with small amounts on mainnet

## License

MIT License - see LICENSE file for details

## Resources

- [Zinc Protocol Documentation](https://docs.zincprotocol.io/)
- [WebZjs Library](https://github.com/ChainSafe/webzjs)
- [Zcash Developer Documentation](https://zcash.readthedocs.io/)
- [Chrome Extension Development](https://developer.chrome.com/docs/extensions/)
- [Firefox Extension Development](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

## Acknowledgments

- ChainSafe for WebZjs library
- Zinc Protocol team for inscription standards
- Zcash community for ongoing support
