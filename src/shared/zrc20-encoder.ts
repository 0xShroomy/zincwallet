/**
 * ZRC-20 Binary Encoder
 * Implements Zinc Protocol ZRC-20 token standard
 * 
 * Protocol byte structure:
 * - Deploy:   0x10 | ticker (null-terminated) | maxSupply (u64 LE) | mintLimit (u64 LE) | decimals (u8)
 * - Mint:     0x11 | deployTxid (32 bytes reversed) | amount (u64 LE)
 * - Transfer: 0x12 | deployTxid (32 bytes reversed) | amount (u64 LE)
 */

/**
 * ZRC-20 Deploy parameters
 */
export interface ZRC20Deploy {
  ticker: string;        // 4-6 uppercase alphanumeric characters
  maxSupply: bigint;     // Maximum supply (e.g., 21000000)
  mintLimit: bigint;     // Max amount per mint operation
  decimals: number;      // Number of decimal places (0-18)
}

/**
 * ZRC-20 Mint parameters
 */
export interface ZRC20Mint {
  deployTxid: string;    // Transaction ID of the deploy inscription (hex)
  amount: bigint;        // Amount to mint (must be <= mintLimit)
}

/**
 * ZRC-20 Transfer parameters
 */
export interface ZRC20Transfer {
  deployTxid: string;    // Transaction ID of the deploy inscription (hex)
  amount: bigint;        // Amount to transfer
}

/**
 * Encode ZRC-20 Deploy operation
 */
export function encodeZRC20Deploy(params: ZRC20Deploy): Uint8Array {
  // Validate parameters
  if (!params.ticker || params.ticker.length < 4 || params.ticker.length > 6) {
    throw new Error('Ticker must be 4-6 characters');
  }
  if (!/^[A-Z0-9]+$/.test(params.ticker)) {
    throw new Error('Ticker must be uppercase alphanumeric');
  }
  if (params.decimals < 0 || params.decimals > 18) {
    throw new Error('Decimals must be between 0 and 18');
  }
  if (params.maxSupply <= 0n) {
    throw new Error('Max supply must be greater than 0');
  }
  if (params.mintLimit <= 0n || params.mintLimit > params.maxSupply) {
    throw new Error('Mint limit must be > 0 and <= max supply');
  }

  // Calculate buffer size:
  // 1 byte (protocol+op) + ticker (max 6) + 1 null terminator + 8 (maxSupply) + 8 (mintLimit) + 1 (decimals)
  const tickerBytes = new TextEncoder().encode(params.ticker);
  const bufferSize = 1 + tickerBytes.length + 1 + 8 + 8 + 1;
  const buffer = new Uint8Array(bufferSize);
  
  let offset = 0;
  
  // Byte 0: Protocol 0x1 (ZRC-20) + Operation 0x0 (Deploy) = 0x10
  buffer[offset++] = 0x10;
  
  // Ticker (null-terminated)
  buffer.set(tickerBytes, offset);
  offset += tickerBytes.length;
  buffer[offset++] = 0x00; // Null terminator
  
  // Max supply (uint64 little-endian)
  writeUint64LE(buffer, params.maxSupply, offset);
  offset += 8;
  
  // Mint limit (uint64 little-endian)
  writeUint64LE(buffer, params.mintLimit, offset);
  offset += 8;
  
  // Decimals (uint8)
  buffer[offset++] = params.decimals;
  
  return buffer;
}

/**
 * Encode ZRC-20 Mint operation
 */
export function encodeZRC20Mint(params: ZRC20Mint): Uint8Array {
  // Validate txid
  if (!/^[0-9a-f]{64}$/i.test(params.deployTxid)) {
    throw new Error('Deploy txid must be 64 hex characters');
  }
  if (params.amount <= 0n) {
    throw new Error('Amount must be greater than 0');
  }

  // Buffer size: 1 byte (protocol+op) + 32 bytes (txid) + 8 bytes (amount)
  const buffer = new Uint8Array(41);
  let offset = 0;
  
  // Byte 0: Protocol 0x1 + Operation 0x1 (Mint) = 0x11
  buffer[offset++] = 0x11;
  
  // Deploy txid (reversed, as per Bitcoin/Zcash convention)
  const txidBytes = hexToBytes(params.deployTxid);
  txidBytes.reverse();
  buffer.set(txidBytes, offset);
  offset += 32;
  
  // Amount (uint64 little-endian)
  writeUint64LE(buffer, params.amount, offset);
  offset += 8;
  
  return buffer;
}

/**
 * Encode ZRC-20 Transfer operation
 */
export function encodeZRC20Transfer(params: ZRC20Transfer): Uint8Array {
  // Validate txid
  if (!/^[0-9a-f]{64}$/i.test(params.deployTxid)) {
    throw new Error('Deploy txid must be 64 hex characters');
  }
  if (params.amount <= 0n) {
    throw new Error('Amount must be greater than 0');
  }

  // Buffer size: 1 byte (protocol+op) + 32 bytes (txid) + 8 bytes (amount)
  const buffer = new Uint8Array(41);
  let offset = 0;
  
  // Byte 0: Protocol 0x1 + Operation 0x2 (Transfer) = 0x12
  buffer[offset++] = 0x12;
  
  // Deploy txid (reversed)
  const txidBytes = hexToBytes(params.deployTxid);
  txidBytes.reverse();
  buffer.set(txidBytes, offset);
  offset += 32;
  
  // Amount (uint64 little-endian)
  writeUint64LE(buffer, params.amount, offset);
  offset += 8;
  
  return buffer;
}

/**
 * Write uint64 in little-endian format
 */
function writeUint64LE(buffer: Uint8Array, value: bigint, offset: number): void {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  view.setBigUint64(offset, value, true); // true = little-endian
}

/**
 * Convert hex string to bytes
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Convert bytes to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Decode ZRC-20 inscription (for verification/display)
 */
export function decodeZRC20(data: Uint8Array): {
  operation: 'deploy' | 'mint' | 'transfer';
  details: Record<string, unknown>;
} {
  if (data.length === 0) {
    throw new Error('Empty data');
  }

  const opByte = data[0];
  
  switch (opByte) {
    case 0x10: // Deploy
      return decodeZRC20Deploy(data);
    case 0x11: // Mint
      return decodeZRC20Mint(data);
    case 0x12: // Transfer
      return decodeZRC20Transfer(data);
    default:
      throw new Error(`Unknown ZRC-20 operation: 0x${opByte.toString(16)}`);
  }
}

function decodeZRC20Deploy(data: Uint8Array) {
  let offset = 1;
  
  // Read ticker (null-terminated string)
  let tickerEnd = offset;
  while (tickerEnd < data.length && data[tickerEnd] !== 0) {
    tickerEnd++;
  }
  const ticker = new TextDecoder().decode(data.slice(offset, tickerEnd));
  offset = tickerEnd + 1; // Skip null terminator
  
  // Read max supply (uint64 LE)
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const maxSupply = view.getBigUint64(offset, true);
  offset += 8;
  
  // Read mint limit (uint64 LE)
  const mintLimit = view.getBigUint64(offset, true);
  offset += 8;
  
  // Read decimals (uint8)
  const decimals = data[offset];
  
  return {
    operation: 'deploy' as const,
    details: { ticker, maxSupply, mintLimit, decimals },
  };
}

function decodeZRC20Mint(data: Uint8Array) {
  let offset = 1;
  
  // Read txid (32 bytes, reversed)
  const txidBytes = data.slice(offset, offset + 32);
  txidBytes.reverse();
  const deployTxid = bytesToHex(txidBytes);
  offset += 32;
  
  // Read amount (uint64 LE)
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const amount = view.getBigUint64(offset, true);
  
  return {
    operation: 'mint' as const,
    details: { deployTxid, amount },
  };
}

function decodeZRC20Transfer(data: Uint8Array) {
  let offset = 1;
  
  // Read txid (32 bytes, reversed)
  const txidBytes = data.slice(offset, offset + 32);
  txidBytes.reverse();
  const deployTxid = bytesToHex(txidBytes);
  offset += 32;
  
  // Read amount (uint64 LE)
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const amount = view.getBigUint64(offset, true);
  
  return {
    operation: 'transfer' as const,
    details: { deployTxid, amount },
  };
}
