/**
 * Transaction Builder
 * Builds Zcash transparent transactions with inscription support
 * Supports both Zinc (OP_RETURN) and Zerdinals (ScriptSig) protocols
 */

const DEFAULT_FEE_RATE = 1000; // zatoshis per 1000 bytes
const MIN_FEE = 1000; // minimum 1000 zatoshis
const DUST_THRESHOLD = 546; // minimum output amount

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
  
  // Estimate transaction size
  const estimatedSize = estimateTransactionSize(1, inscription); // Start with 1 input
  const estimatedFee = Math.max(MIN_FEE, Math.ceil(estimatedSize * DEFAULT_FEE_RATE / 1000));
  
  const requiredAmount = treasuryAmount + transferAmount + mintPayment + estimatedFee;
  
  // Select UTXOs
  const selected = [];
  let totalInput = 0;
  
  for (const utxo of sorted) {
    selected.push(utxo);
    totalInput += utxo.value;
    
    // Recalculate fee with actual input count
    const actualSize = estimateTransactionSize(selected.length, inscription);
    const actualFee = Math.max(MIN_FEE, Math.ceil(actualSize * DEFAULT_FEE_RATE / 1000));
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
 */
async function buildZincTransaction(params) {
  const {
    utxos,
    fromAddress,
    toAddress,
    inscription,
    fee,
    change,
    privateKey,
    network
  } = params;
  
  console.log('[TransactionBuilder] Building Zinc transaction');
  
  // Create transaction using zcash-transaction.js
  const tx = await self.ZcashTransaction.createTransaction({
    inputs: utxos.map(utxo => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
      address: fromAddress
    })),
    outputs: []
  });
  
  // Add OP_RETURN output (inscription data)
  tx.addOpReturnOutput(inscription.opReturn);
  
  // Add treasury output
  if (inscription.treasuryAmount > 0) {
    tx.addOutput(inscription.treasuryAddress, inscription.treasuryAmount);
  }
  
  // Add mint payment output (to deployer)
  if (inscription.mintPrice && inscription.mintRecipient) {
    const mintPaymentZatoshis = Math.floor(inscription.mintPrice * 100000000);
    tx.addOutput(inscription.mintRecipient, mintPaymentZatoshis);
    console.log('[TransactionBuilder] Adding mint payment:', {
      recipient: inscription.mintRecipient,
      amount: inscription.mintPrice,
      zatoshis: mintPaymentZatoshis
    });
  }
  
  // Add transfer output (for ZRC-20 transfers)
  if (toAddress && inscription.transferAmount > 0) {
    tx.addOutput(toAddress, inscription.transferAmount);
  }
  
  // Add change output
  if (change > DUST_THRESHOLD) {
    tx.addOutput(fromAddress, change);
  }
  
  // Sign transaction
  await tx.sign(privateKey);
  
  const txHex = tx.serialize();
  const txid = tx.getTxid();
  
  console.log('[TransactionBuilder] Zinc transaction built:', {
    txid,
    size: txHex.length / 2,
    fee
  });
  
  return {
    txHex,
    txid,
    protocol: 'zinc'
  };
}

/**
 * Build Zerdinals protocol transaction (ScriptSig)
 */
async function buildZerdinalsTransaction(params) {
  const {
    utxos,
    fromAddress,
    inscription,
    fee,
    change,
    privateKey,
    network
  } = params;
  
  console.log('[TransactionBuilder] Building Zerdinals transaction');
  
  // For Zerdinals, we need to embed the envelope in the first input's scriptSig
  // This requires custom script construction
  
  // Create transaction with custom scriptSig for first input
  const tx = await self.ZcashTransaction.createTransaction({
    inputs: utxos.map((utxo, index) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
      address: fromAddress,
      customScript: index === 0 ? inscription.envelope : null // First input gets envelope
    })),
    outputs: []
  });
  
  // Add dummy output (required for Zerdinals, typically to sender)
  tx.addOutput(fromAddress, DUST_THRESHOLD);
  
  // Add change output
  if (change > DUST_THRESHOLD) {
    tx.addOutput(fromAddress, change);
  }
  
  // Sign transaction (with envelope in first input)
  await tx.signWithEnvelope(privateKey, inscription.envelope);
  
  const txHex = tx.serialize();
  const txid = tx.getTxid();
  
  console.log('[TransactionBuilder] Zerdinals transaction built:', {
    txid,
    size: txHex.length / 2,
    envelopeSize: inscription.envelope.length,
    fee
  });
  
  return {
    txHex,
    txid,
    protocol: 'zerdinals'
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
