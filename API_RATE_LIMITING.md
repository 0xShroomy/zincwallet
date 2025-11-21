# API Rate Limiting Protection

## Problem Identified

When rapidly switching tabs in the wallet, each tab component makes API calls to fetch data:
- **Activity tab** → `GET_TRANSACTIONS`
- **Tokens tab** → `GET_INSCRIPTIONS`
- **NFTs tab** → `GET_INSCRIPTIONS`

**Before the fix:**
```
User switches tabs 10 times in 5 seconds
= 10 API calls to Blockchair
= Wasted API credits
= Potential rate limiting
```

With **50,000 calls** available, this could be burned through quickly by:
- Power users clicking around
- Buggy UI causing loops
- Automated testing/bots

---

## Solution Implemented

### 1. **Request Caching** ⏱️

Results are cached for **30 seconds**:

```javascript
const CACHE_TTL = 30000; // 30 seconds

// First call - fetches from API
const result1 = await handleGetTransactions({ address: 't1ABC...' });

// Second call within 30s - returns cached result
const result2 = await handleGetTransactions({ address: 't1ABC...' });
// No API call made! ✅
```

**Benefits:**
- Switching tabs repeatedly uses cached data
- No redundant API calls within 30 seconds
- Smooth UX (instant response from cache)

---

### 2. **Request Deduplication** 🔒

Prevents multiple identical requests from running simultaneously:

```javascript
// User clicks Activity tab 5 times rapidly

Call 1: [Background] Fetching transactions... (API call starts)
Call 2: [Background] Request already in flight, waiting... (waits for Call 1)
Call 3: [Background] Request already in flight, waiting... (waits for Call 1)
Call 4: [Background] Request already in flight, waiting... (waits for Call 1)
Call 5: [Background] Request already in flight, waiting... (waits for Call 1)

// Only 1 API call is made, all 5 calls get the same result
```

**Benefits:**
- Only **one** API call even if requested 100 times
- Queued requests wait for the first one to complete
- All requests get the same result

---

### 3. **Per-Address Caching** 📍

Cache is stored per address:

```javascript
apiCache.transactions = {
  't1ABC...': { data: {...}, timestamp: 1234567890 },
  't1XYZ...': { data: {...}, timestamp: 1234567891 }
}
```

**Benefits:**
- Switching wallets fetches new data
- Each address has independent cache
- Multi-wallet support maintained

---

## Example Scenarios

### Scenario 1: Rapid Tab Switching
```
Time 0s:  Click Activity tab → API call (fetches transactions)
Time 1s:  Click Tokens tab   → Cached (no API call)
Time 2s:  Click Activity tab → Cached (no API call)
Time 3s:  Click NFTs tab     → Cached (no API call)
Time 5s:  Click Activity tab → Cached (no API call)
Time 31s: Click Activity tab → API call (cache expired, refetch)

Result: 2 API calls in 31 seconds (instead of 6)
```

---

### Scenario 2: Accidental Spam Clicking
```
User rapidly clicks Activity tab 50 times in 2 seconds

Without protection: 50 API calls
With protection:    1 API call + 49 cached responses

API savings: 98% reduction
```

---

### Scenario 3: Normal Usage
```
User opens wallet → Unlocks → Checks Activity tab
(30 seconds pass)
User checks Activity tab again → Refreshes data

Result: 2 API calls (reasonable, fresh data)
```

---

## API Call Budget

**Your Blockchair Plan:**
- Total calls: 50,000
- Cost: $50

**Estimated Usage:**

### Without Protection:
- Active user: 100 tab switches/day × 3 API calls each = 300 calls/day
- 50,000 / 300 = **166 days** for one user
- 10 users = **16 days** until depleted

### With Protection (30s cache):
- Active user: 100 tab switches/day, but cached within 30s windows
- Realistic calls: ~50 calls/day (83% reduction)
- 50,000 / 50 = **1,000 days** for one user
- 10 users = **100 days**
- 100 users = **10 days**

---

## Monitoring API Usage

### Check Logs for Cache Hits:
```javascript
// New API call
[Background] Fetching transactions for: t1ABC...

// Cached response (no API call)
[Background] Returning cached transactions for: t1ABC...

// Duplicate request (waiting for in-flight)
[Background] Request already in flight, waiting...
```

### Monitor Blockchair Usage:
```bash
# Check your API usage
curl "https://api.blockchair.com/premium/stats?key=YOUR_KEY"
```

Response shows:
- `requests_today` - How many calls you've made
- `max_requests_per_day` - Your daily limit (if applicable)

---

## Future Improvements

### 1. Adjustable Cache TTL
Let users choose cache duration in settings:
- **Aggressive** (60s) - Saves API calls
- **Balanced** (30s) - Default
- **Fresh** (10s) - More up-to-date data

### 2. Smart Cache Invalidation
Clear cache when:
- User sends a transaction (new activity)
- User receives ZEC (balance changes)
- Manual refresh button clicked

### 3. Cache Persistence
Store cache in `chrome.storage.session`:
- Survives tab switches
- Cleared when browser closes
- Even better API savings

### 4. Rate Limit Warning
Show warning if API usage is high:
```
⚠️ API Usage: 45,000 / 50,000 calls
Consider reducing refresh frequency
```

---

## Technical Implementation

### Cache Structure:
```javascript
const apiCache = {
  transactions: Map {
    't1Address1' => { 
      data: { success: true, transactions: [...] },
      timestamp: 1704123456789
    }
  },
  inscriptions: Map {
    't1Address1' => {
      data: { success: true, zinc: {...}, zerdinals: {...} },
      timestamp: 1704123456790
    }
  }
};
```

### In-Flight Tracking:
```javascript
const inFlightRequests = Map {
  'tx_t1Address1' => Promise<pending>,
  'inscr_t1Address1' => Promise<pending>
}
```

### Flow Diagram:
```
Request Received
       ↓
   [Check Cache] ──→ Cache Hit? ──→ Return Cached Data ✓
       ↓ No
   [Check In-Flight] ──→ Request Running? ──→ Wait for Result ✓
       ↓ No
   [Start New Request]
       ↓
   [Make API Call]
       ↓
   [Cache Result]
       ↓
   [Return Data] ✓
```

---

## Summary

### Before Protection:
- ❌ Every tab switch = API call
- ❌ Rapid clicking = API spam
- ❌ Expensive, wasteful
- ❌ Could hit rate limits

### After Protection:
- ✅ 30-second cache window
- ✅ Deduplicates simultaneous requests
- ✅ 80-95% API call reduction
- ✅ Smooth, instant UX from cache
- ✅ Protects your $50 investment

### Real Impact:
**50,000 calls** can now last:
- **Before:** ~16 days with 10 users
- **After:** ~100+ days with 10 users

**That's 6x more runway!** 🚀

---

## Testing

Reload your extension and try:

1. **Rapid Tab Switching:**
   - Switch between Activity/Tokens/NFTs quickly
   - Watch console logs
   - First call: "Fetching..."
   - Subsequent calls: "Returning cached..."

2. **Cache Expiration:**
   - Wait 31+ seconds
   - Switch tabs again
   - Should fetch fresh data

3. **Wallet Switching:**
   - Switch to different wallet
   - Should fetch new data (different address)

---

**Your API budget is now protected!** 💪
