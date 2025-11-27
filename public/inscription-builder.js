/**
 * Inscription Builder
 * Supports both Zinc (OP_RETURN) and Zerdinals (ScriptSig) protocols
 */

// Zinc Protocol constants
const ZINC_MAGIC = 0x7A; // Magic byte identifier

// Protocol identifiers
const ZINC_PROTOCOL_ID = {
  CORE: 0x0,       // NFTs and collections
  ZRC20: 0x1,      // Fungible tokens
  MARKETPLACE: 0x2 // Trading
};

const ZINC_OPERATIONS = {
  DEPLOY: 0x0,
  MINT: 0x1,
  TRANSFER: 0x2
};

// Helper to combine protocol and operation into single byte
function makeProtoOpByte(protocolId, operation) {
  return (protocolId << 4) | (operation & 0x0F);
}

// Zinc treasury configuration
const ZINC_TREASURY_ADDRESS = 't1ZcnUqva1dCydNPFd3EH8b7Scmz1V5oh1N';
const ZINC_TREASURY_TIP = 150000; // 0.0015 ZEC in zatoshis

/**
 * Build Zinc Protocol inscription (OP_RETURN)
 * Binary encoding for efficient storage
 */
function buildZincInscription(type, data) {
  console.log('[InscriptionBuilder] Building Zinc inscription:', type, data);
  
  let buffer;
  let mintPrice = 0;
  let mintRecipient = null;
  
  switch (type) {
    case 'deployZrc20':
      buffer = buildZrc20Deploy(data);
      break;
    case 'mintZrc20':
      buffer = buildZrc20Mint(data);
      // Extract mint price and recipient from data if available
      if (data.mintPrice) mintPrice = data.mintPrice;
      if (data.mintRecipient) mintRecipient = data.mintRecipient;
      break;
    case 'transferZrc20':
      buffer = buildZrc20Transfer(data);
      break;
    case 'deployCollection':
      buffer = buildZincCoreDeploy(data);
      break;
    case 'mintNft':
      buffer = buildZincCoreMint(data);
      // Extract mint price for NFTs too
      if (data.mintPrice) mintPrice = data.mintPrice;
      if (data.mintRecipient) mintRecipient = data.mintRecipient;
      break;
    default:
      throw new Error(`Unknown Zinc inscription type: ${type}`);
  }
  
  return {
    protocol: 'zinc',
    opReturn: buffer,
    treasuryAddress: ZINC_TREASURY_ADDRESS,
    treasuryAmount: ZINC_TREASURY_TIP,
    mintPrice: mintPrice, // ZEC amount to pay to deployer
    mintRecipient: mintRecipient // Address to receive mint payment
  };
}

/**
 * Build ZRC-20 Deploy inscription
 * Format: [protocol_id: u8][operation: u8][ticker: null-terminated][max: u64][limit: u64][decimals: u8][mintPrice: u64][deployerAddress: variable]
 */
function buildZrc20Deploy(data) {
  const { tick, max, limit, decimals = 8, mintPrice = 0, deployerAddress } = data;
  
  // Validate ticker
  if (!tick || tick.length < 1 || tick.length > 10) {
    throw new Error('Ticker must be 1-10 characters');
  }
  if (!/^[A-Z0-9]+$/.test(tick)) {
    throw new Error('Ticker must be uppercase alphanumeric');
  }
  
  // Validate amounts
  const maxSupply = BigInt(max);
  const mintLimit = BigInt(limit);
  if (maxSupply <= 0) throw new Error('Max supply must be positive');
  if (mintLimit <= 0) throw new Error('Mint limit must be positive');
  if (mintLimit > maxSupply) throw new Error('Mint limit cannot exceed max supply');
  
  // Convert mint price to zatoshis
  const mintPriceZatoshis = BigInt(Math.floor((mintPrice || 0) * 100000000));
  
  // Encode deployer address if provided
  const deployerBytes = deployerAddress ? new TextEncoder().encode(deployerAddress) : new Uint8Array(0);
  
  // Calculate buffer size
  const tickerBytes = new TextEncoder().encode(tick);
  const bufferSize = 1 + 1 + tickerBytes.length + 1 + 8 + 8 + 1 + 8 + 1 + deployerBytes.length; 
  // magic + proto/op + ticker + null + max + limit + decimals + mintPrice + deployerLength + deployer
  
  const buffer = new Uint8Array(bufferSize);
  let offset = 0;
  
  // Magic byte
  buffer[offset++] = ZINC_MAGIC;
  
  // Proto/Op combined byte (ZRC-20 + Deploy = 0x10)
  buffer[offset++] = makeProtoOpByte(ZINC_PROTOCOL_ID.ZRC20, ZINC_OPERATIONS.DEPLOY);
  
  // Ticker (null-terminated string)
  buffer.set(tickerBytes, offset);
  offset += tickerBytes.length;
  buffer[offset++] = 0x00; // null terminator
  
  // Max supply (u64 little-endian)
  const maxView = new DataView(buffer.buffer, offset, 8);
  maxView.setBigUint64(0, maxSupply, true); // true = little-endian
  offset += 8;
  
  // Mint limit (u64 little-endian)
  const limitView = new DataView(buffer.buffer, offset, 8);
  limitView.setBigUint64(0, mintLimit, true);
  offset += 8;
  
  // Decimals (u8)
  buffer[offset++] = decimals;
  
  // Mint price (u64 little-endian, in zatoshis)
  const priceView = new DataView(buffer.buffer, offset, 8);
  priceView.setBigUint64(0, mintPriceZatoshis, true);
  offset += 8;
  
  // Deployer address (length-prefixed)
  buffer[offset++] = deployerBytes.length;
  if (deployerBytes.length > 0) {
    buffer.set(deployerBytes, offset);
    offset += deployerBytes.length;
  }
  
  console.log('[InscriptionBuilder] ZRC-20 Deploy:', {
    tick,
    max: max.toString(),
    limit: limit.toString(),
    decimals,
    mintPrice: mintPrice || 0,
    deployerAddress: deployerAddress || 'none',
    size: buffer.length
  });
  
  return buffer;
}

/**
 * Build ZRC-20 Mint inscription
 * Format: [protocol_id: u8][operation: u8][deploy_txid: 32 bytes][amount: u64]
 */
function buildZrc20Mint(data) {
  const { deployTxid, amount } = data;
  
  if (!deployTxid || deployTxid.length !== 64) {
    throw new Error('Deploy txid must be 64 hex characters');
  }
  
  const amountBig = BigInt(amount);
  if (amountBig <= 0) throw new Error('Amount must be positive');
  
  const buffer = new Uint8Array(1 + 1 + 32 + 8); // magic + proto/op + txid + amount
  let offset = 0;
  
  // Magic byte
  buffer[offset++] = ZINC_MAGIC;
  
  // Proto/Op combined byte (ZRC-20 + Mint = 0x11)
  buffer[offset++] = makeProtoOpByte(ZINC_PROTOCOL_ID.ZRC20, ZINC_OPERATIONS.MINT);
  
  // Deploy txid (32 bytes, reversed for internal byte order)
  const txidBytes = hexToBytes(deployTxid).reverse();
  buffer.set(txidBytes, offset);
  offset += 32;
  
  // Amount (u64 little-endian)
  const amountView = new DataView(buffer.buffer, offset, 8);
  amountView.setBigUint64(0, amountBig, true);
  
  console.log('[InscriptionBuilder] ZRC-20 Mint:', {
    deployTxid,
    amount: amount.toString(),
    size: buffer.length
  });
  
  return buffer;
}

/**
 * Build ZRC-20 Transfer inscription
 * Format: [protocol_id: u8][operation: u8][deploy_txid: 32 bytes][amount: u64]
 */
function buildZrc20Transfer(data) {
  const { deployTxid, amount, to } = data;
  
  if (!deployTxid || deployTxid.length !== 64) {
    throw new Error('Deploy txid must be 64 hex characters');
  }
  
  const amountBig = BigInt(amount);
  if (amountBig <= 0) throw new Error('Amount must be positive');
  
  // Note: 'to' address is implicit in the transaction output, not in OP_RETURN
  
  const buffer = new Uint8Array(1 + 1 + 32 + 8); // magic + proto/op + txid + amount
  let offset = 0;
  
  // Magic byte
  buffer[offset++] = ZINC_MAGIC;
  
  // Proto/Op combined byte (ZRC-20 + Transfer = 0x12)
  buffer[offset++] = makeProtoOpByte(ZINC_PROTOCOL_ID.ZRC20, ZINC_OPERATIONS.TRANSFER);
  
  const txidBytes = hexToBytes(deployTxid).reverse();
  buffer.set(txidBytes, offset);
  offset += 32;
  
  const amountView = new DataView(buffer.buffer, offset, 8);
  amountView.setBigUint64(0, amountBig, true);
  
  console.log('[InscriptionBuilder] ZRC-20 Transfer:', {
    deployTxid,
    amount: amount.toString(),
    to,
    size: buffer.length
  });
  
  return buffer;
}

/**
 * Build Zinc Core Deploy (NFT collection)
 * Format: [protocol_id: u8][operation: u8][name: null-terminated][metadata: optional json]
 */
function buildZincCoreDeploy(data) {
  const { name, metadata } = data;
  
  if (!name || name.length < 1 || name.length > 100) {
    throw new Error('Collection name must be 1-100 characters');
  }
  
  const nameBytes = new TextEncoder().encode(name);
  const metadataBytes = metadata ? new TextEncoder().encode(JSON.stringify(metadata)) : new Uint8Array(0);
  
  const buffer = new Uint8Array(1 + 1 + 1 + nameBytes.length + 2 + metadataBytes.length); // magic + proto/op + nameLength + name + metadataLength + metadata
  let offset = 0;
  
  buffer[offset++] = ZINC_MAGIC;
  buffer[offset++] = makeProtoOpByte(ZINC_PROTOCOL_ID.CORE, ZINC_OPERATIONS.DEPLOY);
  
  buffer[offset++] = nameBytes.length;
  buffer.set(nameBytes, offset);
  offset += nameBytes.length;
  buffer[offset++] = 0x00; // null terminator
  
  if (metadataBytes.length > 0) {
    buffer[offset++] = metadataBytes.length;
    buffer.set(metadataBytes, offset);
  }
  
  console.log('[InscriptionBuilder] Zinc Core Deploy:', {
    name,
    hasMetadata: !!metadata,
    size: buffer.length
  });
  
  return buffer;
}

/**
 * Build Zinc Core Mint (NFT)
 * Format: [protocol_id: u8][operation: u8][collection_txid: 32 bytes][protocol: u8][data: variable]
 */
function buildZincCoreMint(data) {
  const { collectionTxid, contentProtocol, contentData, mimeType } = data;
  
  if (!collectionTxid || collectionTxid.length !== 64) {
    throw new Error('Collection txid must be 64 hex characters');
  }
  
  // Content protocol IDs
  const protocolIds = {
    'ipfs': 0x00,
    'arweave': 0x01,
    'http': 0x02,
    'plaintext': 0x03
  };
  
  const protocolId = protocolIds[contentProtocol];
  if (protocolId === undefined) {
    throw new Error(`Unknown content protocol: ${contentProtocol}`);
  }
  
  const contentBytes = new TextEncoder().encode(contentData);
  const mimeBytes = mimeType ? new TextEncoder().encode(mimeType) : new Uint8Array(0);
  
  const buffer = new Uint8Array(1 + 1 + 32 + 1 + contentBytes.length + 1 + mimeBytes.length); // magic + proto/op + txid + protocol + content + mimeLength + mime
  let offset = 0;
  
  buffer[offset++] = ZINC_MAGIC;
  buffer[offset++] = makeProtoOpByte(ZINC_PROTOCOL_ID.CORE, ZINC_OPERATIONS.MINT);
  
  const txidBytes = hexToBytes(collectionTxid).reverse();
  buffer.set(txidBytes, offset);
  offset += 32;
  
  buffer[offset++] = protocolId;
  
  buffer.set(contentBytes, offset);
  offset += contentBytes.length;
  buffer[offset++] = 0x00; // null terminator
  
  if (mimeBytes.length > 0) {
    buffer.set(mimeBytes, offset);
  }
  
  console.log('[InscriptionBuilder] Zinc Core Mint:', {
    collectionTxid,
    contentProtocol,
    contentLength: contentData.length,
    mimeType,
    size: buffer.length
  });
  
  return buffer;
}

/**
 * Build Zerdinals inscription (ScriptSig envelope)
 * Similar to Bitcoin Ordinals format
 */
function buildZerdinalsInscription(data) {
  console.log('[InscriptionBuilder] Building Zerdinals inscription:', data);
  
  let contentType, content;
  
  // Handle ZRC-20 operations (convert to JSON)
  if (data.op === 'deploy') {
    contentType = 'application/json';
    content = JSON.stringify({
      p: 'zrc-20',
      op: 'deploy',
      tick: data.tick,
      max: data.max,
      lim: data.lim
    });
  } else if (data.op === 'mint') {
    contentType = 'application/json';
    content = JSON.stringify({
      p: 'zrc-20',
      op: 'mint',
      tick: data.tick,
      amt: data.amt
    });
  } else {
    // Regular inscription (text, image, etc.)
    contentType = data.contentType;
    content = data.content;
    
    if (!contentType) throw new Error('Content type required for Zerdinals');
    if (!content) throw new Error('Content required for Zerdinals');
  }
  
  // Build envelope: OP_FALSE OP_IF "ord" OP_1 <content-type> OP_0 <content> OP_ENDIF
  const envelope = buildZerdinalsEnvelope(contentType, content);
  
  return {
    protocol: 'zerdinals',
    envelope: envelope,
    // Zerdinals now also includes treasury tip
    treasuryAddress: ZINC_TREASURY_ADDRESS,
    treasuryAmount: ZINC_TREASURY_TIP
  };
}

/**
 * Build Zerdinals envelope for ScriptSig
 */
function buildZerdinalsEnvelope(contentType, content) {
  // Convert content to bytes
  const contentBytes = typeof content === 'string' 
    ? new TextEncoder().encode(content)
    : content;
  
  const contentTypeBytes = new TextEncoder().encode(contentType);
  
  // Build script: OP_FALSE OP_IF "ord" OP_1 <type> OP_0 <content> OP_ENDIF
  const script = [];
  
  script.push(0x00); // OP_FALSE
  script.push(0x63); // OP_IF
  script.push(0x03); // Push 3 bytes
  script.push(...[0x6f, 0x72, 0x64]); // "ord"
  script.push(0x51); // OP_1
  script.push(contentTypeBytes.length); // Push content type length
  script.push(...contentTypeBytes);
  script.push(0x00); // OP_0
  
  // Push content in chunks (max 520 bytes per push)
  let offset = 0;
  while (offset < contentBytes.length) {
    const chunkSize = Math.min(520, contentBytes.length - offset);
    const chunk = contentBytes.slice(offset, offset + chunkSize);
    
    if (chunkSize < 76) {
      script.push(chunkSize);
    } else if (chunkSize <= 255) {
      script.push(0x4c); // OP_PUSHDATA1
      script.push(chunkSize);
    } else {
      script.push(0x4d); // OP_PUSHDATA2
      script.push(chunkSize & 0xff);
      script.push((chunkSize >> 8) & 0xff);
    }
    
    script.push(...chunk);
    offset += chunkSize;
  }
  
  script.push(0x68); // OP_ENDIF
  
  console.log('[InscriptionBuilder] Zerdinals envelope size:', script.length);
  
  return new Uint8Array(script);
}

/**
 * Helper: Convert hex string to bytes
 */
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Helper: Convert bytes to hex string
 */
function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Export functions
if (typeof self !== 'undefined') {
  self.InscriptionBuilder = {
    buildZincInscription,
    buildZerdinalsInscription,
    ZINC_TREASURY_ADDRESS,
    ZINC_TREASURY_TIP
  };
}

console.log('[InscriptionBuilder] Module loaded - supports Zinc (OP_RETURN) and Zerdinals (ScriptSig)');
