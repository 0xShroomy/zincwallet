# Zinc Wallet Indexer - Complete Setup Guide

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                 Zync Wallet Extension                    │
│              (Runs in user's browser)                    │
└─────────────────────────────────────────────────────────┘
                        ↓ API calls
┌─────────────────────────────────────────────────────────┐
│            Vercel Serverless Functions                   │
│  /api/balance      - Blockchair proxy                    │
│  /api/utxos        - Blockchair proxy                    │
│  /api/broadcast    - Blockchair proxy                    │
│  /api/inscriptions - Supabase query ← NEW!               │
└─────────────────────────────────────────────────────────┘
                        ↓ queries
┌─────────────────────────────────────────────────────────┐
│              Supabase PostgreSQL Database                │
│  - inscriptions table                                    │
│  - zrc20_balances table                                  │
│  - nft_ownership table                                   │
│  - indexer_state table                                   │
└─────────────────────────────────────────────────────────┘
                        ↑ writes data
┌─────────────────────────────────────────────────────────┐
│         Indexer Script (Node.js)                         │
│  Runs 24/7 on your computer or VPS                       │
│  Scans blockchain every 5 minutes                        │
│  Parses inscriptions                                     │
│  Updates database                                        │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 File Structure

```
zincwallet/
├── src/              ← Extension code
├── public/           ← Extension background
├── vercel-proxy/     ← API endpoints (DEPLOYED TO VERCEL)
│   ├── api/
│   │   ├── balance.js
│   │   ├── utxos.js
│   │   ├── broadcast.js
│   │   └── inscriptions.js ← NEW!
│   └── .env.example  ← NOT USED (Vercel uses dashboard env vars)
│
└── indexer/          ← Indexer script (RUNS LOCALLY/VPS)
    ├── index.js      ← Main indexer code
    ├── package.json
    ├── .env          ← YOUR CONFIG (NOT .env.local!)
    └── README.md
```

---

## 🔐 Environment Variables

### **Indexer** (uses `.env` file)
Location: `indexer/.env`

```bash
BLOCKCHAIR_API_KEY=your_key_here          # Get tomorrow!
SUPABASE_URL=https://zbpkedsqgcwtyvnazeer.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...          # Service role key (already set)
SCAN_INTERVAL_SECONDS=300                  # 5 minutes
START_BLOCK=3139000                        # Current block
```

### **Vercel Proxy** (uses Vercel dashboard)
Set via: `vercel env add` or Vercel dashboard

```bash
BLOCKCHAIR_API_KEY=your_key_here          # Get tomorrow!
SUPABASE_URL=https://zbpkedsqgcwtyvnazeer.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...            # Anon key (already set)
```

**Note:** Vercel doesn't use `.env` files - they're just for local dev!

---

## 🚀 How to Run

### **Option 1: Run Locally (While Developing)**

```bash
cd indexer
pnpm install
# Edit .env file with your Blockchair API key
pnpm start
```

Keep the terminal open - it runs forever!

### **Option 2: Deploy to VPS (Production)**

**Recommended: DigitalOcean Droplet ($6/month)**

```bash
# On your VPS:
git clone <your-repo>
cd zincwallet/indexer
npm install
npm install -g pm2

# Create .env file with your keys
nano .env

# Start with pm2 (keeps it running forever)
pm2 start index.js --name zinc-indexer
pm2 save
pm2 startup
```

**PM2 commands:**
- `pm2 status` - Check if running
- `pm2 logs zinc-indexer` - View logs
- `pm2 restart zinc-indexer` - Restart

---

## ❓ FAQ

### Q: Why can't the indexer run on Vercel?
A: Vercel serverless functions timeout after 10 seconds (or 300s on Pro). The indexer needs to run 24/7.

### Q: Do I need a VPS?
A: No! For development/testing, just run it on your computer. Deploy to VPS when you want it running all the time.

### Q: What if I close my laptop?
A: If running locally, the indexer stops. Use a VPS or always-on computer for production.

### Q: How much does this cost?
- Supabase: $10/month (already set up)
- Blockchair API: $50/month (get tomorrow)
- VPS (optional): $5-6/month
- **Total: $60-66/month** (or $60 if running locally)

### Q: Can I test without Blockchair API?
A: Not really - the indexer needs it to scan the blockchain. Get the free trial or wait until you purchase.

### Q: How do I know it's working?
You'll see logs like:
```
🚀 Zinc Wallet Indexer starting...
📊 Current block: 3,139,500
🔍 Scanning block 3,139,001...
   📝 Found inscription: zrc-20 mint
   💎 ZRC-20 Mint: 1000 CASH to t1VsYonu...
✅ Scanned blocks 3,139,001 to 3,139,010
```

### Q: What happens if it crashes?
- If using PM2: Auto-restarts
- If running manually: You need to restart it
- Data is saved in Supabase, so no loss

---

## ✅ Tomorrow's Checklist

1. ✅ Database created
2. ✅ API endpoint deployed
3. ✅ Indexer code ready
4. ⏳ Get Blockchair API key ($50/month)
5. ⏳ Add API key to `indexer/.env`
6. ⏳ Add API key to Vercel env vars
7. ⏳ Run `cd indexer && pnpm start`
8. ⏳ Test in wallet - see your inscriptions!

---

## 🎯 Testing the System

Once indexer is running:

1. **Open wallet extension**
2. **Click "Tokens" tab** - Should show ZRC-20 tokens (if any indexed)
3. **Click "NFTs" tab** - Should show NFTs (if any indexed)
4. **Create an inscription** - Watch indexer find it in ~5 minutes!

---

## 🐛 Troubleshooting

**Indexer won't start:**
- Check `.env` file exists in `indexer/` folder
- Verify Supabase credentials are correct
- Make sure dependencies installed: `pnpm install`

**No inscriptions showing:**
- Check indexer logs for errors
- Verify indexer is actually running
- Check Supabase database has data: Go to Supabase dashboard → Table Editor

**API errors in wallet:**
- Check Vercel deployment is live
- Verify Vercel env vars are set
- Check browser console for error messages

---

Ready to index the Zcash blockchain! 🚀
