# Zinc Wallet - Vercel Proxy

This is a simple proxy server for Zinc Wallet that allows the Chrome extension to fetch Zcash blockchain data without CORS issues.

## Why is this needed?

Chrome extensions using Manifest V3 cannot directly access public Zcash explorers due to CORS restrictions. This proxy runs on Vercel's edge network and forwards requests to various Zcash explorers.

## API Endpoints

### GET `/api/balance?address=<address>&network=<mainnet|testnet>`
Returns the balance for a Zcash transparent address.

**Networks Supported:**
- `mainnet` - Uses Blockchair API
- `testnet` - Uses Tatum RPC

**Response:**
```json
{
  "success": true,
  "balance": 100000000,
  "transactions": 5,
  "source": "https://..."
}
```

### GET `/api/utxos?address=<address>`
Returns unspent transaction outputs (UTXOs) for an address.

**Response:**
```json
{
  "success": true,
  "utxos": [
    {
      "txid": "abc123...",
      "vout": 0,
      "address": "t1...",
      "scriptPubKey": "76a914...",
      "amount": 1.5,
      "satoshis": 150000000,
      "height": 2500000,
      "confirmations": 10
    }
  ],
  "source": "https://..."
}
```

### POST `/api/broadcast`
Broadcasts a signed transaction to the Zcash network.

**Request:**
```json
{
  "txHex": "0400008085202f89..."
}
```

**Response:**
```json
{
  "success": true,
  "txid": "abc123...",
  "source": "https://..."
}
```

## Environment Variables

Add these to your Vercel project settings:

```bash
# Required for mainnet balance (Blockchair)
BLOCKCHAIR_API_KEY=your_blockchair_key

# Required for testnet (Tatum RPC)
TATUM_TESTNET_API_KEY=your_tatum_testnet_key

# Optional: for mainnet via Tatum
TATUM_MAINNET_API_KEY=your_tatum_mainnet_key

# Required for inscriptions/ZRC-20
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

**See `DEPLOY_WITH_TATUM.md` for detailed setup instructions.**

---

## Deployment

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Add Environment Variables
Go to Vercel Dashboard → Your Project → Settings → Environment Variables

### 3. Deploy to Vercel
```bash
cd vercel-proxy
vercel --prod
```

### 4. Note your deployment URL
Vercel will give you a URL like: `https://zinc-wallet-proxy.vercel.app`

### 5. Update your wallet
The wallet already uses: `https://vercel-proxy-loghorizon.vercel.app`

## Local Development

```bash
cd vercel-proxy
npm install
vercel dev
```

This will start a local server at `http://localhost:3000`

## Security Notes

- This proxy is stateless and doesn't store any data
- It only forwards requests to public Zcash explorers
- CORS is enabled for all origins (safe for a public API)
- No sensitive data passes through the proxy
- All blockchain data is public anyway

## Cost

Vercel's free tier includes:
- 100 GB bandwidth/month
- Unlimited requests
- Global edge network

This is more than enough for a personal wallet. If you release this publicly, you may need to upgrade to a paid plan.
