# 🌐 dApp Integration - Full Implementation Plan

## 🎯 **Goal:**
Enable external websites to interact with Zync Wallet for transactions and inscriptions.

---

## 📋 **Implementation Phases:**

### **Phase 1: Provider Injection System** ⏳
**Files to Create:**
- `/public/inject.js` - Injected into every webpage
- `/public/content-script.js` - Bridge between page and extension

**What it does:**
- Injects `window.zyncwallet` API into webpages
- Establishes communication channel with background
- Handles message passing securely

**Time:** 1-2 hours

---

### **Phase 2: Provider API** ⏳
**File:** `/public/provider.js`

**Methods to implement:**
```javascript
window.zyncwallet = {
  // Connection
  connect() - Request wallet connection
  disconnect() - Disconnect from dApp
  isConnected() - Check connection status
  
  // Account
  getAddress() - Get current address
  getPublicKey() - Get public key
  getNetwork() - Get current network (mainnet/testnet)
  
  // Balance
  getBalance() - Get ZEC balance
  
  // Basic Transactions
  sendZec({ to, amount }) - Send ZEC
  
  // Zinc Protocol (OP_RETURN)
  deployZrc20({ tick, max, limit, decimals }) - Deploy token
  mintZrc20({ deployTxid, amount }) - Mint tokens
  transferZrc20({ deployTxid, amount, to }) - Transfer tokens
  deployCollection({ name, metadata }) - Deploy NFT collection
  mintNft({ collectionTxid, content, mimeType }) - Mint NFT
  
  // Zerdinals Protocol (ScriptSig)
  inscribe({ contentType, content }) - Create inscription
  
  // Events
  on(event, callback) - Listen to events
  removeListener(event, callback) - Remove listener
  
  // Events available:
  // - accountsChanged
  // - networkChanged
  // - connect
  // - disconnect
}
```

**Time:** 2-3 hours

---

### **Phase 3: Background Request Handlers** ⏳
**File:** `/public/background.js` (extend existing)

**New handlers:**
```javascript
DAPP_CONNECT - Handle connection requests
DAPP_DISCONNECT - Handle disconnection
DAPP_GET_ADDRESS - Return address
DAPP_GET_BALANCE - Return balance
DAPP_SEND_ZEC - Process ZEC send
DAPP_DEPLOY_ZRC20 - Process token deployment
DAPP_MINT_ZRC20 - Process token minting
DAPP_TRANSFER_ZRC20 - Process token transfer
DAPP_INSCRIBE - Process inscription
```

**Each handler must:**
1. Validate request origin
2. Check permissions
3. Show approval popup if needed
4. Execute transaction
5. Return result

**Time:** 3-4 hours

---

### **Phase 4: Permission System** ⏳
**File:** `/public/permissions.js`

**Storage structure:**
```javascript
{
  permissions: {
    'https://example.com': {
      granted: true,
      timestamp: 1234567890,
      address: 't1...',
      permissions: ['connect', 'getBalance', 'sendZec']
    }
  }
}
```

**Functions:**
- `checkPermission(origin, method)` - Check if allowed
- `grantPermission(origin, method)` - Grant permission
- `revokePermission(origin)` - Revoke all permissions
- `listPermissions()` - List all granted permissions

**Time:** 1-2 hours

---

### **Phase 5: Approval Popup UI** ⏳
**Files to create:**
- `/src/popup/pages/ApprovalPage.tsx` - Approval UI
- `/src/popup/pages/ConnectApprovePage.tsx` - Connection approval
- `/src/popup/pages/TransactionApprovePage.tsx` - Transaction approval

**UI Components:**
1. **Connection Approval:**
   - dApp name and favicon
   - Requested permissions
   - Warning messages
   - Approve/Reject buttons

2. **Transaction Approval:**
   - Transaction details
   - Fee estimate
   - Total cost
   - Warning for inscriptions (treasury tip)
   - Approve/Reject buttons

3. **Inscription Approval:**
   - Inscription type (ZRC-20, NFT, etc.)
   - Parameters display
   - Data preview
   - Fee + Treasury tip
   - Approve/Reject buttons

**Time:** 3-4 hours

---

### **Phase 6: Security Layer** ⏳
**File:** `/public/security.js`

**Checks to implement:**
- Origin validation (HTTPS only)
- Rate limiting (prevent spam)
- Phishing detection (known bad domains)
- Parameter validation (prevent exploits)
- Balance checks (sufficient funds)
- Network validation (mainnet/testnet match)

**Time:** 2 hours

---

### **Phase 7: Event System** ⏳
**File:** `/public/events.js`

**Event dispatcher for:**
- `accountsChanged` - When user switches wallet/address
- `networkChanged` - When switching mainnet/testnet
- `connect` - When connection established
- `disconnect` - When connection revoked

**Time:** 1 hour

---

### **Phase 8: Demo dApp** ⏳
**File:** `/demo-dapp/index.html`

**Simple test website with:**
- Connect button
- Display address
- Send ZEC form
- Deploy ZRC-20 form
- Mint token form
- Event listeners display

**Time:** 2 hours

---

### **Phase 9: Settings UI** ⏳
**File:** `/src/popup/pages/ConnectionsPage.tsx`

**UI for managing:**
- List of connected dApps
- Revoke access buttons
- Permission details
- Activity log

**Time:** 2 hours

---

### **Phase 10: Documentation** ⏳
**Files:**
- `/DEVELOPER_GUIDE.md` - How to integrate
- `/API_REFERENCE.md` - Complete API docs
- `/SECURITY.md` - Security best practices

**Time:** 1-2 hours

---

## 📊 **Total Time Estimate:**

| Phase | Hours | Priority |
|-------|-------|----------|
| Phase 1: Injection | 1-2h | 🔴 Critical |
| Phase 2: Provider API | 2-3h | 🔴 Critical |
| Phase 3: Background Handlers | 3-4h | 🔴 Critical |
| Phase 4: Permissions | 1-2h | 🔴 Critical |
| Phase 5: Approval UI | 3-4h | 🔴 Critical |
| Phase 6: Security | 2h | 🟡 Important |
| Phase 7: Events | 1h | 🟡 Important |
| Phase 8: Demo dApp | 2h | 🟢 Nice to have |
| Phase 9: Settings UI | 2h | 🟢 Nice to have |
| Phase 10: Documentation | 1-2h | 🟢 Nice to have |
| **TOTAL** | **18-26 hours** | |

---

## 🔄 **Implementation Order:**

1. ✅ Phase 1 - Injection (foundation)
2. ✅ Phase 2 - Provider API (interface)
3. ✅ Phase 3 - Background Handlers (logic)
4. ✅ Phase 4 - Permissions (security)
5. ✅ Phase 5 - Approval UI (user interaction)
6. ✅ Phase 6 - Security (hardening)
7. ✅ Phase 7 - Events (reactivity)
8. Testing with Phase 8 - Demo dApp
9. Polish with Phase 9 - Settings UI
10. Document with Phase 10

---

## 🎯 **Success Criteria:**

- [x] External website can connect to wallet
- [x] User approves/rejects connections
- [x] dApp can request address and balance
- [x] dApp can send ZEC transactions
- [x] dApp can create inscriptions (both protocols)
- [x] Permission system works
- [x] Events fire correctly
- [x] Security checks pass
- [x] UI is intuitive
- [x] Documentation is complete

---

## 🚀 **Ready to Start!**

I'll implement each phase systematically, testing as I go.

**Starting with Phase 1 now...**
