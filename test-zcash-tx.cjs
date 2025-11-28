/**
 * Standalone Zcash v4 Transaction Test
 * Tests transaction building and serialization without browser
 */

const crypto = require('crypto');

// Helper functions
function encodeUint32LE(value) {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32LE(value >>> 0, 0); // Convert to unsigned
  return Array.from(buffer);
}

function encodeUint64LE(value) {
  const buffer = Buffer.allocUnsafe(8);
  buffer.writeBigUInt64LE(BigInt(value), 0);
  return Array.from(buffer);
}

function encodeVarInt(value) {
  if (value < 0xfd) {
    return [value];
  } else if (value <= 0xffff) {
    return [0xfd, value & 0xff, (value >> 8) & 0xff];
  } else if (value <= 0xffffffff) {
    return [0xfe, value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];
  } else {
    throw new Error('VarInt too large');
  }
}

function hexToBytes(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return new Uint8Array(bytes);
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// SHA256 double hash
function hash256(data) {
  const hash1 = crypto.createHash('sha256').update(Buffer.from(data)).digest();
  const hash2 = crypto.createHash('sha256').update(hash1).digest();
  return new Uint8Array(hash2);
}

// Test data - using your actual UTXO from logs
const testUtxo = {
  txid: '51f6f2d1dc22f809fe6bce0ef852ac17ab2004c2d650e8be793b73f4dd0d46a0',
  vout: 1,
  value: 1643975,
  address: 't1Y6WdGGi4gCtU6jbzchREqSxyrZEJqNjsN'
};

// Build P2PKH scriptPubKey
function buildScriptPubKey(address) {
  // Decode base58 (simplified - just for this test address)
  // For t1Y6WdGGi4gCtU6jbzchREqSxyrZEJqNjsN
  const pubkeyHash = hexToBytes('9c02ad5188cafa9171b23228360b3fe4532ef211');
  
  const script = new Uint8Array(25);
  script[0] = 0x76;  // OP_DUP
  script[1] = 0xa9;  // OP_HASH160
  script[2] = 0x14;  // Push 20 bytes
  script.set(pubkeyHash, 3);
  script[23] = 0x88; // OP_EQUALVERIFY
  script[24] = 0xac; // OP_CHECKSIG
  
  return script;
}

// Build test transaction
console.log('🔨 Building v4 transaction...\n');

const tx = {
  version: 4 | (1 << 31), // v4 with Overwinter bit
  consensusBranchId: 0x76b809bb, // Sapling
  inputs: [{
    txid: testUtxo.txid,
    vout: testUtxo.vout,
    script: new Uint8Array(0), // Empty before signing
    sequence: 0xffffffff,
    value: testUtxo.value
  }],
  outputs: [
    {
      value: 10000n, // 0.0001 ZEC to recipient
      script: buildScriptPubKey('t1XVyLCC1vCnsWomwmVL3bCPCdYY1JGfXm5')
    },
    {
      value: 1623975n, // Change
      script: buildScriptPubKey('t1Y6WdGGi4gCtU6jbzchREqSxyrZEJqNjsN')
    }
  ],
  lockTime: 0,
  expiryHeight: 3300000
};

console.log('Transaction structure:');
console.log('  Version:', '0x' + tx.version.toString(16));
console.log('  Branch ID:', '0x' + tx.consensusBranchId.toString(16));
console.log('  Inputs:', tx.inputs.length);
console.log('  Outputs:', tx.outputs.length);
console.log('  Expiry:', tx.expiryHeight);
console.log('');

// Serialize transaction
console.log('📝 Serializing transaction...\n');

const buffer = [];

// Version (v4 with Overwinter bit)
buffer.push(...encodeUint32LE(tx.version));

// Group ID (v4 Sapling = 0x892F2085)
buffer.push(...encodeUint32LE(0x892F2085));

// Input count
buffer.push(...encodeVarInt(tx.inputs.length));

// Inputs
for (const input of tx.inputs) {
  const txidBytes = hexToBytes(input.txid);
  buffer.push(...Array.from(txidBytes).reverse());
  buffer.push(...encodeUint32LE(input.vout));
  buffer.push(...encodeVarInt(input.script.length));
  if (input.script.length > 0) {
    buffer.push(...input.script);
  }
  buffer.push(...encodeUint32LE(input.sequence));
}

// Output count
buffer.push(...encodeVarInt(tx.outputs.length));

// Outputs
for (const output of tx.outputs) {
  buffer.push(...encodeUint64LE(output.value));
  buffer.push(...encodeVarInt(output.script.length));
  buffer.push(...output.script);
}

// v4: Locktime and expiry AFTER outputs
buffer.push(...encodeUint32LE(tx.lockTime));
buffer.push(...encodeUint32LE(tx.expiryHeight));

// v4: Value balance (8 bytes, 0 for transparent-only)
buffer.push(...encodeUint64LE(0n));

// v4: Shielded counts (0 for transparent-only)
buffer.push(...encodeVarInt(0)); // nShieldedSpend
buffer.push(...encodeVarInt(0)); // nShieldedOutput

// v4: JoinSplit count (0 for transparent-only)
buffer.push(...encodeVarInt(0)); // nJoinSplit

const txHex = bytesToHex(new Uint8Array(buffer));

console.log('✅ Transaction serialized!');
console.log('');
console.log('Hex length:', txHex.length, 'chars =', txHex.length / 2, 'bytes');
console.log('');
console.log('First 100 chars:', txHex.substring(0, 100));
console.log('Last 50 chars:', txHex.substring(txHex.length - 50));
console.log('');
console.log('Key fields:');
console.log('  Version:', txHex.substring(0, 8));
console.log('  Group ID:', txHex.substring(8, 16));
console.log('');

// Compare with expected
console.log('🔍 Checking format...\n');

const versionGroupId = txHex.substring(8, 16);
const expectedGroupId = '8520f289'; // 0x892F2085 in little-endian

if (versionGroupId === expectedGroupId) {
  console.log('✅ Version Group ID: CORRECT (0x892F2085)');
} else {
  console.log('❌ Version Group ID: WRONG');
  console.log('   Expected:', expectedGroupId);
  console.log('   Got:', versionGroupId);
}

// Full transaction hex
console.log('');
console.log('Full transaction hex:');
console.log(txHex);
console.log('');
console.log('✅ Test complete! Copy this hex to test broadcast.');
