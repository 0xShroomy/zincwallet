# Zync Wallet - Deployment Guide

Complete guide for deploying Zync Wallet websites to production.

## 📁 Project Structure

```
zincwallet/
├── website/          → zyncwallet.xyz (Main landing page)
├── docs/            → docs.zyncwallet.xyz (Developer docs)
├── dist/            → Extension build
└── zync-wallet.zip  → Extension download package
```

---

## 🌐 Website Deployment (zyncwallet.xyz)

### What It Contains:
- Landing page with wallet features
- Download button for extension
- Link to developer docs
- Beautiful modern UI

### Deploy to Vercel:

1. **Push to Git** (if not already)
   ```bash
   git add .
   git commit -m "Add website and docs"
   git push
   ```

2. **Create New Project on Vercel**
   - Go to https://vercel.com/new
   - Import your repository
   - **IMPORTANT:** Set these settings:
     - **Root Directory:** `website`
     - **Framework Preset:** Other
     - **Output Directory:** `public`
   - Click "Deploy"

3. **Add Custom Domain**
   - Go to Project Settings → Domains
   - Add: `zyncwallet.xyz`
   - Update DNS with Vercel's nameservers:
     ```
     ns1.vercel-dns.com
     ns2.vercel-dns.com
     ```

4. **Test**
   - Visit: https://zyncwallet.xyz
   - Test download button works
   - Test all links

---

## 📚 Docs Deployment (docs.zyncwallet.xyz)

### What It Contains:
- Complete integration guide
- Code examples for all methods
- Downloadable TypeScript definitions
- Event listener documentation

### Deploy to Vercel:

1. **Create Another Project on Vercel**
   - Go to https://vercel.com/new
   - Import the SAME repository
   - **IMPORTANT:** Set these settings:
     - **Root Directory:** `docs`
     - **Framework Preset:** Other
     - **Output Directory:** `public`
   - Click "Deploy"

2. **Add Custom Domain**
   - Go to Project Settings → Domains
   - Add: `docs.zyncwallet.xyz`
   - Vercel automatically configures subdomain

3. **Test**
   - Visit: https://docs.zyncwallet.xyz
   - Test TypeScript definitions download
   - Test all code examples

---

## 🔧 Local Testing (Before Deployment)

### Test Main Website:
```bash
cd website/public
python3 -m http.server 8000
# Visit: http://localhost:8000
```

### Test Docs:
```bash
cd docs/public
python3 -m http.server 8001
# Visit: http://localhost:8001
```

---

## 📦 Extension Distribution

### Current Method (Manual):

1. Users visit https://zyncwallet.xyz
2. Click "Download Wallet"
3. Downloads `zync-wallet.zip`
4. Extract and load in Chrome:
   - Chrome → Extensions
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select extracted `dist` folder

### Future (Chrome Web Store):

When ready for Chrome Web Store:
1. Create Chrome Developer account
2. Package extension: `zip -r extension.zip dist/`
3. Upload to Chrome Web Store
4. Update website to link to store

---

## 🔄 Update Process

### When You Update the Extension:

1. **Build Extension:**
   ```bash
   pnpm run build
   ```

2. **Create New Zip:**
   ```bash
   zip -r zync-wallet.zip dist/
   ```

3. **Update Website:**
   ```bash
   cp zync-wallet.zip website/public/
   git add website/public/zync-wallet.zip
   git commit -m "Update extension to v1.x.x"
   git push
   ```

4. **Vercel Auto-Deploys** (takes ~30 seconds)

### When You Update TypeScript Definitions:

1. **Update Both Copies:**
   ```bash
   # Edit: /zyncwallet.d.ts
   cp zyncwallet.d.ts docs/public/
   git add zyncwallet.d.ts docs/public/zyncwallet.d.ts
   git commit -m "Update TypeScript definitions"
   git push
   ```

---

## ✅ Post-Deployment Checklist

### Main Website (zyncwallet.xyz):
- [ ] Homepage loads correctly
- [ ] Download button works
- [ ] zync-wallet.zip downloads
- [ ] Links to docs work
- [ ] Twitter link works
- [ ] Responsive on mobile

### Docs (docs.zyncwallet.xyz):
- [ ] Documentation loads
- [ ] TypeScript definitions download works
- [ ] All code examples are correct
- [ ] Sidebar navigation works
- [ ] Links back to main site work

### Extension:
- [ ] Extracts successfully
- [ ] Loads in Chrome without errors
- [ ] All features work (connect, send, sign, etc.)

---

## 🚨 Important Notes

1. **TypeScript Definitions Are Optional**
   - JavaScript developers don't need them
   - Only for TypeScript projects
   - Provides autocomplete/IntelliSense

2. **Update Both Sites Together**
   - When updating extension, update website
   - When updating API, update docs + TypeScript defs

3. **Vercel Automatic Deployments**
   - Every git push triggers deployment
   - Takes ~30 seconds
   - Old versions are backed up

4. **DNS Propagation**
   - Custom domains take 24-48 hours
   - Use Vercel preview URL immediately
   - Example: `zyncwallet.vercel.app`

---

## 🆘 Troubleshooting

### Download Button Returns 404:
```bash
# Make sure zip exists:
ls -la website/public/zync-wallet.zip

# If missing, recreate:
zip -r zync-wallet.zip dist/
cp zync-wallet.zip website/public/
```

### TypeScript Definitions Download Fails:
```bash
# Make sure file exists:
ls -la docs/public/zyncwallet.d.ts

# If missing:
cp zyncwallet.d.ts docs/public/
```

### Vercel Deployment Fails:
- Check Root Directory is set correctly
- Check Output Directory is `public`
- Check vercel.json exists

---

## 📞 Support

- **Twitter:** @0xShinno
- **GitHub:** github.com/zyncwallet

---

**🎉 You're all set! Deploy and go live!**
