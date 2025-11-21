# Zync Wallet Blockchain Indexer

## What This Does

Scans the Zcash blockchain for Zinc Protocol inscriptions and populates your Supabase database with:
- ZRC-20 token balances
- NFT ownership
- Inscription history

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
