# Zync Wallet Indexer

Scans Zcash blockchain for Zinc and Zerdinals inscriptions.

## Features
- Zinc Protocol (ZRC-20 tokens)
- Zerdinals Protocol (NFT inscriptions)
- Automatic balance tracking
- Supabase storage
- Continuous 24/7 monitoring

## Setup

```bash
npm install
cp .env.example .env
# Configure environment variables
npm start
```

## Configuration

### START_BLOCK
The indexer will scan from this block onwards. Current default: `3100000`

**Block Timeline:**
- Block 3100000 ≈ 7-8 weeks ago
- Block 3139000 ≈ 9 days ago
- Current block ≈ 3149532

**To index ALL inscriptions from the beginning:**
Set `START_BLOCK=3050000` in your `.env` file (goes back ~3 months)

**To start from today:**
Set `START_BLOCK=3149500` in your `.env` file

### Historical Scan Performance
- ~50,000 blocks = 4-6 hours initial scan
- ~100,000 blocks = 8-12 hours initial scan
- After catching up, scans every 5 minutes
Runs continuously, scanning new blocks every 5 minutes.

---

## Quick Start

```bash
# Install dependencies (already done)
pnpm install

# Start indexer
pnpm start
```

Keep the terminal open - it will run continuously!

---

## Configuration

Your `.env` file is already configured:
- ✅ Blockchair API key
- ✅ Supabase credentials
- ✅ Scan interval: 5 minutes
- ✅ Network: mainnet

---

## What You'll See

```
🚀 Zync Wallet Indexer Starting...
📡 Network: mainnet
🔑 Blockchair API: A___EsSiz...
🗄️  Supabase: https://zbpkedsqgcwtyvnazeer.supabase.co
⏱️  Scan interval: 300s

⏳ Starting initial scan...

🔍 Scanning blocks 3139001 to 3142592
📦 Block 3139050: 125 transactions
  📝 Found inscription in abc123...
  💎 ZRC-20 Deploy: ZINC
✅ Scan complete. Processed 3591 blocks

✅ Initial scan complete. Now monitoring every 300s...
```

---

## Database Tables

The indexer populates these Supabase tables:

### `inscriptions`
All Zinc Protocol inscriptions found on-chain

### `zrc20_balances`
Current ZRC-20 token balances per address

### `nft_ownership`
NFT ownership records

### `indexer_state`
Tracks last scanned block height

---

## Production Deployment

### Using pm2 (Recommended)

```bash
# Install pm2
npm install -g pm2

# Start indexer
pm2 start index.js --name zync-indexer

# View logs
pm2 logs zync-indexer

# Auto-restart on server reboot
pm2 startup
pm2 save
```

### Using screen

```bash
# Start session
screen -S indexer

# Run indexer
pnpm start

# Detach: Ctrl+A then D
# Reattach: screen -r indexer
```

---

## Monitoring

Check Supabase dashboard to see inscriptions being added:
https://supabase.com/dashboard/project/zbpkedsqgcwtyvnazeer/editor

---

## Troubleshooting

### "Missing Supabase credentials"
Check your `.env` file has all required variables

### "Blockchair API error: 429"
You've hit rate limits. The indexer will automatically retry.

### "No inscriptions found"
Normal if there are no Zinc inscriptions on mainnet yet!

---

## Cost

- **Blockchair API:** ~$50/month
- **Supabase:** Free tier (or $25/month Pro)
- **VPS (optional):** $5-10/month

---

## Next Steps

1. ✅ Indexer installed
2. ✅ Dependencies ready
3. ⏳ Run `pnpm start` to begin scanning
4. ⏳ Check wallet Tokens/NFTs tabs - they'll populate as inscriptions are found!
