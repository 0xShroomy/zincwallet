# Zinc Wallet Browser Extension - Project Plan

## Overview
A fully functional browser extension wallet for the Zinc Protocol (Zcash inscriptions, ZRC-20 tokens, and NFTs) supporting Chrome and Firefox.

## Technology Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Blockchain**: WebZjs (ChainSafe) for Zcash interaction
- **Build Tool**: Vite with browser extension plugins
- **Testing**: Vitest, React Testing Library
- **Security**: Web Crypto API for encryption

---

## 4-6 Week Development Roadmap

### Week 1: Foundation & Architecture
**Deliverables:**
- Project setup with TypeScript, React, Vite
- Extension manifest (v3) for Chrome/Firefox
- Basic folder structure
- WebZjs integration research and testing
- Encryption utilities using Web Crypto API

**Risks:**
- WebZjs library compatibility with browser extensions
- Understanding lightwalletd proxy configuration

### Week 2: Core Wallet Features
**Deliverables:**
- Seed phrase generation (24-word mnemonic)
- Seed import functionality
- Local encrypted storage implementation
- T-address derivation from seed
- UTXO syncing with lightwalletd
- Balance calculation and display

**Risks:**
- WebZjs may have limited documentation
- Testnet/mainnet configuration complexity

### Week 3: Inscription Encoding
**Deliverables:**
- ZRC-20 deploy encoding
- ZRC-20 mint encoding
- ZRC-20 transfer encoding
- Zinc Core NFT collection deploy
- Zinc Core NFT mint (with content protocols)
- Unit tests for all encoding functions
- Treasury tip validation (150,000 zatoshis minimum)

**Risks:**
- OP_RETURN data format must match indexer expectations exactly
- Binary encoding edge cases

### Week 4: Transaction Building & Signing
**Deliverables:**
- Transaction builder with OP_RETURN output
- Treasury tip output integration
- Change output calculation
- Transaction signing with WebZjs
- Broadcasting transactions
- Transaction history tracking

**Risks:**
- Fee estimation accuracy
- UTXO selection optimization

### Week 5: UI/UX & Provider API
**Deliverables:**
- Onboarding flow (create/import wallet)
- Dashboard (balance, tokens, NFTs)
- Inscription operation forms
- Confirmation screens with validation
- Provider API (`window.zincProvider`)
- dApp connection/approval system
- Settings page

**Risks:**
- User experience complexity
- Provider API security concerns

### Week 6: Testing & Documentation
**Deliverables:**
- Comprehensive unit tests (80%+ coverage)
- Integration tests on testnet
- Security audit of encryption/key handling
- Complete README with setup instructions
- Build/packaging scripts for distribution
- Chrome Web Store assets preparation

**Risks:**
- Testnet availability
- Extension review process delays

---

## Success Criteria
1. Successfully create and import wallets
2. Display accurate ZEC balance from testnet
3. Create and broadcast inscription transactions
4. dApps can interact via provider API
5. All sensitive data encrypted locally
6. Extension passes Chrome/Firefox validation

---

## Security Checklist
- [ ] Mnemonic encrypted with user password (AES-GCM)
- [ ] Private keys never leave client
- [ ] Content Security Policy configured
- [ ] Treasury tip validation (minimum 150k zatoshis)
- [ ] Input sanitization for all inscription data
- [ ] dApp permission system
- [ ] Secure random number generation for seed
- [ ] No eval() or unsafe inline scripts

---

## Distribution Strategy
1. **Developer Mode**: Load unpacked for testing
2. **GitHub Releases**: Publish source code and build artifacts
3. **Chrome Web Store**: Submit for review (requires $5 fee)
4. **Firefox Add-ons**: Submit for review (free)
5. **Self-hosted**: Provide signed CRX/XPI files

---

## Future Enhancements (Post-MVP)
- Shielded address support (when Zinc adds it)
- Hardware wallet integration (Ledger, Trezor)
- Multi-account support
- Transaction history with indexer integration
- Price/portfolio tracking
- Custom RPC endpoints
- Dark mode
- Internationalization (i18n)
