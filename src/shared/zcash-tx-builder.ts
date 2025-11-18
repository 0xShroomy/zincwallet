/**
 * Zcash Transaction Builder
 * Builds transactions for inscriptions (ZRC-20, NFTs)
 * 
 * Transaction structure:
 * - Version: 4 bytes (Zcash v4 = 0x04000000)
 * - Inputs: VarInt count + input array
 * - Outputs: VarInt count + output array (including OP_RETURN)
 * - Lock time: 4 bytes
 */

import bs58 from 'bs58';
import { sha256 } from '@noble/hashes/sha256';

export interface UTXO {
  txid: string;              // Transaction ID (hex)
  vout: number;              // Output index
  scriptPubKey: string;      // Script (hex)
  satoshis: number;          // Amount in zatoshis
  confirmations: number;     // Number of confirmations
}

export interface TransactionInput {
  txid: string;              // Previous transaction ID
  vout: number;              // Output index
  scriptSig: Uint8Array;     // Signature script (will be signed later)
  sequence: number;          // Sequence number (0xffffffff)
}

export interface TransactionOutput {
  satoshis: bigint;          // Amount in zatoshis
  scriptPubKey: Uint8Array;  // Output script
}

export interface UnsignedTransaction {
  version: number;
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
  lockTime: number;
}

/**
 * Build inscription transaction
 */
export function buildInscriptionTransaction(params: {
  utxos: UTXO[];
  inscriptionData: Uint8Array;  // ZRC-20 or NFT inscription bytes
  changeAddress: string;         // Address to send change
  recipientAddress?: string;     // Optional recipient for transfers
  recipientAmount?: bigint;      // Amount to send to recipient
  feeRate?: number;              // Satoshis per byte (default: 1)
}): UnsignedTransaction {
  const {
    utxos,
    inscriptionData,
    changeAddress,
    recipientAddress,
    recipientAmount = 0n,
    feeRate = 1,
  } = params;

  if (utxos.length === 0) {
    throw new Error('No UTXOs available');
  }

  // Calculate total input amount
  const totalInput = utxos.reduce((sum, utxo) => sum + BigInt(utxo.satoshis), 0n);

  // Estimate transaction size for fee calculation
  // Rough estimate: 10 + (inputs * 150) + (outputs * 34)
  const estimatedSize = 10 + (utxos.length * 150) + (3 * 34); // 3 outputs max
  const estimatedFee = BigInt(estimatedSize * feeRate);

  // Calculate change amount
  const totalOutput = recipientAmount;
  const changeAmount = totalInput - totalOutput - estimatedFee;

  if (changeAmount < 0n) {
    throw new Error(`Insufficient funds. Need ${totalOutput + estimatedFee} zatoshis, have ${totalInput}`);
  }

  // Build inputs from UTXOs
  const inputs: TransactionInput[] = utxos.map(utxo => ({
    txid: utxo.txid,
    vout: utxo.vout,
    scriptSig: new Uint8Array(0), // Empty for unsigned transaction
    sequence: 0xffffffff,
  }));

  // Build outputs
  const outputs: TransactionOutput[] = [];

  // Output 0: OP_RETURN with inscription data
  outputs.push({
    satoshis: 0n,
    scriptPubKey: createOpReturnScript(inscriptionData),
  });

  // Output 1: Recipient (if transferring)
  if (recipientAddress && recipientAmount > 0n) {
    outputs.push({
      satoshis: recipientAmount,
      scriptPubKey: addressToScriptPubKey(recipientAddress),
    });
  }

  // Output 2/3: Change output
  if (changeAmount > 546n) { // Dust threshold
    outputs.push({
      satoshis: changeAmount,
      scriptPubKey: addressToScriptPubKey(changeAddress),
    });
  }

  return {
    version: 4, // Zcash v4 (Sapling)
    inputs,
    outputs,
    lockTime: 0,
  };
}

/**
 * Create OP_RETURN script for inscription data
 */
export function createOpReturnScript(data: Uint8Array): Uint8Array {
  if (data.length > 80) {
    console.warn('Inscription data larger than 80 bytes may not be standard');
  }

  // OP_RETURN (0x6a) + length + data
  const script = new Uint8Array(2 + data.length);
  script[0] = 0x6a; // OP_RETURN
  
  // Push data opcode
  if (data.length <= 75) {
    script[1] = data.length; // Direct push
  } else {
    throw new Error('Data too large for single OP_RETURN (max 80 bytes)');
  }
  
  script.set(data, 2);
  return script;
}

/**
 * Convert Zcash address to scriptPubKey
 * P2PKH format: OP_DUP OP_HASH160 <pubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
 */
export function addressToScriptPubKey(address: string): Uint8Array {
  // Decode base58check address to get pubkey hash
  const decoded = base58Decode(address);
  
  if (decoded.length !== 22) { // 2 bytes prefix + 20 bytes hash
    throw new Error('Invalid address length');
  }

  // Extract 20-byte pubkey hash (skip 2-byte prefix)
  const pubKeyHash = decoded.slice(2);

  // Build P2PKH script: OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
  const script = new Uint8Array(25);
  script[0] = 0x76; // OP_DUP
  script[1] = 0xa9; // OP_HASH160
  script[2] = 0x14; // Push 20 bytes
  script.set(pubKeyHash, 3);
  script[23] = 0x88; // OP_EQUALVERIFY
  script[24] = 0xac; // OP_CHECKSIG

  return script;
}

/**
 * Serialize unsigned transaction to hex
 * (Ready for signing in next task)
 */
export function serializeTransaction(tx: UnsignedTransaction): string {
  const buffer: number[] = [];

  // Version (4 bytes, little-endian)
  writeUint32LE(buffer, tx.version);

  // Input count (VarInt)
  writeVarInt(buffer, tx.inputs.length);

  // Inputs
  for (const input of tx.inputs) {
    // Previous txid (32 bytes, reversed)
    const txidBytes = hexToBytes(input.txid);
    txidBytes.reverse();
    buffer.push(...txidBytes);

    // Output index (4 bytes, little-endian)
    writeUint32LE(buffer, input.vout);

    // Script length and script
    writeVarInt(buffer, input.scriptSig.length);
    buffer.push(...input.scriptSig);

    // Sequence (4 bytes)
    writeUint32LE(buffer, input.sequence);
  }

  // Output count (VarInt)
  writeVarInt(buffer, tx.outputs.length);

  // Outputs
  for (const output of tx.outputs) {
    // Amount (8 bytes, little-endian)
    writeUint64LE(buffer, output.satoshis);

    // Script length and script
    writeVarInt(buffer, output.scriptPubKey.length);
    buffer.push(...output.scriptPubKey);
  }

  // Lock time (4 bytes)
  writeUint32LE(buffer, tx.lockTime);

  return Buffer.from(buffer).toString('hex');
}

/**
 * Helper functions
 */

function writeUint32LE(buffer: number[], value: number): void {
  buffer.push(value & 0xff);
  buffer.push((value >> 8) & 0xff);
  buffer.push((value >> 16) & 0xff);
  buffer.push((value >> 24) & 0xff);
}

function writeUint64LE(buffer: number[], value: bigint): void {
  const low = Number(value & 0xffffffffn);
  const high = Number(value >> 32n);
  writeUint32LE(buffer, low);
  writeUint32LE(buffer, high);
}

function writeVarInt(buffer: number[], value: number): void {
  if (value < 0xfd) {
    buffer.push(value);
  } else if (value <= 0xffff) {
    buffer.push(0xfd);
    buffer.push(value & 0xff);
    buffer.push((value >> 8) & 0xff);
  } else if (value <= 0xffffffff) {
    buffer.push(0xfe);
    writeUint32LE(buffer, value);
  } else {
    throw new Error('VarInt too large');
  }
}

function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return bytes;
}

function base58Decode(address: string): Uint8Array {
  // Decode base58check address
  const decoded = bs58.decode(address);
  
  // Verify checksum (last 4 bytes)
  const payload = decoded.slice(0, -4);
  const checksum = decoded.slice(-4);
  
  // Double SHA-256 hash for checksum verification
  const hash1 = sha256(payload);
  const hash2 = sha256(hash1);
  const expectedChecksum = hash2.slice(0, 4);
  
  // Verify checksum matches
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== expectedChecksum[i]) {
      throw new Error('Invalid address checksum');
    }
  }
  
  return payload;
}
