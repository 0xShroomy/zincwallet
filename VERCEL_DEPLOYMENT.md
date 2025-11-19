# Deploy Vercel Proxy for Zinc Wallet

## Quick Start (5 minutes)

### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

### Step 2: Navigate to proxy folder

```bash
cd vercel-proxy
```

### Step 3: Deploy to Vercel

```bash
vercel --prod
```

Follow the prompts:
- **Set up and deploy?** → Yes
- **Which scope?** → Your personal account or team
- **Link to existing project?** → No
- **Project name?** → `zinc-wallet-proxy` (or any name you prefer)
- **Directory?** → `./` (current directory)
- **Override settings?** → No

Vercel will deploy and give you a URL like:
```
https://zinc-wallet-proxy.vercel.app
```

### Step 4: Update your wallet

Open `/public/lightwalletd-client.js` and update line 15:

```javascript
// Change this:
const PROXY_URL = 'https://YOUR-VERCEL-APP.vercel.app/api';

// To your actual URL:
const PROXY_URL = 'https://zinc-wallet-proxy.vercel.app/api';
```

### Step 5: Rebuild the extension

```bash
cd ..
pnpm run build
```

### Step 6: Test it

1. Reload your Chrome extension
2. Open the wallet
3. Check the console - you should see successful balance queries
4. Your balance should now display correctly!

---

## Testing Your Proxy

### Test balance endpoint:
```bash
curl "https://zinc-wallet-proxy.vercel.app/api/balance?address=t1YOUR_ADDRESS_HERE"
```

Expected response:
```json
{
  "success": true,
  "balance": 100000000,
  "transactions": 5,
  "source": "https://insight.zcash.com/api/addr/..."
}
```

### Test UTXOs endpoint:
```bash
curl "https://zinc-wallet-proxy.vercel.app/api/utxos?address=t1YOUR_ADDRESS_HERE"
```

### Test broadcast endpoint:
```bash
curl -X POST "https://zinc-wallet-proxy.vercel.app/api/broadcast" \
  -H "Content-Type: application/json" \
  -d '{"txHex":"SIGNED_TX_HEX_HERE"}'
```

---

## Vercel Dashboard

After deployment, you can:
- View logs at https://vercel.com/your-username/zinc-wallet-proxy
- See analytics (requests, bandwidth, etc.)
- Set up custom domains
- Configure environment variables (if needed later)

---

## Costs

**Vercel Free Tier includes:**
- 100 GB bandwidth/month
- Unlimited requests
- Global edge network (fast worldwide)
- SSL certificates

For a personal wallet, this is **completely free**.

If you release Zinc Wallet publicly and get lots of users, you might need the Pro plan ($20/month) for more bandwidth.

---

## Troubleshooting

### "All explorers are unavailable" error

This means all Zcash explorers are down or blocking requests. This is rare but can happen. The proxy tries multiple explorers automatically.

### Proxy not working

1. Check Vercel logs: `vercel logs`
2. Verify the URL is correct in `lightwalletd-client.js`
3. Test the endpoint directly with curl (see above)
4. Make sure you rebuilt the extension after changing the URL

### Rate limiting

If you get rate limited by explorers:
- Wait a few minutes
- Or add more explorer URLs to the proxy
- Or run your own Zcash node (see IMPLEMENTATION_SUMMARY.md)

---

## Security Notes

- The proxy is **stateless** - it doesn't store any data
- It only forwards public blockchain data
- Your private keys **never** go through the proxy
- Only signed transactions are broadcast (proxy can't steal funds)
- All blockchain data is public anyway

---

## Local Development

To test the proxy locally before deploying:

```bash
cd vercel-proxy
vercel dev
```

This starts a local server at `http://localhost:3000`

Update `PROXY_URL` to `http://localhost:3000/api` for testing.

---

## Alternative: Custom Domain

If you want a custom domain instead of `*.vercel.app`:

1. Buy a domain (Namecheap, Cloudflare, etc.)
2. Go to Vercel dashboard → Settings → Domains
3. Add your domain
4. Update DNS records as instructed
5. Update `PROXY_URL` to use your custom domain

Example:
```javascript
const PROXY_URL = 'https://api.zincwallet.com';
```

---

## Next Steps

After your proxy is working:

1. **Test thoroughly** - Try balance queries, sending transactions
2. **Monitor usage** - Check Vercel dashboard for any issues
3. **Consider caching** - If you get high traffic, add caching to reduce API calls
4. **Add testnet support** - Modify proxy to support testnet addresses

---

## Need Help?

- Vercel docs: https://vercel.com/docs
- Check console logs in your wallet
- Check Vercel function logs: `vercel logs`
