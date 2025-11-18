import type { ZRC20DeployParams, ZRC20MintParams, ZRC20TransferParams } from '@/types/inscriptions';
import { ZINC_PROTOCOL } from '@/shared/config';

/**
 * Encodes ZRC-20 deploy inscription according to Zinc Protocol spec
 * Uses BINARY encoding per official Zinc docs
 * Format: [Protocol+Op:1][Ticker:5][Max:8][Limit:8][Decimals:1]
 * Example: 10 5a494e4300 00000000004c4b40 00000000000003e8 08
 */
export function encodeZRC20Deploy(params: ZRC20DeployParams): Buffer {
  const { ticker, max, limit, decimals } = params;
  
  // Validation
  if (!ticker || ticker.length < ZINC_PROTOCOL.ZRC20_TICKER_MIN_LENGTH || ticker.length > ZINC_PROTOCOL.ZRC20_TICKER_MAX_LENGTH) {
    throw new Error(`Ticker must be ${ZINC_PROTOCOL.ZRC20_TICKER_MIN_LENGTH}-${ZINC_PROTOCOL.ZRC20_TICKER_MAX_LENGTH} characters`);
  }
  
  if (!/^[a-zA-Z0-9]+$/.test(ticker)) {
    throw new Error('Ticker must contain only alphanumeric characters');
  }
  
  if (decimals < 0 || decimals > ZINC_PROTOCOL.ZRC20_MAX_DECIMALS) {
    throw new Error(`Decimals must be between 0 and ${ZINC_PROTOCOL.ZRC20_MAX_DECIMALS}`);
  }
  
  // Validate numeric values
  const maxNum = BigInt(max);
  const limitNum = BigInt(limit);
  
  if (maxNum <= 0n || limitNum <= 0n) {
    throw new Error('Max and limit must be positive numbers');
  }
  
  // Binary encoding: Protocol ID (0x01) + Operation (0x00 = Deploy)
  const buffer = Buffer.alloc(23);
  let offset = 0;
  
  // Byte 0: Protocol (0x1) + Op (0x0) = 0x10
  buffer.writeUInt8(0x10, offset++);
  
  // Bytes 1-5: Ticker (4 chars + null terminator, uppercase)
  const tickerUpper = ticker.toUpperCase().padEnd(4, '\0');
  buffer.write(tickerUpper, offset, 4, 'ascii');
  buffer.writeUInt8(0x00, offset + 4); // null terminator
  offset += 5;
  
  // Bytes 6-13: Max supply (little-endian uint64)
  buffer.writeBigUInt64LE(maxNum, offset);
  offset += 8;
  
  // Bytes 14-21: Mint limit (little-endian uint64)
  buffer.writeBigUInt64LE(limitNum, offset);
  offset += 8;
  
  // Byte 22: Decimals
  buffer.writeUInt8(decimals, offset);
  
  return buffer;
}

/**
 * Encodes ZRC-20 mint inscription
 * Uses BINARY encoding per official Zinc docs
 * Format: [Protocol+Op:1][DeployTxId:32][Amount:8]
 */
export function encodeZRC20Mint(params: ZRC20MintParams): Buffer {
  const { deployTxId, amount } = params;
  
  // Validation
  if (!deployTxId || deployTxId.length !== 64) {
    throw new Error('Invalid deploy transaction ID (must be 64 hex chars)');
  }
  
  const amountNum = BigInt(amount);
  if (amountNum <= 0n) {
    throw new Error('Amount must be a positive number');
  }
  
  // Binary encoding
  const buffer = Buffer.alloc(41);
  let offset = 0;
  
  // Byte 0: Protocol (0x1) + Op (0x1 = Mint) = 0x11
  buffer.writeUInt8(0x11, offset++);
  
  // Bytes 1-32: Deploy txid (32 bytes, reverse byte order for Zcash)
  const txidBuffer = Buffer.from(deployTxId, 'hex').reverse();
  txidBuffer.copy(buffer, offset);
  offset += 32;
  
  // Bytes 33-40: Amount (little-endian uint64)
  buffer.writeBigUInt64LE(amountNum, offset);
  
  return buffer;
}

/**
 * Encodes ZRC-20 transfer inscription
 * Uses BINARY encoding per official Zinc docs
 * Format: [Protocol+Op:1][DeployTxId:32][Amount:8]
 * Note: Recipient is specified in transaction output, not in inscription
 */
export function encodeZRC20Transfer(params: ZRC20TransferParams): Buffer {
  const { deployTxId, amount } = params;
  
  // Validation
  if (!deployTxId || deployTxId.length !== 64) {
    throw new Error('Invalid deploy transaction ID (must be 64 hex chars)');
  }
  
  const amountNum = BigInt(amount);
  if (amountNum <= 0n) {
    throw new Error('Amount must be a positive number');
  }
  
  if (!params.recipient || !isValidZcashAddress(params.recipient)) {
    throw new Error('Invalid recipient address');
  }
  
  // Binary encoding
  const buffer = Buffer.alloc(41);
  let offset = 0;
  
  // Byte 0: Protocol (0x1) + Op (0x2 = Transfer) = 0x12
  buffer.writeUInt8(0x12, offset++);
  
  // Bytes 1-32: Deploy txid (32 bytes, reverse byte order for Zcash)
  const txidBuffer = Buffer.from(deployTxId, 'hex').reverse();
  txidBuffer.copy(buffer, offset);
  offset += 32;
  
  // Bytes 33-40: Amount (little-endian uint64)
  buffer.writeBigUInt64LE(amountNum, offset);
  
  return buffer;
}


/**
 * Validates Zcash t-address format
 */
function isValidZcashAddress(address: string): boolean {
  if (!address) return false;
  // Basic validation for t-addresses (P2PKH)
  // Testnet: tm* or t1*, Mainnet: t1*
  return /^(tm[a-zA-Z0-9]{33}|t1[a-zA-Z0-9]{33})$/.test(address);
}

/**
 * Calculates the size of encoded inscription in bytes
 */
export function calculateInscriptionSize(inscription: Buffer): number {
  return inscription.length;
}

/**
 * Parses a ZRC-20 inscription from OP_RETURN data
 */
export function parseZRC20Inscription(data: Buffer): {
  protocol: string;
  operation: string;
  params: Record<string, string>;
} | null {
  try {
    const inscription = data.toString('utf8');
    
    if (!inscription.startsWith('zinc:p=zrc-20')) {
      return null;
    }
    
    // Parse key-value pairs
    const parts = inscription.split(/\s+/);
    const params: Record<string, string> = {};
    
    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key && value) {
        params[key] = value;
      }
    }
    
    return {
      protocol: 'zrc-20',
      operation: params['op'] || '',
      params,
    };
  } catch (error) {
    return null;
  }
}
