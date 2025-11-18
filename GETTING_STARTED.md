# Getting Started with Zinc Wallet Development

## 🎯 Understanding ZRC-20 & Inscriptions (Simple Explanation)

### What Are Inscriptions?

Think of inscriptions like **writing permanent messages on the blockchain**. But instead of just messages, we write:
- **Tokens** (ZRC-20) - like creating a new currency
- **NFTs** (Zinc Core) - unique digital items
- **Marketplace orders** - buying/selling these items

### How It Works (Step by Step)

#### 1. **Deploy a Token** (like creating a new coin)
```
You: "I want to create a token called $ZINC"
Wallet: Creates a special transaction with:
  - Token name: "ZINC"
  - Max supply: 21,000,000
  - Mint limit: 1,000 per mint
  - Decimals: 8
  
This gets "inscribed" (permanently written) on Zcash blockchain
```

#### 2. **Mint Tokens** (like printing money)
```
You: "Give me 1,000 $ZINC tokens"
Wallet: Creates a transaction saying:
  - "Mint 1,000 tokens from deployment TX abc123..."
  
The indexer sees this and updates your balance
```

#### 3. **Transfer Tokens** (like sending money)
```
You: "Send 50 $ZINC to Bob"
Wallet: Creates a transaction saying:
  - "Transfer 50 tokens to Bob's address"
  
Bob now owns 50 tokens, you have 50 less
```

### Why Zcash?

- **Privacy-first** blockchain
- **Low fees** (cheaper than Bitcoin)
- **OP_RETURN** support (perfect for inscriptions)
- **Fast** transaction times

---

## 🔧 Environment Variables Explained

### `.env.local` File You Just Created

```bash
# Which network? testnet = safe playground, mainnet = real money
VITE_NETWORK=testnet
```
**Testnet** = Like a sandbox where coins are free (for testing)
**Mainnet** = Real Zcash with real value (use later!)

```bash
# How do we connect to Zcash blockchain?
VITE_LIGHTWALLETD_URL=https://testnet.lightwalletd.com:9067
```
**lightwalletd** = A server that talks to Zcash nodes
- We don't run a full node (that's 50GB+)
- We connect to this server to read/write transactions
- Like using Infura for Ethereum

```bash
# Where do inscription fees go?
VITE_ZINC_TREASURY_ADDRESS=tmYC2HkeWGXvPJHNJXj3u1r92RjjY5T6QUG
VITE_ZINC_MIN_TIP=150000
```
**Treasury tip** = Mandatory 150,000 zatoshis (~$0.001) per inscription
- Funds the indexer infrastructure
- Every inscription MUST include this tip
- Like gas fees, but for the indexer

```bash
# How do we query token balances?
VITE_ZINC_INDEXER_URL=https://api.zerdinals.com/v1
```
**Indexer** = A server that reads all inscriptions and tracks:
- Who owns which tokens
- Token balances
- NFT ownership
- Transaction history

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────┐
│  Your Browser Extension (Zinc Wallet)      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │   UI     │  │  Wallet  │  │ Provider │ │
│  │ (React)  │←→│ (Crypto) │←→│   API    │ │
│  └──────────┘  └──────────┘  └──────────┘ │
└────────┬────────────────────────────────────┘
         │
         ├──────────────────────────────────┐
         ↓                                  ↓
┌─────────────────────┐         ┌──────────────────────┐
│  Lightwalletd       │         │  Zinc Indexer API    │
│  (Blockchain Access)│         │  (Token Balances)    │
│                     │         │                      │
│  • Read UTXOs       │         │  • Query balances    │
│  • Send transactions│         │  • List inscriptions │
│  • Get balance      │         │  • Verify ownership  │
└─────────────────────┘         └──────────────────────┘
         ↓                                  ↓
┌─────────────────────────────────────────────────────┐
│           Zcash Blockchain (Testnet)                │
│                                                     │
│  Every inscription is a transaction with:          │
│  • OP_RETURN output (inscription data)            │
│  • Treasury tip output (150k zatoshis)            │
│  • Change output (leftover ZEC back to you)       │
└─────────────────────────────────────────────────────┘
```

---

## 🚀 What Happens When You Create an Inscription?

### Example: Deploying a Token

**Step 1:** You fill out the form
```
Ticker: ZINC
Max Supply: 21000000
Mint Limit: 1000
Decimals: 8
```

**Step 2:** Wallet encodes it to binary
```
Before: {"p":"zrc-20","op":"deploy","tick":"ZINC",...} (120 bytes)
After:  10 5a494e4300 00000000004c4b40... (23 bytes) ✨
```

**Step 3:** Wallet builds a transaction
```
Input:  Your UTXOs (unspent coins)
Output 0: OP_RETURN with encoded inscription
Output 1: 150,000 zatoshis to treasury
Output 2: Change back to your address
```

**Step 4:** You sign and broadcast
```
Transaction goes to Zcash blockchain →
  Mined into a block →
    Indexer sees it →
      Updates database: "ZINC token created by you!"
```

**Step 5:** Token is live!
```
Now anyone can mint ZINC tokens (up to the limit)
Your deployment txid is the "token ID" forever
```

---

## 📝 Development Workflow

### Today (Where We Are)
```
✅ Wallet foundation built
✅ Binary encoding implemented
✅ UI components ready
✅ Environment configured
```

### Next Week (Testing Phase)
```
1. Get testnet ZEC (free from faucet)
2. Deploy a test token
3. Mint some tokens
4. Transfer to another address
5. Verify on indexer API
```

### Following Week (Integration)
```
1. Connect to real indexer API
2. Display token balances
3. Show transaction history
4. Add NFT support
5. Polish UI/UX
```

### Production Ready
```
1. Full test suite passing
2. Security audit
3. Chrome Web Store submission
4. Firefox Add-ons submission
5. Launch! 🚀
```

---

## 🎓 Key Concepts to Remember

### 1. **UTXOs (Unspent Transaction Outputs)**
Think of them like **cash bills in your wallet**:
- You have three $10 bills (3 UTXOs of 0.1 ZEC each)
- You want to buy something for $15
- You use two $10 bills, get $5 change
- Now you have one $10 bill and one $5 bill

### 2. **Transaction IDs (txid)**
Every transaction gets a unique ID:
- 64 character hex string
- Like a receipt number
- Used to reference inscriptions
- Example: `abc123def456...` (64 chars)

### 3. **Zatoshis**
Smallest unit of Zcash:
- 1 ZEC = 100,000,000 zatoshis
- Like cents to dollars
- 150,000 zatoshis = 0.0015 ZEC ≈ $0.05

### 4. **OP_RETURN**
Special transaction output for data:
- Can't be spent (provably unspendable)
- Perfect for inscriptions
- Max 80 bytes (but we only need 23-41!)
- Standard Bitcoin Script feature

---

## 🔍 Useful Resources

### Zcash Testnet Faucet
Get free testnet ZEC for testing:
- https://faucet.zec.rocks/
- https://faucet.testnet.z.cash/

### Block Explorers
See transactions on the blockchain:
- Testnet: https://explorer.testnet.z.cash/
- Mainnet: https://explorer.zcha.in/

### Zinc Indexer API
Query tokens and balances:
- API: https://api.zerdinals.com/v1
- Docs: https://docs.zerdinals.com

### Zcash Developer Docs
Learn about Zcash itself:
- https://zcash.readthedocs.io/

---

## 🤔 Common Questions

### Q: Do I need to run a Zcash node?
**A:** No! We connect to lightwalletd which talks to nodes for us.

### Q: What if lightwalletd is down?
**A:** We can configure backup servers or run our own.

### Q: Are testnet tokens worth anything?
**A:** No, they're free and have no value. Perfect for testing!

### Q: Can I use mainnet now?
**A:** Not yet! Test thoroughly on testnet first.

### Q: How much does an inscription cost?
**A:** Treasury tip (150k zatoshis) + transaction fee (~1k zatoshis) ≈ $0.05

### Q: Can inscriptions be deleted?
**A:** No! They're permanent on the blockchain forever.

---

## 🎯 Your Next Steps

1. **Read this guide** (you're doing it! ✅)
2. **Get testnet ZEC** from a faucet
3. **Build the extension**: `pnpm build`
4. **Load it in Chrome** (developer mode)
5. **Create a wallet** and save your seed phrase
6. **Try deploying a test token!**

---

**Remember:** We're building this together! Ask questions anytime. 🤝
