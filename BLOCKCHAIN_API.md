# Blockchain API Integration

## What We Use: Public Zcash Insight API Servers

Instead of running our own node or backend, we use **public Zcash Insight API servers**. These are free, open endpoints that anyone can use.

### Public Testnet Explorers:
- `https://explorer.testnet.z.cash/api` - Official Zcash testnet explorer
- `https://testnet.zcash.community/api` - Community testnet explorer
- `https://api.blockchair.com/zcash/testnet` - Blockchair testnet

### Public Mainnet Explorers:
- `https://insight.zcash.com/api` - Official Zcash mainnet explorer
- `https://zcashnetwork.info/api` - Community mainnet explorer
- `https://api.blockchair.com/zcash` - Blockchair mainnet

## API Endpoints We Use

### 1. Get Address Balance
```
GET /addr/{address}
```
Returns: `{ balance: 0.5, txApperances: 5 }`

### 2. Get UTXOs (Unspent Transaction Outputs)
```
GET /addr/{address}/utxo
```
Returns: Array of UTXOs needed to build transactions

### 3. Broadcast Transaction
```
POST /tx/send
Body: { "rawtx": "hex_encoded_transaction" }
```
Returns: `{ "txid": "transaction_hash" }`

### 4. Get Blockchain Status
```
GET /status
```
Returns: Current block height and best block hash

## How It Works

1. **Wallet tries multiple explorers** - If one fails, automatically tries the next
2. **No backend needed** - Direct browser → explorer API calls
3. **CORS-friendly** - Most Zcash explorers support browser requests
4. **Testnet by default** - Safe for development and testing

## For Inscriptions (ZRC-20, NFTs)

The wallet can:
1. ✅ Build inscription transactions locally (no API needed)
2. ✅ Get UTXOs to spend (from Insight API)
3. ✅ Sign transactions with private key (locally)
4. ✅ Broadcast inscriptions (via Insight API POST)
5. ✅ Track balance (from Insight API)

## No Backend Proxy Needed!

Unlike some wallets, Zinc Wallet uses **public infrastructure** that's already available. The Zcash community maintains these explorers for exactly this purpose.

### Advantages:
- ✅ No server costs
- ✅ No maintenance
- ✅ Decentralized (multiple endpoints)
- ✅ Open source explorers
- ✅ Community supported

### Limitations:
- ⚠️ Depends on public infrastructure
- ⚠️ Rate limits may apply
- ⚠️ Some CORS restrictions possible

### Future Improvements:
- User can add custom RPC endpoint (like MetaMask)
- Cache responses locally
- Add more public explorers to the list
