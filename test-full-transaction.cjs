/**
 * Complete Zcash v4 Transaction Test with REAL SIGNING
 * Tests the entire flow: build → sign → serialize → broadcast
 */

require('dotenv').config({ path: '.env.local' });
const crypto = require('crypto');
const secp256k1 = require('secp256k1');
const bs58 = require('bs58').default || require('bs58');
const { blake2b } = require('blakejs');

// Get private key from .env
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error('❌ Error: PRIVATE_KEY not found in .env.local file');
  console.log('Add to .env.local: PRIVATE_KEY=your_private_key');
  process.exit(1);
}

// Decode WIF private key if needed
let privateKeyBytes;
if (PRIVATE_KEY.startsWith('L') || PRIVATE_KEY.startsWith('K') || PRIVATE_KEY.startsWith('5')) {
  console.log('🔓 Decoding WIF private key...');
  const fullDecode = bs58.decode(PRIVATE_KEY);
  // WIF format: [version byte][32 bytes private key][compression flag][4 byte checksum]
  // Verify checksum
  const payload = fullDecode.slice(0, -4);
  const checksum = fullDecode.slice(-4);
  const hash1 = crypto.createHash('sha256').update(payload).digest();
  const hash2 = crypto.createHash('sha256').update(hash1).digest();
  
  if (!hash2.slice(0, 4).equals(Buffer.from(checksum))) {
    throw new Error('Invalid WIF checksum');
  }
  
  // Extract private key (skip version byte, take 32 bytes before compression flag)
  privateKeyBytes = payload.slice(1, 33);
} else {
  privateKeyBytes = Buffer.from(PRIVATE_KEY, 'hex');
}

if (privateKeyBytes.length !== 32) {
  console.error('❌ Error: Private key must be 32 bytes');
  console.log('Got:', privateKeyBytes.length, 'bytes');
  process.exit(1);
}

console.log('🔑 Private key loaded:', privateKeyBytes.length, 'bytes');
console.log('');

// Main async function
(async () => {

// Helper functions
function encodeUint32LE(value) {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32LE(value >>> 0, 0);
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

// BLAKE2b-256 with personalization (ZIP-243)
function blake2b256(data, personalization) {
  console.log(`[blake2b256] Personalization: "${personalization}"`);
  
  // Ensure data is a Buffer - handle both arrays and Uint8Arrays
  let inputBuffer;
  if (data instanceof Uint8Array || Array.isArray(data)) {
    inputBuffer = Buffer.from(data);
  } else if (Buffer.isBuffer(data)) {
    inputBuffer = data;
  } else {
    throw new Error(`Unexpected data type: ${typeof data}`);
  }
  
  console.log(`[blake2b256] Input Buffer length: ${inputBuffer.length}`);
  
  // blakejs expects: blake2b(input, key, outlen, config)
  // Personal must be exactly 16 bytes
  const personalBytes = Buffer.from(personalization.padEnd(16, '\0'), 'utf8');
  const config = { personal: new Uint8Array(personalBytes) };
  
  try {
    // Convert to pure Uint8Array to avoid potential Buffer issues with blakejs in Node
    const inputUint8 = new Uint8Array(inputBuffer);
    return new Uint8Array(blake2b(inputUint8, null, 32, config));
  } catch (e) {
    console.error('[blake2b256] Internal Error:', e.message);
    console.error('InputBuffer isBuffer:', Buffer.isBuffer(inputBuffer));
    console.error('InputBuffer constructor:', inputBuffer.constructor.name);
    throw e;
  }
}

// Build P2PKH scriptPubKey from pubkey hash
function buildScriptPubKey(pubkeyHashHex) {
  const pubkeyHash = hexToBytes(pubkeyHashHex);
  const script = new Uint8Array(25);
  script[0] = 0x76;  // OP_DUP
  script[1] = 0xa9;  // OP_HASH160
  script[2] = 0x14;  // Push 20 bytes
  script.set(pubkeyHash, 3);
  script[23] = 0x88; // OP_EQUALVERIFY
  script[24] = 0xac; // OP_CHECKSIG
  return script;
}

// Derive address from private key to get UTXOs
console.log('📍 Deriving address from private key...');
const publicKey = secp256k1.publicKeyCreate(privateKeyBytes, true);
const publicKeyHash = crypto.createHash('sha256').update(publicKey).digest();
const hash160 = crypto.createHash('ripemd160').update(publicKeyHash).digest();

// Build Zcash t1 address
const versionBytes = Buffer.from([0x1C, 0xB8]); // Zcash mainnet P2PKH
const addressPayload = Buffer.concat([versionBytes, hash160]);
const checksum = crypto.createHash('sha256').update(
  crypto.createHash('sha256').update(addressPayload).digest()
).digest().slice(0, 4);
const addressBytes = Buffer.concat([addressPayload, checksum]);
const fromAddress = bs58.encode(addressBytes);

console.log('Address:', fromAddress);
console.log('');

// Fetch UTXOs
console.log('🔍 Fetching UTXOs...');
const https = require('https');

async function fetchUTXOs(address) {
  return new Promise((resolve, reject) => {
    const url = `https://vercel-proxy-loghorizon.vercel.app/api/utxos?address=${address}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.utxos || []);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

const utxos = await fetchUTXOs(fromAddress);

if (!utxos || utxos.length === 0) {
  console.error('❌ No UTXOs found for address:', fromAddress);
  console.log('Make sure this address has funds!');
  process.exit(1);
}

console.log('✅ Found', utxos.length, 'UTXO(s)');

// Use first UTXO
const testUtxo = {
  txid: utxos[0].txid,
  vout: utxos[0].vout,
  value: utxos[0].value || utxos[0].satoshis,
  scriptPubKey: buildScriptPubKey(bytesToHex(hash160))
};

console.log('');
console.log('📦 Using UTXO:');
console.log('  TXID:', testUtxo.txid);
console.log('  Vout:', testUtxo.vout);
console.log('  Value:', testUtxo.value, 'zatoshis =', (testUtxo.value / 100000000).toFixed(8), 'ZEC');
console.log('');

// Build transaction
const tx = {
  version: 4 | (1 << 31),
  consensusBranchId: 0x4dec4df0, // NU6.1
  inputs: [{
    txid: testUtxo.txid,
    vout: testUtxo.vout,
    script: new Uint8Array(0),
    sequence: 0xffffffff,
    value: testUtxo.value
  }],
  outputs: [
    {
      value: 10000n,
      script: buildScriptPubKey('957a6940c621f9bbcb26fd74df2e0c1074814ab0') // t1XVyLCC1vCnsWomwmVL3bCPCdYY1JGfXm5
    },
    {
      value: 1623975n,
      script: buildScriptPubKey('9c02ad5188cafa9171b23228360b3fe4532ef211') // Change back to sender
    }
  ],
  lockTime: 0,
  expiryHeight: 3150132 // Current block + 20 (from RPC)
};

console.log('🔨 Building signature digest (ZIP-243)...');
console.log('');

// ZIP-243 signature digest
const sigData = [];

// 1. nVersion
sigData.push(...encodeUint32LE(tx.version));

// 2. nVersionGroupId
sigData.push(...encodeUint32LE(0x892F2085));

// 3. hashPrevouts - BLAKE2b-256 with personalization 'ZcashPrevoutHash'
const prevoutsData = [];
const txidBytes = hexToBytes(tx.inputs[0].txid);
prevoutsData.push(...Array.from(txidBytes).reverse());
prevoutsData.push(...encodeUint32LE(tx.inputs[0].vout));
const hashPrevouts = blake2b256(new Uint8Array(prevoutsData), 'ZcashPrevoutHash');
sigData.push(...hashPrevouts);

// 4. hashSequence - BLAKE2b-256 with personalization 'ZcashSequencHash'
const sequenceData = [];
sequenceData.push(...encodeUint32LE(tx.inputs[0].sequence));
const hashSequence = blake2b256(new Uint8Array(sequenceData), 'ZcashSequencHash');
sigData.push(...hashSequence);

// 5. hashOutputs - BLAKE2b-256 with personalization 'ZcashOutputsHash'
const outputsData = [];
for (const output of tx.outputs) {
  outputsData.push(...encodeUint64LE(output.value));
  outputsData.push(...encodeVarInt(output.script.length));
  outputsData.push(...output.script);
}
const hashOutputs = blake2b256(new Uint8Array(outputsData), 'ZcashOutputsHash');
sigData.push(...hashOutputs);

// 6. hashJoinSplits (32 bytes of zeros)
sigData.push(...new Uint8Array(32).fill(0));

// 7. hashShieldedSpends (32 bytes of zeros)
sigData.push(...new Uint8Array(32).fill(0));

// 8. hashShieldedOutputs (32 bytes of zeros)
sigData.push(...new Uint8Array(32).fill(0));

// 9. nLockTime
sigData.push(...encodeUint32LE(tx.lockTime));

// 10. nExpiryHeight
sigData.push(...encodeUint32LE(tx.expiryHeight));

// 11. valueBalance (8 bytes, 0 for transparent)
sigData.push(...encodeUint64LE(0n));

// 12. nHashType
sigData.push(...encodeUint32LE(0x01)); // SIGHASH_ALL

// 13. Input being signed
const inputTxidBytes = hexToBytes(tx.inputs[0].txid);
sigData.push(...Array.from(inputTxidBytes).reverse());
sigData.push(...encodeUint32LE(tx.inputs[0].vout));

// 14. scriptCode (prevout scriptPubKey)
const prevScript = testUtxo.scriptPubKey;
sigData.push(...encodeVarInt(prevScript.length));
sigData.push(...prevScript);

// 15. value
sigData.push(...encodeUint64LE(BigInt(tx.inputs[0].value)));

// 16. nSequence
sigData.push(...encodeUint32LE(tx.inputs[0].sequence));

console.log('Signature data length:', sigData.length, 'bytes');

// Final signature hash: BLAKE2b-256 with personalization "ZcashSigHash" + consensusBranchId
const personalization = 'ZcashSigHash' + String.fromCharCode(...encodeUint32LE(tx.consensusBranchId));
const finalHash = blake2b256(new Uint8Array(sigData), personalization);

console.log('Signature hash:', bytesToHex(finalHash));
console.log('');

// Sign with secp256k1
console.log('✍️  Signing with secp256k1...');
const signature = secp256k1.ecdsaSign(finalHash, privateKeyBytes);
const derSignature = secp256k1.signatureExport(signature.signature);

console.log('DER signature:', bytesToHex(derSignature));
console.log('DER signature length:', derSignature.length, 'bytes');
console.log('');

// Add SIGHASH_ALL to signature
const signatureWithHashType = new Uint8Array(derSignature.length + 1);
signatureWithHashType.set(derSignature);
signatureWithHashType[derSignature.length] = 0x01;

console.log('Public key:', bytesToHex(publicKey));
console.log('');

// Build scriptSig
const scriptSig = [];
scriptSig.push(...encodeVarInt(signatureWithHashType.length));
scriptSig.push(...signatureWithHashType);
scriptSig.push(...encodeVarInt(publicKey.length));
scriptSig.push(...publicKey);

tx.inputs[0].script = new Uint8Array(scriptSig);

console.log('ScriptSig length:', scriptSig.length, 'bytes');
console.log('');

// Serialize signed transaction
console.log('📝 Serializing signed transaction...');
const buffer = [];

buffer.push(...encodeUint32LE(tx.version));
buffer.push(...encodeUint32LE(0x892F2085));
buffer.push(...encodeVarInt(tx.inputs.length));

for (const input of tx.inputs) {
  const txidBytes = hexToBytes(input.txid);
  buffer.push(...Array.from(txidBytes).reverse());
  buffer.push(...encodeUint32LE(input.vout));
  buffer.push(...encodeVarInt(input.script.length));
  buffer.push(...input.script);
  buffer.push(...encodeUint32LE(input.sequence));
}

buffer.push(...encodeVarInt(tx.outputs.length));

for (const output of tx.outputs) {
  buffer.push(...encodeUint64LE(output.value));
  buffer.push(...encodeVarInt(output.script.length));
  buffer.push(...output.script);
}

buffer.push(...encodeUint32LE(tx.lockTime));
buffer.push(...encodeUint32LE(tx.expiryHeight));
buffer.push(...encodeUint64LE(0n));
buffer.push(...encodeVarInt(0));
buffer.push(...encodeVarInt(0));
buffer.push(...encodeVarInt(0));

const txHex = bytesToHex(new Uint8Array(buffer));

console.log('');
console.log('✅ SIGNED TRANSACTION:');
console.log('');
console.log('Hex:', txHex);
console.log('');
console.log('Length:', txHex.length, 'chars =', txHex.length / 2, 'bytes');
console.log('');
console.log('🚀 You can broadcast this transaction!');
console.log('');
console.log('To test broadcast, run:');
console.log('curl -X POST https://vercel-proxy-loghorizon.vercel.app/api/broadcast \\');
console.log('  -H "Content-Type: application/json" \\');
console.log(`  -d '{"rawTx":"${txHex}","network":"mainnet"}'`);

})().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
