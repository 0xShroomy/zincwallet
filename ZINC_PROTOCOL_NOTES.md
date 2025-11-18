# Zinc Protocol Implementation Notes

## Official Documentation Insights

### Source: https://docs.zinc.is/docs

### Key Learnings

#### 1. Binary Encoding (Critical!)
**We've updated our implementation to use BINARY encoding instead of text:**

- **Text Format (OLD - incorrect):**
  ```
  "zinc:p=zrc-20 op=deploy tick=ZINC max=21000000 lim=1000 dec=8"
  Size: ~120 bytes
  ```

- **Binary Format (NEW - correct):**
  ```
  Hex: 10 5a494e4300 00000000004c4b40 00000000000003e8 08
  Size: 23 bytes (80% smaller!)
  ```

**Benefits:**
- 60-70% size reduction
- Lower fees
- Faster indexing
- More inscriptions per block

#### 2. Protocol Structure

**Byte 0: Version + Protocol ID**
```
[Version:4bits][Protocol ID:4bits]
```

**Protocol IDs:**
- `0x0` = Zinc Core (NFTs)
- `0x1` = ZRC-20 (Tokens)  
- `0x2` = Marketplace

**Operations (lower 4 bits):**
- `0x0` = Deploy
- `0x1` = Mint/List
- `0x2` = Transfer/Claim

#### 3. ZRC-20 Binary Formats

**Deploy (0x10):**
```
[0x10][Ticker:5][Max:8][Limit:8][Decimals:1]
Total: 23 bytes
```

**Mint (0x11):**
```
[0x11][DeployTxId:32][Amount:8]
Total: 41 bytes
```

**Transfer (0x12):**
```
[0x12][DeployTxId:32][Amount:8]
Total: 41 bytes
Note: Recipient address in transaction output, not inscription
```

#### 4. OP_RETURN vs Ordinals

**Zinc Advantages:**
- Uses OP_RETURN (purpose-built for data)
- Inscriptions tied to txids (not satoshis)
- No ordinal theory complexity
- Cleaner, simpler design
- No edge cases from sat tracking

**Bitcoin Ordinals:**
- Uses Taproot witness data
- Requires tracking individual satoshis
- Complex ordinal theory
- Multiple protocol patches needed

#### 5. Treasury Tips

**Mandatory 150,000 zatoshis** to treasury address per inscription:
- Funds indexer infrastructure
- Built into protocol
- Non-negotiable minimum

---

## Reference Implementation: zatoshi.market

### Repo: https://github.com/cloutprotocol/zatoshi.market

**What They're Building:**
- Next.js marketplace for Zerdinals & ZRC-20
- Phase 1: CLI using existing infrastructure
- Phase 2: Custom indexer
- Phase 3: Full marketplace integration

**Tech Stack:**
- `@mayaprotocol/zcash-js` or `WebZjs` for Zcash primitives
- Transaction signing and UTXO management
- API integration with zerdinals.com

**Key Takeaways:**
- They're also starting with basics (CLI → Indexer → Marketplace)
- Using WebZjs (same as us!)
- Incremental approach is the right strategy

---

## Our Implementation Status

### ✅ Completed
- Wallet architecture (encryption, storage)
- React UI foundation
- Provider API structure
- Background service worker
- **UPDATED: Binary encoding for ZRC-20** (Deploy, Mint, Transfer)

### 🔧 Next Steps
1. **Update NFT encoding** to binary format
2. **Test binary encoding** with real Zcash testnet
3. **Add indexer API integration** (query token balances, inscriptions)
4. **Complete UI components** (Dashboard, Unlock, Inscriptions pages)
5. **WebZjs integration** (replace mock with real implementation)
6. **Build packaging scripts** for Chrome/Firefox

### 📋 Priority Order
1. ✅ Binary encoding (DONE)
2. Test on Zcash testnet
3. Indexer API integration
4. Complete UI
5. Production readiness

---

## Resources

- **Zinc Docs:** https://docs.zinc.is/docs
- **Binary Encoding:** https://docs.zinc.is/docs/core-concepts/binary-encoding
- **ZRC-20 Spec:** https://docs.zinc.is/docs/protocols/zrc20
- **Zinc Core (NFTs):** https://docs.zinc.is/docs/protocols/zinc-core
- **Reference Repo:** https://github.com/cloutprotocol/zatoshi.market
- **Zcash Docs:** https://zcash.readthedocs.io/

---

## Development Notes

### Binary Encoding Implementation

**Little-endian uint64** for all numeric values:
```typescript
buffer.writeBigUInt64LE(value, offset);
```

**Txid reversal** for Zcash:
```typescript
const txidBuffer = Buffer.from(deployTxId, 'hex').reverse();
```

**Ticker encoding** (fixed 5 bytes):
```typescript
const tickerUpper = ticker.toUpperCase().padEnd(4, '\0');
buffer.write(tickerUpper, offset, 4, 'ascii');
buffer.writeUInt8(0x00, offset + 4); // null terminator
```

### Testing Strategy

1. **Unit tests** for encoding functions
2. **Testnet testing** with real transactions
3. **Indexer validation** (verify inscriptions are recognized)
4. **Integration tests** with dApps

---

## Questions for Future

- [ ] How does Zinc indexer API work? (Query endpoints)
- [ ] What's the proper WebZjs integration pattern?
- [ ] How to handle NFT content storage (IPFS/Arweave)?
- [ ] Marketplace protocol implementation?
- [ ] Multi-account support?
- [ ] Hardware wallet integration?

---

**Last Updated:** November 18, 2025
**Status:** Binary encoding complete, ready for testnet testing
