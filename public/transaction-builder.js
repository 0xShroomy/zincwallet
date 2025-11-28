/**
 * Transaction Builder
 * Builds Zcash transparent transactions with inscription support
 * Supports both Zinc (OP_RETURN) and Zerdinals (ScriptSig) protocols
 */

const DUST_THRESHOLD = 546; // minimum output amount

/**
 * Calculate transaction ID from hex (double SHA256, reversed)
 */
async function calculateTxid(txHex) {
  // Convert hex to bytes
  const txBytes = new Uint8Array(txHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  
  // Double SHA256
  const hash1 = await crypto.subtle.digest('SHA-256', txBytes);
  const hash2 = await crypto.subtle.digest('SHA-256', hash1);
  
  // Reverse bytes for txid
  const txidBytes = new Uint8Array(hash2).reverse();
  
  // Convert to hex
  return Array.from(txidBytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Build a Zcash transaction with inscription
 */
async function buildInscriptionTransaction(params) {
  const {
    utxos,           // Array of available UTXOs
    fromAddress,     // Sender address
    toAddress,       // Receiver address (for transfers)
    inscription,     // Inscription data from InscriptionBuilder
    privateKey,      // For signing
    network = 'mainnet'
  } = params;
  
  console.log('[TransactionBuilder] Building transaction:', {
    protocol: inscription.protocol,
    utxoCount: utxos.length,
    fromAddress,
    toAddress: toAddress || 'N/A'
  });
  
  // Select UTXOs
  const selected = selectUtxos(utxos, inscription);
  if (!selected) {
    throw new Error('Insufficient funds');
  }
  
  console.log('[TransactionBuilder] Selected UTXOs:', {
    count: selected.utxos.length,
    totalInput: selected.totalInput,
    fee: selected.fee,
    change: selected.change
  });
  
  // Build transaction based on protocol
  let transaction;
  if (inscription.protocol === 'zinc') {
    transaction = await buildZincTransaction({
      utxos: selected.utxos,
      fromAddress,
      toAddress,
      inscription,
      fee: selected.fee,
      change: selected.change,
      privateKey,
      network
    });
  } else if (inscription.protocol === 'zerdinals') {
    transaction = await buildZerdinalsTransaction({
      utxos: selected.utxos,
      fromAddress,
      inscription,
      fee: selected.fee,
      change: selected.change,
      privateKey,
      network
    });
  } else {
    throw new Error(`Unknown protocol: ${inscription.protocol}`);
  }
  
  return transaction;
}

/**
 * Calculate ZIP-317 fee (same as ZcashTransaction uses)
 * Fee = marginal_fee × max(grace_actions, logical_actions)
 */
function calculateZip317Fee(inputCount, outputCount) {
  const marginalFee = 5000; // zatoshis per action
  const graceActions = 2;
  const logicalActions = Math.max(inputCount, outputCount);
  return marginalFee * Math.max(graceActions, logicalActions);
}

/**
 * Select UTXOs for transaction
 * Returns: { utxos: [...], totalInput, fee, change }
 */
function selectUtxos(availableUtxos, inscription) {
  // Sort UTXOs by value (largest first for efficiency)
  const sorted = [...availableUtxos].sort((a, b) => b.value - a.value);
  
  // Calculate required amounts
  const treasuryAmount = inscription.treasuryAmount || 0;
  const transferAmount = inscription.transferAmount || 0;
  const mintPayment = inscription.mintPrice ? Math.floor(inscription.mintPrice * 100000000) : 0; // Convert ZEC to zatoshis
  
  // Count outputs: OP_RETURN + treasury + mint payment + transfer + change
  let outputCount = 1; // At least OP_RETURN
  if (treasuryAmount > 0) outputCount++;
  if (mintPayment > 0) outputCount++;
  if (transferAmount > 0) outputCount++;
  outputCount++; // Change output
  
  // Initial fee estimate with 1 input
  const estimatedFee = calculateZip317Fee(1, outputCount);
  const requiredAmount = treasuryAmount + transferAmount + mintPayment + estimatedFee;
  
  // Select UTXOs
  const selected = [];
  let totalInput = 0;
  
  for (const utxo of sorted) {
    selected.push(utxo);
    totalInput += utxo.value;
    
    // Recalculate fee with actual input count (ZIP-317)
    const actualFee = calculateZip317Fee(selected.length, outputCount);
    const actualRequired = treasuryAmount + transferAmount + mintPayment + actualFee;
    
    // Check if we have enough
    if (totalInput >= actualRequired) {
      const change = totalInput - actualRequired;
      
      // Make sure change is above dust or zero
      if (change === 0 || change >= DUST_THRESHOLD) {
        return {
          utxos: selected,
          totalInput,
          fee: actualFee,
          change
        };
      }
    }
  }
  
  // Not enough funds
  console.error('[TransactionBuilder] Insufficient funds:', {
    available: totalInput,
    required: requiredAmount
  });
  
  return null;
}

/**
 * Estimate transaction size in bytes
 */
function estimateTransactionSize(inputCount, inscription) {
  // Base transaction overhead
  let size = 10; // version + locktime + etc
  
  // Inputs: each input is ~148 bytes (txid + vout + scriptSig + sequence)
  size += inputCount * 148;
  
  // Outputs
  let outputCount = 0;
  
  // OP_RETURN output (Zinc) or dummy output (Zerdinals)
  if (inscription.protocol === 'zinc') {
    size += 9 + inscription.opReturn.length; // OP_RETURN output
    outputCount++;
  } else {
    size += 34; // Dummy output for Zerdinals
    outputCount++;
  }
  
  // Treasury output (Zinc only)
  if (inscription.treasuryAmount > 0) {
    size += 34; // P2PKH output
    outputCount++;
  }
  
  // Mint payment output
  if (inscription.mintPrice && inscription.mintRecipient) {
    size += 34; // P2PKH output
    outputCount++;
  }
  
  // Transfer output (for ZRC-20 transfers)
  if (inscription.transferAmount > 0) {
    size += 34; // P2PKH output
    outputCount++;
  }
  
  // Change output
  size += 34; // P2PKH output
  outputCount++;
  
  // Output count varint
  size += 1;
  
  return size;
}

/**
 * Build Zinc protocol transaction (OP_RETURN)
 * Uses the same ZcashTransaction API as handleSendZec
 */
async function buildZincTransaction(params) {
  const {
    utxos,
    fromAddress,
    toAddress,
    inscription,
    fee,
    _change, // Unused - ZcashTransaction calculates change internally
    privateKey,
    network
  } = params;
  
  console.log('[TransactionBuilder] Building Zinc transaction');
  
  // Build outputs array - same format as handleSendZec uses
  const outputs = [];
  let outputCount = 0;
  
  // 1. OP_RETURN output (inscription data) - must be first for Zinc
  if (inscription.opReturn) {
    outputs.push({ opReturn: inscription.opReturn });
    outputCount++;
  }
  
  // 2. Treasury output (for deploy/mint operations)
  if (inscription.treasuryAmount > 0 && inscription.treasuryAddress) {
    outputs.push({ 
      address: inscription.treasuryAddress, 
      amount: inscription.treasuryAmount / 100000000 // Convert zatoshis to ZEC
    });
    outputCount++;
  }
  
  // 3. Mint payment output (payment to deployer for minting)
  if (inscription.mintPrice && inscription.mintRecipient) {
    outputs.push({ 
      address: inscription.mintRecipient, 
      amount: inscription.mintPrice // Already in ZEC
    });
    console.log('[TransactionBuilder] Adding mint payment:', {
      recipient: inscription.mintRecipient,
      amount: inscription.mintPrice
    });
    outputCount++;
  }
  
  // 4. Transfer output (for ZRC-20/NFT transfers - dust amount to recipient)
  if (toAddress && inscription.transferAmount > 0) {
    outputs.push({ 
      address: toAddress, 
      amount: inscription.transferAmount / 100000000 // Convert zatoshis to ZEC
    });
    outputCount++;
  }
  
  // Build transaction using ZcashTransaction API (same as handleSendZec)
  const tx = await self.ZcashTransaction.buildTransaction({
    utxos: utxos,
    outputs: outputs,
    changeAddress: fromAddress,
    feeRate: 1 // ZIP-317 fee is calculated internally
  });
  
  // Sign transaction
  const signedTx = await self.ZcashTransaction.signTransaction(tx, privateKey, utxos);
  
  // Serialize transaction
  const txHex = self.ZcashTransaction.serializeTransaction(signedTx);
  
  // Calculate txid (double SHA256 of serialized tx, reversed)
  const txid = await calculateTxid(txHex);
  
  // Determine change output position (it's always last if present)
  const hasChange = tx.outputs.length > outputCount;
  const changeVout = hasChange ? tx.outputs.length - 1 : -1;
  const actualChangeValue = hasChange ? Number(tx.outputs[tx.outputs.length - 1].value) : 0;
  
  console.log('[TransactionBuilder] Zinc transaction built:', {
    txid,
    size: txHex.length / 2,
    fee,
    outputCount: tx.outputs.length,
    hasChange,
    changeValue: actualChangeValue
  });
  
  return {
    txHex,
    txid,
    protocol: 'zinc',
    // For pending UTXO tracking
    selectedUtxos: utxos,
    changeValue: actualChangeValue,
    changeVout: changeVout
  };
}

/**
 * Build Zerdinals protocol transaction (ScriptSig envelope)
 * Embeds inscription data in first input's scriptSig
 */
async function buildZerdinalsTransaction(params) {
  const {
    utxos,
    fromAddress,
    inscription,
    fee,
    _change, // Unused - ZcashTransaction calculates change internally
    privateKey,
    network
  } = params;
  
  console.log('[TransactionBuilder] Building Zerdinals transaction');
  console.log('[TransactionBuilder] Envelope size:', inscription.envelope?.length || 0);
  
  // Build outputs array
  const outputs = [];
  let outputCount = 0;
  
  // 1. Dust output to sender (required for Zerdinals)
  outputs.push({ 
    address: fromAddress, 
    amount: DUST_THRESHOLD / 100000000 
  });
  outputCount++;
  
  // 2. Treasury output (Zerdinals also has treasury tip)
  if (inscription.treasuryAmount > 0 && inscription.treasuryAddress) {
    outputs.push({ 
      address: inscription.treasuryAddress, 
      amount: inscription.treasuryAmount / 100000000
    });
    outputCount++;
  }
  
  // Build transaction using ZcashTransaction API
  const tx = await self.ZcashTransaction.buildTransaction({
    utxos: utxos,
    outputs: outputs,
    changeAddress: fromAddress,
    feeRate: 1
  });
  
  // Sign transaction WITH Zerdinals envelope in first input
  const signedTx = await self.ZcashTransaction.signTransaction(tx, privateKey, utxos, {
    envelope: inscription.envelope // This prepends envelope to first input's scriptSig
  });
  
  // Serialize transaction
  const txHex = self.ZcashTransaction.serializeTransaction(signedTx);
  
  // Calculate txid
  const txid = await calculateTxid(txHex);
  
  // Determine change output position (after dust + treasury)
  const hasChange = tx.outputs.length > outputCount;
  const changeVout = hasChange ? tx.outputs.length - 1 : -1;
  const actualChangeValue = hasChange ? Number(tx.outputs[tx.outputs.length - 1].value) : 0;
  
  console.log('[TransactionBuilder] Zerdinals transaction built:', {
    txid,
    size: txHex.length / 2,
    fee,
    outputCount: tx.outputs.length,
    hasChange,
    changeValue: actualChangeValue,
    envelopeSize: inscription.envelope?.length || 0
  });
  
  return {
    txHex,
    txid,
    protocol: 'zerdinals',
    // For pending UTXO tracking
    selectedUtxos: utxos,
    changeValue: actualChangeValue,
    changeVout: changeVout
  };
}

/**
 * Broadcast transaction to network
 */
async function broadcastTransaction(txHex, network = 'mainnet') {
  console.log('[TransactionBuilder] Broadcasting transaction:', {
    network,
    size: txHex.length / 2
  });
  
  try {
    // Use Vercel proxy to broadcast
    const response = await fetch('https://vercel-proxy-loghorizon.vercel.app/api/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        txHex,
        network
      })
    });
    
    if (!response.ok) {
      throw new Error(`Broadcast failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Broadcast failed');
    }
    
    console.log('[TransactionBuilder] Transaction broadcast successful:', data.txid);
    
    return {
      success: true,
      txid: data.txid
    };
  } catch (error) {
    console.error('[TransactionBuilder] Broadcast error:', error);
    throw error;
  }
}

// Export functions
if (typeof self !== 'undefined') {
  self.TransactionBuilder = {
    buildInscriptionTransaction,
    broadcastTransaction,
    selectUtxos,
    estimateTransactionSize
  };
}

console.log('[TransactionBuilder] Module loaded');
