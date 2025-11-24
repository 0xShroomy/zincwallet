# Zync Wallet Website (zyncwallet.xyz)

Main landing page for Zync Wallet.

## Deployment to Vercel

1. Push this folder to a Git repository (or use the entire repo)
2. Go to [Vercel Dashboard](https://vercel.com)
3. Click "New Project"
4. Import your repository
5. Set **Root Directory** to: `website`
6. Set **Framework Preset** to: Other
7. Set **Output Directory** to: `public`
8. Click "Deploy"

## Custom Domain

After deployment:
1. Go to Project Settings → Domains
2. Add domain: `zyncwallet.xyz`
3. Follow Vercel's DNS instructions

## Files

- `public/index.html` - Main landing page
- `public/zync-wallet.zip` - Extension download (auto-generated)
- `vercel.json` - Vercel configuration

## Local Testing

```bash
cd website/public
python3 -m http.server 8000
# Visit: http://localhost:8000
```
