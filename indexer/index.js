import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Configuration
const BLOCKCHAIR_API_KEY = process.env.BLOCKCHAIR_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SCAN_INTERVAL = parseInt(process.env.SCAN_INTERVAL_SECONDS || '300') * 1000;
const START_BLOCK = parseInt(process.env.START_BLOCK || '3139000');
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
  await supabase
    .from('indexer_state')
    .upsert({ 
      id: 1, 
      last_scanned_block: blockHeight,
      last_scan_time: new Date().toISOString()
    });
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
function parseZincInscription(opReturnHex) {
  try {
    // OP_RETURN format: 6a (OP_RETURN) + length + data
    if (!opReturnHex.startsWith('6a')) return null;
    
    // Skip OP_RETURN byte and length byte
    const dataHex = opReturnHex.substring(4);
    
    // Convert hex to UTF-8
    const buffer = Buffer.from(dataHex, 'hex');
    const text = buffer.toString('utf8');
    
    // Check if it's a Zinc Protocol inscription
    if (!text.startsWith('zinc:')) return null;
    
    // Parse inscription data
    const parts = text.split(' ');
    const inscriptionData = {};
    
    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key && value) {
        inscriptionData[key] = value;
      }
    }
    
    return {
      protocol: 'zinc',
      subProtocol: inscriptionData.p,
      operation: inscriptionData.op,
      data: inscriptionData
    };
  } catch (error) {
    return null;
  }
}

// Parse Zerdinals inscription from ScriptSig (inputs)
// Real format from transaction e40e0049cfa37f45c55f17596c59fce756a29d09bf899723b10e4090b958d2f5:
// 036f7264 5309 696d6167652f706e67 524c [PNG_DATA]
function parseZerdinalsInscription(scriptSigHex) {
  try {
    if (!scriptSigHex || scriptSigHex.length < 20) return null;
    
    // Look for "ord" marker (6f7264 in hex)
    const ordMarker = '6f7264';
    const ordIndex = scriptSigHex.indexOf(ordMarker);
    if (ordIndex === -1) return null;
    
    // Extract everything after "ord"
    const afterOrd = scriptSigHex.substring(ordIndex + ordMarker.length);
    
    // Next bytes indicate content type length
    // Format: [length_byte][content_type][length_indicator][data]
    // Example: 5309696d6167652f706e67 = 53(push) 09(9 bytes) "image/png"
    
    let offset = 0;
    
    // Skip push opcode (53, 4c, 4d, 4e, etc.)
    if (afterOrd.length > 2) {
      offset = 2;
    }
    
    // Read content type length
    const contentTypeLength = parseInt(afterOrd.substring(offset, offset + 2), 16);
    offset += 2;
    
    // Read content type
    const contentTypeHex = afterOrd.substring(offset, offset + (contentTypeLength * 2));
    const contentType = Buffer.from(contentTypeHex, 'hex').toString('utf8');
    offset += (contentTypeLength * 2);
    
    // Skip data length indicator bytes (524c or similar)
    offset += 4;
    
    // Everything after is the actual inscription data
    const dataHex = afterOrd.substring(offset);
    
    // Remove signature data (starts with 48 or similar - typically after the inscription)
    // Find where inscription ends (look for signature start - usually 3044 or 3045)
    const sigStart = dataHex.search(/3044|3045/);
    const inscriptionDataHex = sigStart > 0 ? dataHex.substring(0, sigStart) : dataHex;
    
    // Try to parse based on content type
    if (contentType.includes('json') || contentType.includes('text')) {
      try {
        const buffer = Buffer.from(inscriptionDataHex, 'hex');
        const text = buffer.toString('utf8');
        const data = JSON.parse(text);
        
        return {
          protocol: 'zerdinals',
          subProtocol: data.p || 'unknown',
          operation: data.op || 'inscribe',
          contentType: contentType,
          data: data
        };
      } catch (jsonError) {
        // Not valid JSON
        return {
          protocol: 'zerdinals',
          subProtocol: 'text',
          operation: 'inscribe',
          contentType: contentType,
          data: { raw: inscriptionDataHex.substring(0, 100) } // Preview only
        };
      }
    } else {
      // Binary data (image, video, etc.)
      return {
        protocol: 'zerdinals',
        subProtocol: 'nft',
        operation: 'inscribe',
        contentType: contentType,
        contentData: inscriptionDataHex, // Full content for storage
        data: {
          type: contentType,
          size: inscriptionDataHex.length / 2 // bytes
        }
      };
    }
  } catch (error) {
    console.error('Zerdinals parse error:', error.message);
    return null;
  }
}

// Process transaction for inscriptions (both Zinc and Zerdinals)
async function processTransaction(txid, blockHeight) {
  try {
    // Fetch transaction details
    const url = `https://api.blockchair.com/zcash/dashboards/transaction/${txid}?key=${BLOCKCHAIR_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    
    const tx = data.data[txid];
    if (!tx) return;
    
    let foundInscription = false;
    
    // 1. Check outputs for Zinc Protocol (OP_RETURN)
    for (const output of tx.outputs || []) {
      if (!output.script_hex || !output.script_hex.startsWith('6a')) continue;
      
      const inscription = parseZincInscription(output.script_hex);
      if (!inscription) continue;
      
      foundInscription = true;
      console.log(`📝 Found Zinc inscription in ${txid}`);
      
      // Save to database
      await supabase.from('inscriptions').upsert({
        txid: txid,
        block_height: blockHeight,
        timestamp: tx.transaction.time,
        protocol: 'zinc',
        operation: inscription.operation,
        data: inscription.data,
        sender_address: tx.inputs[0]?.recipient || null
      });
      
      // Process based on operation type
      if (inscription.subProtocol === 'zrc-20') {
        await processZRC20Inscription(inscription, txid, tx);
      }
    }
    
    // 2. Check inputs for Zerdinals (ScriptSig)
    for (const input of tx.inputs || []) {
      if (!input.script_hex) continue;
      
      const inscription = parseZerdinalsInscription(input.script_hex);
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
        sender_address: input.recipient || null
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

// Process ZRC-20 inscriptions
async function processZRC20Inscription(inscription, txid, tx) {
  const { op, tick, amt } = inscription.data;
  const address = tx.inputs[0]?.recipient;
  
  if (!address || !tick) return;
  
  if (op === 'deploy') {
    console.log(`  💎 ZRC-20 Deploy: ${tick}`);
  } else if (op === 'mint') {
    const amount = parseInt(amt || 0);
    console.log(`  ✨ ZRC-20 Mint: ${amount} ${tick} to ${address}`);
    
    // Update balance
    const { data: existing } = await supabase
      .from('zrc20_balances')
      .select('balance')
      .eq('address', address)
      .eq('tick', tick)
      .single();
    
    const newBalance = (existing?.balance || 0) + amount;
    
    await supabase.from('zrc20_balances').upsert({
      address: address,
      tick: tick,
      balance: newBalance
    });
  } else if (op === 'transfer') {
    const amount = parseInt(amt || 0);
    const recipient = tx.outputs[0]?.recipient;
    
    console.log(`  💸 ZRC-20 Transfer: ${amount} ${tick} from ${address} to ${recipient}`);
    
    if (recipient) {
      // Deduct from sender
      const { data: senderBalance } = await supabase
        .from('zrc20_balances')
        .select('balance')
        .eq('address', address)
        .eq('tick', tick)
        .single();
      
      await supabase.from('zrc20_balances').upsert({
        address: address,
        tick: tick,
        balance: (senderBalance?.balance || 0) - amount
      });
      
      // Add to recipient
      const { data: recipientBalance } = await supabase
        .from('zrc20_balances')
        .select('balance')
        .eq('address', recipient)
        .eq('tick', tick)
        .single();
      
      await supabase.from('zrc20_balances').upsert({
        address: recipient,
        tick: tick,
        balance: (recipientBalance?.balance || 0) + amount
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
    
    // Scan blocks in batches
    for (let block = lastScanned + 1; block <= currentBlock; block++) {
      const txids = await fetchBlockTransactions(block);
      
      if (txids.length > 0) {
        console.log(`📦 Block ${block}: ${txids.length} transactions`);
        
        for (const txid of txids) {
          await processTransaction(txid, block);
        }
        
        processedCount++;
      }
      
      // Update progress
      await updateLastScannedBlock(block);
      
      // Rate limiting - don't overwhelm Blockchair
      if (processedCount % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
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
