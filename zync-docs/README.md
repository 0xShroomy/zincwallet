# Zync Wallet Documentation (docs.zyncwallet.xyz)

Developer documentation and integration guide for Zync Wallet.

## Deployment to Vercel

1. Push this folder to a Git repository (or use the entire repo)
2. Go to [Vercel Dashboard](https://vercel.com)
3. Click "New Project"
4. Import your repository
5. Set **Root Directory** to: `docs`
6. Set **Framework Preset** to: Other
7. Set **Output Directory** to: `public`
8. Click "Deploy"

## Custom Domain

After deployment:
1. Go to Project Settings → Domains
2. Add domain: `docs.zyncwallet.xyz`
3. Follow Vercel's DNS instructions

## Files

- `public/index.html` - Main documentation page
- `public/zyncwallet.d.ts` - TypeScript definitions (downloadable)
- `vercel.json` - Vercel configuration

## Local Testing

```bash
cd docs/public
python3 -m http.server 8001
# Visit: http://localhost:8001
```

## Updating TypeScript Definitions

When you update the wallet API, remember to update:
1. `/zyncwallet.d.ts` (root)
2. Copy to `/docs/public/zyncwallet.d.ts`
