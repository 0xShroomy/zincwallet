# Import Wallet Fix - 12/24 Words + Private Key Support

## 🐛 **Bug Fixed**

**Problem:** Import wallet only accepted 24-word phrases

**Error Message:**
```
Invalid mnemonic - must be 24 words
```

**Root Cause:** Hardcoded validation in `public/background.js` line 402

---

## ✅ **What Was Fixed**

### **1. Updated UI** (`src/components/ImportWalletModal.tsx`)
- ✅ Added **3-step import flow**:
  1. Choose method (Phrase or Private Key)
  2. Enter data (12/24 words or private key)
  3. Set password
- ✅ Validates 12 OR 24-word phrases
- ✅ Beautiful method selection screen
- ✅ Separate inputs for phrase vs. private key

### **2. Updated Backend** (`public/background.js`)
**Before:**
```javascript
if (!mnemonic || mnemonic.trim().split(/\s+/).length !== 24) {
  throw new Error('Invalid mnemonic - must be 24 words');
}
```

**After:**
```javascript
if (method === 'phrase' && mnemonic) {
  const words = mnemonic.trim().split(/\s+/);
  if (words.length !== 12 && words.length !== 24) {
    throw new Error('Invalid mnemonic - must be 12 or 24 words');
  }
  seedPhrase = mnemonic.trim();
} else if (method === 'privateKey' && privateKey) {
  throw new Error('Private key import is not yet supported. Please use your recovery phrase instead.');
}
```

---

## 🎯 **Now Supports**

| Import Method | Status | Notes |
|--------------|--------|-------|
| **12-word phrase** | ✅ Working | Compatible with Zerdinals |
| **24-word phrase** | ✅ Working | Compatible with Zinc |
| **Private key** | ⏳ Coming soon | UI ready, needs WebZjs |

---

## 🚀 **How to Test**

### **Test 12-Word Import:**
1. Reload extension: `chrome://extensions` → Reload
2. Click "Import Wallet"
3. Choose "Seed Phrase"
4. Enter a 12-word phrase (like from your zerdinals.com wallet)
5. Set password
6. ✅ Should work!

### **Test 24-Word Import:**
1. Same as above but with 24 words
2. ✅ Should work!

### **Test Private Key:**
1. Choose "Private Key"
2. Enter a private key
3. ❌ Shows: "Private key import is not yet supported"
4. ✅ Clear error message

---

## 📋 **Import Flow Screenshots**

**Step 1: Choose Method**
```
┌──────────────────────────────────┐
│  Import Wallet                   │
├──────────────────────────────────┤
│  Choose how you want to import   │
│                                  │
│  ┌──────────────────────────┐   │
│  │ 💬 Seed Phrase           │   │
│  │ 12 or 24-word recovery   │   │
│  │ phrase                   │   │
│  └──────────────────────────┘   │
│                                  │
│  ┌──────────────────────────┐   │
│  │ 🔑 Private Key           │   │
│  │ Import using private key │   │
│  └──────────────────────────┘   │
│                                  │
│         [Cancel]                 │
└──────────────────────────────────┘
```

**Step 2: Enter Phrase (12 or 24 words)**
```
┌──────────────────────────────────┐
│  Enter Seed Phrase               │
├──────────────────────────────────┤
│  Wallet Name (Optional)          │
│  [My Imported Wallet________]    │
│                                  │
│  Seed Phrase (12 or 24 words)    │
│  ┌──────────────────────────┐   │
│  │ word1 word2 word3 ...    │   │
│  │                          │   │
│  └──────────────────────────┘   │
│  Enter your 12 or 24-word seed   │
│  phrase separated by spaces      │
│                                  │
│  [Back]        [Continue]        │
└──────────────────────────────────┘
```

**Step 3: Set Password**
```
┌──────────────────────────────────┐
│  Set Password                    │
├──────────────────────────────────┤
│  Create a password to encrypt    │
│  this wallet on your device      │
│                                  │
│  Password                        │
│  [••••••••]                      │
│                                  │
│  Confirm Password                │
│  [••••••••]                      │
│                                  │
│  [Back]     [Import Wallet]      │
└──────────────────────────────────┘
```

---

## 🔧 **Files Modified**

1. ✅ `public/background.js` - Updated import validation (12 or 24 words)
2. ✅ `src/components/ImportWalletModal.tsx` - Complete UI rewrite
3. ✅ `src/background/wallet.ts` - TypeScript backend update
4. ✅ `src/background/index.ts` - Pass full data object
5. ✅ `indexer/.eslintrc.json` - Fixed ESLint errors

---

## 🎉 **Summary**

**Before:**
- ❌ Only 24-word phrases
- ❌ No private key option
- ❌ Confusing for Zerdinals users (12 words)

**After:**
- ✅ 12-word phrases (Zerdinals compatible)
- ✅ 24-word phrases (Zinc compatible)
- ✅ Private key option (UI ready, coming soon)
- ✅ Clear 3-step flow
- ✅ Beautiful selection screen

---

## ⚠️ **Note on Private Key Import**

Private key import requires WebZjs library integration to convert the private key to a seed phrase. The UI is ready and will show a helpful error message:

```
"Private key import is not yet supported. Please use your recovery phrase instead."
```

This can be implemented later when WebZjs is fully integrated.

---

## ✅ **Compatibility**

| Platform | Phrase Length | Status |
|----------|--------------|--------|
| **Zerdinals.com** | 12 words | ✅ Now works! |
| **Zinc Protocol** | 24 words | ✅ Still works! |
| **MetaMask-style** | Private key | ⏳ Coming soon |

---

**🎊 Your wallet now works with BOTH Zerdinals AND Zinc wallets!**

Reload the extension and try importing a 12-word phrase from zerdinals.com!
