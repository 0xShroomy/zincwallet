import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Configuration
const BLOCKCHAIR_API_KEY = process.env.BLOCKCHAIR_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SCAN_INTERVAL = parseInt(process.env.SCAN_INTERVAL_SECONDS || '300') * 1000;
const START_BLOCK = parseInt(process.env.START_BLOCK || '3141500');
const NETWORK = process.env.NETWORK || 'mainnet';

// Validate configuration
if (!BLOCKCHAIR_API_KEY) {
  console.error('❌ BLOCKCHAIR_API_KEY not set');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Supabase credentials not set');
  process.exit(1);
}

console.log('🚀 Zync Wallet Indexer Starting...');
console.log(`📡 Network: ${NETWORK}`);
console.log(`🔑 Blockchair API: ${BLOCKCHAIR_API_KEY.substring(0, 10)}...`);
console.log(`🗄️  Supabase: ${SUPABASE_URL}`);
console.log(`⏱️  Scan interval: ${SCAN_INTERVAL / 1000}s`);

// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Get current block height from Blockchair
async function getCurrentBlockHeight() {
  try {
    const url = `https://api.blockchair.com/zcash/stats?key=${BLOCKCHAIR_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    return data.data.blocks;
  } catch (error) {
    console.error('❌ Failed to get current block height:', error.message);
    return null;
  }
}

// Get last scanned block from database
async function getLastScannedBlock() {
  try {
    const { data, error } = await supabase
      .from('indexer_state')
      .select('last_scanned_block')
      .eq('id', 1)
      .single();

    if (error) throw error;
    return data?.last_scanned_block || START_BLOCK;
  } catch (error) {
    console.log('📝 Initializing indexer state...');
    
    // Initialize if doesn't exist
    await supabase
      .from('indexer_state')
      .upsert({ id: 1, last_scanned_block: START_BLOCK });
    
    return START_BLOCK;
  }
}

// Update last scanned block
async function updateLastScannedBlock(blockHeight) {
  const { data, error } = await supabase
    .from('indexer_state')
    .upsert({ 
      id: 1, 
      last_scanned_block: blockHeight,
      last_scan_time: new Date().toISOString()
    });
  
  if (error) {
    console.error('❌ Failed to update indexer state:', error);
  }
}

// Fetch block transactions from Blockchair
async function fetchBlockTransactions(blockHeight) {
  try {
    const url = `https://api.blockchair.com/zcash/dashboards/block/${blockHeight}?key=${BLOCKCHAIR_API_KEY}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Blockchair API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.data[blockHeight]?.transactions || [];
  } catch (error) {
    console.error(`❌ Failed to fetch block ${blockHeight}:`, error.message);
    return [];
  }
}

// Parse Zinc inscription from OP_RETURN (outputs)
// Real binary format: 6a [length] 7a [proto/op] [payload]
// Magic: 0x7A, Proto/Op: single byte (high 4 bits = protocol, low 4 bits = operation)
function parseZincInscription(opReturnHex) {
  try {
    // OP_RETURN format: 6a (OP_RETURN) + length + data
    if (!opReturnHex.startsWith('6a')) return null;
    
    // Skip OP_RETURN byte and length byte
    const dataHex = opReturnHex.substring(4);
    const buffer = Buffer.from(dataHex, 'hex');
    
    if (buffer.length < 2) {
      console.log(`  ⚠️ Buffer too short: ${buffer.length} bytes`);
      return null;
    }
    
    // Check for magic byte (0x7A = 122)
    const magic = buffer[0];
    console.log(`  🔍 Checking magic byte: 0x${magic.toString(16)} (expected 0x7a)`);
    
    if (magic !== 0x7A) {
      console.log(`  ❌ Not Zinc Protocol (wrong magic byte)`);
      return null;
    }
    
    // Read proto/op combined byte
    const protoOp = buffer[1];
    const protocolId = (protoOp >> 4) & 0x0F; // High 4 bits
    const operation = protoOp & 0x0F; // Low 4 bits
    
    console.log(`  🔍 Zinc Protocol: magic=0x${magic.toString(16)}, proto=${protocolId}, op=${operation}`);
    
    // Protocol IDs: 0x0 = Zinc Core, 0x1 = ZRC-20, 0x2 = Marketplace
    if (protocolId === 0x0) {
      // Zinc Core (NFT collections)
      return parseZincCoreInscription(buffer, operation);
    } else if (protocolId === 0x1) {
      // ZRC-20 tokens
      return parseZrc20Inscription(buffer, operation);
    } else if (protocolId === 0x2) {
      // Marketplace
      return parseMarketplaceInscription(buffer, operation);
    }
    
    return null;
  } catch (error) {
    console.log(`  ⚠️ Error parsing Zinc inscription: ${error.message}`);
    return null;
  }
}

// Parse ZRC-20 inscription (protocol ID 0x1)
function parseZrc20Inscription(buffer, operation) {
  let offset = 2; // Skip magic byte and proto/op byte
  
  // Operation types: 0x00 = deploy, 0x01 = mint, 0x02 = transfer
  if (operation === 0x00) {
    // Deploy: [ticker: null-terminated][max: u64][limit: u64][decimals: u8][mintPrice: u64][deployerLength: u8][deployer: bytes]
    const tickerStart = offset;
    while (offset < buffer.length && buffer[offset] !== 0x00) offset++;
    const ticker = buffer.slice(tickerStart, offset).toString('utf8');
    offset++; // Skip null terminator
    
    const maxSupply = buffer.readBigUInt64LE(offset);
    offset += 8;
    const mintLimit = buffer.readBigUInt64LE(offset);
    offset += 8;
    const decimals = buffer[offset++];
    const mintPrice = buffer.readBigUInt64LE(offset);
    offset += 8;
    const deployerLength = buffer[offset++];
    const deployer = deployerLength > 0 ? buffer.slice(offset, offset + deployerLength).toString('utf8') : null;
    
    console.log(`  ✅ ZRC-20 Deploy: ${ticker}, max=${maxSupply}, limit=${mintLimit}`);
    
    return {
      protocol: 'zinc',
      subProtocol: 'zrc-20',
      operation: 'deploy',
      data: {
        p: 'zrc-20',
        op: 'deploy',
        tick: ticker,
        max: maxSupply.toString(),
        lim: mintLimit.toString(),
        dec: decimals,
        mintPrice: mintPrice.toString(),
        deployer
      }
    };
  } else if (operation === 0x01) {
    // Mint: [deployTxid: 32 bytes][amount: u64]
    const deployTxid = buffer.slice(offset, offset + 32).toString('hex');
    offset += 32;
    const amount = buffer.readBigUInt64LE(offset);
    
    console.log(`  ✅ ZRC-20 Mint: ${amount} tokens`);
    
    return {
      protocol: 'zinc',
      subProtocol: 'zrc-20',
      operation: 'mint',
      data: {
        p: 'zrc-20',
        op: 'mint',
        deployTxid,
        amt: amount.toString()
      }
    };
  } else if (operation === 0x02) {
    // Transfer: [deployTxid: 32 bytes][amount: u64][toLength: u8][to: bytes]
    const deployTxid = buffer.slice(offset, offset + 32).toString('hex');
    offset += 32;
    const amount = buffer.readBigUInt64LE(offset);
    offset += 8;
    const toLength = buffer[offset++];
    const to = buffer.slice(offset, offset + toLength).toString('utf8');
    
    console.log(`  ✅ ZRC-20 Transfer: ${amount} to ${to}`);
    
    return {
      protocol: 'zinc',
      subProtocol: 'zrc-20',
      operation: 'transfer',
      data: {
        p: 'zrc-20',
        op: 'transfer',
        deployTxid,
        amt: amount.toString(),
        to
      }
    };
  }
  
  return null;
}

// Parse Zinc Core inscription (protocol ID 0x0)
function parseZincCoreInscription(buffer, operation) {
  let offset = 2; // Skip magic byte and proto/op byte
  
  // Operation types: 0x00 = deploy collection, 0x01 = mint NFT
  if (operation === 0x00) {
    // Deploy Collection: [nameLength: u8][name: bytes][metadataLength: u16][metadata: bytes]
    const nameLength = buffer[offset++];
    const name = buffer.slice(offset, offset + nameLength).toString('utf8');
    offset += nameLength;
    
    const metadataLength = buffer.readUInt16LE(offset);
    offset += 2;
    const metadata = metadataLength > 0 ? buffer.slice(offset, offset + metadataLength).toString('utf8') : null;
    
    console.log(`  ✅ Zinc Core Deploy: ${name}`);
    
    return {
      protocol: 'zinc',
      subProtocol: 'zinc-core',
      operation: 'deploy',
      data: {
        p: 'zinc-core',
        op: 'deploy',
        collection: name,
        metadata
      }
    };
  } else if (operation === 0x01) {
    // Mint NFT: [collectionTxid: 32 bytes][protocol: u8][dataLength: u8][data: bytes][mimeLength: u8][mime: bytes]
    const collectionTxid = buffer.slice(offset, offset + 32).toString('hex');
    offset += 32;
    
    const contentProtocol = buffer[offset++];
    const dataLength = buffer[offset++];
    const contentData = buffer.slice(offset, offset + dataLength).toString('utf8');
    offset += dataLength;
    
    const mimeLength = buffer[offset++];
    const mimeType = buffer.slice(offset, offset + mimeLength).toString('utf8');
    
    console.log(`  ✅ Zinc Core Mint NFT: ${mimeType}`);
    
    return {
      protocol: 'zinc',
      subProtocol: 'zinc-core',
      operation: 'mint',
      data: {
        p: 'zinc-core',
        op: 'mint',
        collectionTxid,
        contentProtocol,
        contentData,
        mimeType
      }
    };
  }
  
  return null;
}

// Parse Marketplace inscription (protocol ID 0x02)
function parseMarketplaceInscription(buffer, operation) {
  // Marketplace operations: listing, bid, accept, cancel
  // Implementation depends on marketplace spec
  console.log(`  📋 Marketplace operation: ${operation}`);
  return null; // Not implemented yet
}

// Parse Zerdinals inscription from ScriptSig (inputs)
// Real format: 036f726451106170706c69636174696f6e2f6a736f6e00[length][data]
// Breaking down: 036f7264 = prefix+"ord", 51=push, 10=16 bytes, 6170...=content type, 00=separator, 42=length, 7b...=data
function parseZerdinalsInscription(scriptSigHex) {
  try {
    if (!scriptSigHex || scriptSigHex.length < 20) return null;
    
    // Look for "ord" marker (6f7264 in hex)
    const ordMarker = '6f7264';
    const ordIndex = scriptSigHex.indexOf(ordMarker);
    if (ordIndex === -1) return null;
    
    console.log(`  📋 Parsing ord inscription, index: ${ordIndex}`);
    
    // Extract everything after "ord"
    let afterOrd = scriptSigHex.substring(ordIndex + ordMarker.length);
    let offset = 0;
    
    // Skip push opcode (51, 4c, 4d, etc.)
    offset = 2;
    
    // Read content type length (1 byte)
    const contentTypeLengthHex = afterOrd.substring(offset, offset + 2);
    const contentTypeLength = parseInt(contentTypeLengthHex, 16);
    offset += 2;
    
    console.log(`  📋 Content type length: ${contentTypeLength}`);
    
    // Read content type
    const contentTypeHex = afterOrd.substring(offset, offset + (contentTypeLength * 2));
    const contentType = Buffer.from(contentTypeHex, 'hex').toString('utf8');
    offset += (contentTypeLength * 2);
    
    console.log(`  📋 Content type: ${contentType}`);
    
    // Skip separator byte (00)
    offset += 2;
    
    // Read data length (1 byte)
    const dataLengthHex = afterOrd.substring(offset, offset + 2);
    const dataLength = parseInt(dataLengthHex, 16);
    offset += 2;
    
    console.log(`  📋 Data length: ${dataLength}`);
    
    // Read the actual data
    const dataHex = afterOrd.substring(offset, offset + (dataLength * 2));
    const dataText = Buffer.from(dataHex, 'hex').toString('utf8');
    
    console.log(`  📋 Data: ${dataText.substring(0, 100)}...`);
    
    // Parse JSON data if content type is JSON
    if (contentType.includes('json')) {
      try {
        const parsedData = JSON.parse(dataText);
        console.log(`  ✅ Parsed JSON data:`, parsedData);
        
        return {
          protocol: 'zerdinals',
          subProtocol: parsedData.p || 'unknown',
          operation: parsedData.op || 'inscribe',
          contentType: contentType,
          contentData: dataText,
          data: parsedData
        };
      } catch (e) {
        console.log(`  ⚠️ Could not parse JSON: ${e.message}`);
        return {
          protocol: 'zerdinals',
          subProtocol: 'text',
          operation: 'inscribe',
          contentType: contentType,
          contentData: dataText,
          data: { raw: dataText }
        };
      }
    } else {
      // Binary data (image, video, etc.)
      console.log(`  📷 Binary content type: ${contentType}`);
      return {
        protocol: 'zerdinals',
        subProtocol: 'nft',
        operation: 'inscribe',
        contentType: contentType,
        contentData: dataHex.substring(0, 400), // Preview
        data: {
          type: contentType,
          size: dataLength
        }
      };
    }
  } catch (error) {
    console.error('Zerdinals parse error:', error.message);
    return null;
  }
}

// Process transaction for inscriptions (both Zinc and Zerdinals)
async function processTransaction(txid, blockHeight, txData = null) {
  try {
    let tx = txData;
    
    // Only fetch if not provided in batch
    if (!tx) {
      const url = `https://api.blockchair.com/zcash/dashboards/transaction/${txid}?key=${BLOCKCHAIR_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      tx = data.data[txid];
      
      // Debug: Log what we got
      if (tx) {
        console.log(`  ✅ Fetched tx ${txid.substring(0,8)}, has ${tx.outputs?.length || 0} outputs, ${tx.inputs?.length || 0} inputs`);
      } else {
        console.log(`  ❌ Failed to fetch tx data for ${txid.substring(0,8)}`);
      }
    }
    
    if (!tx) return;
    
    let foundInscription = false;
    
    // 1. Check outputs for Zinc Protocol (OP_RETURN)
    // Debug: Check what the output structure actually looks like
    if (tx.outputs && tx.outputs.length > 0) {
      const firstOutput = tx.outputs[0];
      console.log(`  📋 Output structure sample:`, Object.keys(firstOutput).join(', '));
    }
    
    for (const output of tx.outputs || []) {
      // Debug: Log what we're checking
      console.log(`  🔎 Checking output: type=${output.type}, script_hex=${output.script_hex?.substring(0, 10)}...`);
      
      if (!output.script_hex) {
        // Check if it's named differently
        if (output.scripthex || output.scriptHex || output.script) {
          console.log(`  ⚠️ Found script field but not 'script_hex':`, Object.keys(output).filter(k => k.toLowerCase().includes('script')));
        }
        continue;
      }
      
      // Debug: Log ALL OP_RETURN outputs
      if (output.script_hex.startsWith('6a')) {
        console.log(`  🔍 Found OP_RETURN in ${txid}:`, output.script_hex.substring(0, 20) + '...');
      } else {
        console.log(`  ⏭️  Skipping non-OP_RETURN output (starts with ${output.script_hex.substring(0, 4)})`);
      }
      
      const inscription = parseZincInscription(output.script_hex);
      if (!inscription) continue;
      
      foundInscription = true;
      console.log(`📝 Found Zinc inscription in ${txid}`);
      
      // Save to database
      const { error: zincError } = await supabase.from('inscriptions').upsert({
        txid: txid,
        block_height: blockHeight,
        timestamp: tx.transaction.time,
        protocol: 'zinc',
        operation: inscription.operation,
        data: inscription.data,
        sender_address: tx.inputs[0]?.recipient || null,
        network: NETWORK
      });
      
      if (zincError) {
        console.error('❌ Failed to save Zinc inscription:', zincError);
      }
      
      // Process based on operation type
      if (inscription.subProtocol === 'zrc-20') {
        await processZRC20Inscription(inscription, txid, tx);
      }
    }
    
    // 2. Check inputs for Zerdinals (ScriptSig)
    console.log(`  🔍 Checking ${tx.inputs?.length || 0} inputs for Zerdinals...`);
    
    for (const input of tx.inputs || []) {
      // Zerdinals inscriptions are in spending_signature_hex, not script_hex!
      const scriptSigHex = input.spending_signature_hex;
      
      console.log(`  🔎 Input has spending_signature_hex: ${!!scriptSigHex}, length: ${scriptSigHex?.length || 0}`);
      
      if (!scriptSigHex) continue;
      
      // Debug: Check if script contains "ord" marker
      if (scriptSigHex.includes('6f7264')) {
        console.log(`🔍 Found "ord" marker in tx ${txid}, script length: ${scriptSigHex.length}`);
      }
      
      const inscription = parseZerdinalsInscription(scriptSigHex);
      if (!inscription) continue;
      
      foundInscription = true;
      console.log(`📝 Found Zerdinals inscription in ${txid} (${inscription.contentType})`);
      
      // Save to database with full content
      await supabase.from('inscriptions').upsert({
        txid: txid,
        block_height: blockHeight,
        timestamp: tx.transaction.time,
        protocol: 'zerdinals',
        operation: inscription.operation,
        content_type: inscription.contentType,
        content_data: inscription.contentData, // Store full content!
        content_size: inscription.data.size,
        data: inscription.data,
        sender_address: input.recipient || null,
        network: NETWORK
      });
      
      // Process Zerdinals inscriptions
      // (Different from Zinc - may need separate handler)
      if (inscription.subProtocol === 'brc-20' || inscription.subProtocol === 'zrc-20') {
        await processZRC20Inscription(inscription, txid, tx);
      }
    }
    
    if (foundInscription) {
      console.log(`  ✅ Processed inscription in tx ${txid.substring(0, 10)}...`);
    }
  } catch (error) {
    console.error(`❌ Error processing tx ${txid}:`, error.message);
  }
}

// Process ZRC-20 inscriptions (both Zinc binary and Zerdinals JSON)
async function processZRC20Inscription(inscription, txid, tx) {
  const { op, tick, amt, deployTxid } = inscription.data;
  const address = tx.inputs[0]?.recipient;
  
  // For Zinc protocol, we need to look up the ticker from deployTxid
  let tokenTicker = tick;
  if (!tokenTicker && deployTxid) {
    // Query inscriptions table to get the token ticker
    const { data: deployInscription } = await supabase
      .from('inscriptions')
      .select('data')
      .eq('txid', deployTxid)
      .single();
    
    if (deployInscription?.data?.tick) {
      tokenTicker = deployInscription.data.tick;
    }
  }
  
  if (!address) return;
  
  if (op === 'deploy') {
    console.log(`  💎 ZRC-20 Deploy: ${tokenTicker || tick}`);
  } else if (op === 'mint') {
    if (!tokenTicker) {
      console.log(`  ⚠️ Cannot process mint: ticker not found`);
      return;
    }
    
    const amount = BigInt(amt || 0);
    console.log(`  ✨ ZRC-20 Mint: ${amount} ${tokenTicker} to ${address}`);
    
    // Update balance
    const { data: existing } = await supabase
      .from('zrc20_balances')
      .select('balance')
      .eq('address', address)
      .eq('tick', tokenTicker)
      .single();
    
    const currentBalance = BigInt(existing?.balance || 0);
    const newBalance = (currentBalance + amount).toString();
    
    await supabase.from('zrc20_balances').upsert({
      address: address,
      tick: tokenTicker,
      balance: newBalance
    });
  } else if (op === 'transfer') {
    if (!tokenTicker) {
      console.log(`  ⚠️ Cannot process transfer: ticker not found`);
      return;
    }
    
    const amount = BigInt(amt || 0);
    const recipient = inscription.data.to || tx.outputs[0]?.recipient;
    
    console.log(`  💸 ZRC-20 Transfer: ${amount} ${tokenTicker} from ${address} to ${recipient}`);
    
    if (recipient) {
      // Deduct from sender
      const { data: senderBalance } = await supabase
        .from('zrc20_balances')
        .select('balance')
        .eq('address', address)
        .eq('tick', tokenTicker)
        .single();
      
      const senderCurrent = BigInt(senderBalance?.balance || 0);
      const senderNew = (senderCurrent - amount).toString();
      
      await supabase.from('zrc20_balances').upsert({
        address: address,
        tick: tokenTicker,
        balance: senderNew
      });
      
      // Add to recipient
      const { data: recipientBalance } = await supabase
        .from('zrc20_balances')
        .select('balance')
        .eq('address', recipient)
        .eq('tick', tokenTicker)
        .single();
      
      const recipientCurrent = BigInt(recipientBalance?.balance || 0);
      const recipientNew = (recipientCurrent + amount).toString();
      
      await supabase.from('zrc20_balances').upsert({
        address: recipient,
        tick: tokenTicker,
        balance: recipientNew
      });
    }
  }
}

// Main scanning loop
async function scanBlocks() {
  try {
    const currentBlock = await getCurrentBlockHeight();
    if (!currentBlock) {
      console.log('⏭️  Skipping scan - could not get current block');
      return;
    }
    
    let lastScanned = await getLastScannedBlock();
    
    console.log(`\n🔍 Scanning blocks ${lastScanned + 1} to ${currentBlock}`);
    
    let processedCount = 0;
    
    // Scan blocks sequentially with smart rate limiting
    const totalBlocks = currentBlock - lastScanned;
    let apiCallsUsed = 0;
    
    for (let block = lastScanned + 1; block <= currentBlock; block++) {
      const txids = await fetchBlockTransactions(block);
      apiCallsUsed++; // Block fetch
      
      if (txids.length > 0) {
        console.log(`📦 Block ${block}: ${txids.length} transactions (${apiCallsUsed} API calls used)`);
        
        // Process each transaction individually (REQUIRED for inscription data)
        for (const txid of txids) {
          try {
            await processTransaction(txid, block);
            apiCallsUsed++; // Transaction fetch
          } catch (error) {
            console.error(`❌ Error processing tx ${txid}:`, error.message);
          }
          
          // Rate limiting: 200ms between transactions (max ~5 tx/sec)
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        processedCount++;
      }
      
      // Update progress after each block
      await updateLastScannedBlock(block);
      
      // Longer pause every 10 blocks to avoid hitting rate limits
      if (processedCount % 10 === 0) {
        console.log(`⏸️  Processed ${processedCount}/${totalBlocks} blocks, ${apiCallsUsed} API calls used. Cooling down...`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second cooldown
      }
    }
    
    console.log(`✅ Scan complete. Processed ${processedCount} blocks`);
    
  } catch (error) {
    console.error('❌ Scan error:', error);
  }
}

// Start indexer
console.log('\n⏳ Starting initial scan...\n');
await scanBlocks();

console.log(`\n✅ Initial scan complete. Now monitoring every ${SCAN_INTERVAL / 1000}s...\n`);

// Continuous scanning
setInterval(async () => {
  await scanBlocks();
}, SCAN_INTERVAL);
