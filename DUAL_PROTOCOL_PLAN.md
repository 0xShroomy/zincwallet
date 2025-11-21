# Dual Protocol Support: Zinc + Zerdinals

## Overview
Zync Wallet will support both inscription protocols on Zcash:
1. **Zinc Protocol** (OP_RETURN based) - Binary encoded, efficient
2. **Zerdinals** (scriptSig based) - Ordinals-style, larger capacity

---

## Architecture

### Protocol Detection
```
┌─────────────────────────────────────────────┐
│         Transaction Scanner                 │
│                                             │
│  1. Check OP_RETURN outputs → Zinc          │
│  2. Check scriptSig inputs → Zerdinals      │
│  3. Parse both formats simultaneously       │
└─────────────────────────────────────────────┘
```

### Data Structure
```typescript
interface InscriptionData {
  txid: string;
  protocol: 'zinc' | 'zerdinals';
  type: 'zrc20-deploy' | 'zrc20-mint' | 'zrc20-transfer' | 'nft' | 'ordinal';
  data: any;
  timestamp: number;
  blockHeight: number;
}
```

---

## Implementation Steps

### Phase 1: Parser Layer (Week 1)

#### 1.1 Create Dual Parser
**File:** `src/shared/inscriptions/dual-parser.ts`

```typescript
import { parseZincInscription } from './zinc-parser';
import { parseZerdinalsInscription } from './zerdinals-parser';

export async function parseTransaction(tx: any) {
  const inscriptions = [];
  
  // Check OP_RETURN outputs (Zinc)
  for (const output of tx.outputs) {
    if (output.script.startsWith('6a')) { // OP_RETURN = 0x6a
      const zinc = parseZincInscription(output.script);
      if (zinc) inscriptions.push({ protocol: 'zinc', ...zinc });
    }
  }
  
  // Check scriptSig inputs (Zerdinals)
  for (const input of tx.inputs) {
    const zerdinal = parseZerdinalsInscription(input.scriptSig);
    if (zerdinal) inscriptions.push({ protocol: 'zerdinals', ...zerdinal });
  }
  
  return inscriptions;
}
```

#### 1.2 Create Zerdinals Parser
**File:** `src/shared/inscriptions/zerdinals-parser.ts`

```typescript
/**
 * Parse Zerdinals inscription from scriptSig
 * Format: <signature> <pubkey> <inscription_data>
 */
export function parseZerdinalsInscription(scriptSig: string) {
  try {
    // Zerdinals uses "envelope" format similar to Ordinals
    // Looking for: OP_FALSE OP_IF <ord> <inscription_data> OP_ENDIF
    
    const script = Buffer.from(scriptSig, 'hex');
    
    // Check for envelope pattern
    if (!hasEnvelopePattern(script)) return null;
    
    const data = extractInscriptionData(script);
    
    return {
      contentType: data.contentType,
      content: data.content,
      metadata: data.metadata
    };
  } catch (error) {
    return null;
  }
}

function hasEnvelopePattern(script: Buffer): boolean {
  // OP_FALSE (0x00) OP_IF (0x63) ... OP_ENDIF (0x68)
  return script[0] === 0x00 && script[1] === 0x63;
}

function extractInscriptionData(script: Buffer) {
  // Parse envelope structure
  // This is a simplified version - real implementation needs full script parser
  
  let pos = 2; // Skip OP_FALSE OP_IF
  
  // Look for "ord" marker (0x6f7264)
  // Then content-type
  // Then content
  
  return {
    contentType: 'text/plain',
    content: '',
    metadata: {}
  };
}
```

#### 1.3 Update Zinc Parser (Already Exists)
Keep existing `src/shared/inscriptions/zinc-parser.ts` for OP_RETURN parsing

---

### Phase 2: Indexer Integration (Week 2)

#### 2.1 Dual Indexer Query
**File:** `vercel-proxy/api/inscriptions.js`

```javascript
export default async function handler(req, res) {
  const { address } = req.query;
  
  // Query both indexers in parallel
  const [zincData, zerdinalsData] = await Promise.all([
    fetchZincInscriptions(address),
    fetchZerdinalsInscriptions(address)
  ]);
  
  return res.json({
    success: true,
    zinc: zincData,
    zerdinals: zerdinalsData,
    combined: mergeInscriptions(zincData, zerdinalsData)
  });
}

async function fetchZincInscriptions(address) {
  // Query your Supabase indexer
  const response = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/inscriptions?address=eq.${address}`,
    {
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
      }
    }
  );
  return response.json();
}

async function fetchZerdinalsInscriptions(address) {
  // Query Zerdinals API
  try {
    const response = await fetch(
      `https://api.zerdinals.com/address/${address}/inscriptions`
    );
    return response.json();
  } catch (error) {
    console.warn('Zerdinals API unavailable:', error);
    return { inscriptions: [] };
  }
}
```

---

### Phase 3: Transaction Creation (Week 3)

#### 3.1 Protocol Selector UI
**File:** `src/components/ProtocolSelector.tsx`

```tsx
interface Props {
  value: 'zinc' | 'zerdinals';
  onChange: (protocol: 'zinc' | 'zerdinals') => void;
}

export default function ProtocolSelector({ value, onChange }: Props) {
  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-700">
      <label className="text-sm font-medium text-white mb-2 block">
        Inscription Protocol
      </label>
      
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onChange('zinc')}
          className={`p-3 rounded-lg border-2 transition-all ${
            value === 'zinc'
              ? 'border-amber-500 bg-amber-500/10'
              : 'border-zinc-700 hover:border-zinc-600'
          }`}
        >
          <div className="text-left">
            <div className="font-semibold text-white">Zinc Protocol</div>
            <div className="text-xs text-zinc-400 mt-1">
              OP_RETURN • Efficient • 23-41 bytes
            </div>
          </div>
        </button>
        
        <button
          onClick={() => onChange('zerdinals')}
          className={`p-3 rounded-lg border-2 transition-all ${
            value === 'zerdinals'
              ? 'border-amber-500 bg-amber-500/10'
              : 'border-zinc-700 hover:border-zinc-600'
          }`}
        >
          <div className="text-left">
            <div className="font-semibold text-white">Zerdinals</div>
            <div className="text-xs text-zinc-400 mt-1">
              ScriptSig • Compatible • Up to 1500 bytes
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
```

#### 3.2 Dual Transaction Builder
**File:** `src/shared/inscription-builder.ts`

```typescript
export async function buildInscription(
  protocol: 'zinc' | 'zerdinals',
  type: string,
  data: any,
  utxos: UTXO[]
) {
  if (protocol === 'zinc') {
    return buildZincInscription(type, data, utxos);
  } else {
    return buildZerdinalsInscription(type, data, utxos);
  }
}

function buildZerdinalsInscription(type: string, data: any, utxos: UTXO[]) {
  // Create envelope in scriptSig
  const envelope = createZerdinalsEnvelope(data);
  
  // Build transaction with custom scriptSig
  return {
    inputs: utxos.map(utxo => ({
      ...utxo,
      scriptSig: envelope // Inject inscription into scriptSig
    })),
    outputs: [
      // Normal outputs, no OP_RETURN needed
    ]
  };
}

function createZerdinalsEnvelope(data: any): Buffer {
  // OP_FALSE OP_IF "ord" <content-type> <content> OP_ENDIF
  const chunks = [
    Buffer.from([0x00]), // OP_FALSE
    Buffer.from([0x63]), // OP_IF
    Buffer.from('6f7264', 'hex'), // "ord"
    Buffer.from(data.contentType),
    Buffer.from(data.content),
    Buffer.from([0x68]) // OP_ENDIF
  ];
  
  return Buffer.concat(chunks);
}
```

---

### Phase 4: UI Integration (Week 4)

#### 4.1 Update Dashboard
Show combined view of both protocols:

```tsx
<Tabs>
  <Tab label="Tokens">
    <div className="space-y-2">
      <div className="text-xs text-zinc-500 mb-2">Zinc Protocol</div>
      {zincTokens.map(token => <TokenCard {...token} />)}
      
      <div className="text-xs text-zinc-500 mb-2 mt-4">Zerdinals</div>
      {zerdinalsTokens.map(token => <TokenCard {...token} />)}
    </div>
  </Tab>
</Tabs>
```

#### 4.2 Update Create Page
Add protocol selector to inscription creation flow

---

## API Endpoints Needed

### Zerdinals API (External)
- `GET /address/{address}/inscriptions` - List inscriptions
- `GET /inscription/{id}` - Get inscription details
- `GET /collection/{id}` - Get collection info

### Your Indexer API (Vercel + Supabase)
- `GET /api/inscriptions?address={address}` - Combined data
- `GET /api/inscription/{txid}` - Details for both protocols

---

## Migration Strategy

1. **Start with Read-Only Zerdinals Support**
   - Display Zerdinals inscriptions in wallet
   - Don't create yet, just show what user owns

2. **Add Zinc Creation (Already Working)**
   - Keep existing Zinc Protocol creation

3. **Add Zerdinals Creation**
   - Implement scriptSig envelope builder
   - Add protocol selector to UI

4. **Full Dual Support**
   - Users can choose protocol when creating
   - View both protocols in same wallet

---

## Cost Comparison

| Feature | Zinc | Zerdinals |
|---------|------|-----------|
| **Data Size** | 23-41 bytes | Up to 1500 bytes |
| **Transaction Fee** | ~1000 zat | ~2000-5000 zat |
| **Treasury Tip** | 150k zat | No tip required |
| **Total Cost** | ~$0.05 | ~$0.01-0.02 |

**Recommendation:** Let users choose based on their needs:
- **Zinc:** For tokens (efficient, structured)
- **Zerdinals:** For NFTs/art (larger files, cheaper)

---

## Resources

- Zerdinals API: https://api.zerdinals.com
- Zerdinals Docs: https://docs.zerdinals.com
- Ordinals Specification: https://docs.ordinals.com/inscriptions.html
