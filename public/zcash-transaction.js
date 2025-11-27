/**
 * Zcash Transaction Builder - Plain JavaScript
 * Builds and signs Zcash transparent transactions
 * No external dependencies - uses Web Crypto API
 */

'use strict';

self.ZcashTransaction = (function() {
  
  /**
   * Hash functions using Web Crypto API
   */
  async function sha256(data) {
    const hash = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hash);
  }
  
  async function hash256(data) {
    const hash1 = await sha256(data);
    const hash2 = await sha256(hash1);
    return hash2;
  }
  
  async function hash160(data) {
    // SHA-256 then RIPEMD-160 (we'll use a second SHA-256 as approximation since RIPEMD-160 isn't in Web Crypto)
    const hash1 = await sha256(data);
    // For production, use a proper RIPEMD-160 implementation
    // For now, we'll just use the hash160 from the address derivation
    return hash1.slice(0, 20);
  }
  
  /**
   * VarInt encoding for Bitcoin/Zcash
   */
  function encodeVarInt(n) {
    if (n < 0xfd) {
      return new Uint8Array([n]);
    } else if (n <= 0xffff) {
      return new Uint8Array([0xfd, n & 0xff, (n >> 8) & 0xff]);
    } else if (n <= 0xffffffff) {
      return new Uint8Array([
        0xfe,
        n & 0xff,
        (n >> 8) & 0xff,
        (n >> 16) & 0xff,
        (n >> 24) & 0xff
      ]);
    } else {
      throw new Error('VarInt too large');
    }
  }
  
  /**
   * Encode uint32 little-endian
   */
  function encodeUint32LE(n) {
    return new Uint8Array([
      n & 0xff,
      (n >> 8) & 0xff,
      (n >> 16) & 0xff,
      (n >> 24) & 0xff
    ]);
  }
  
  /**
   * Encode uint64 little-endian
   */
  function encodeUint64LE(n) {
    const bn = BigInt(n);
    const low = Number(bn & 0xffffffffn);
    const high = Number(bn >> 32n);
    return new Uint8Array([
      ...encodeUint32LE(low),
      ...encodeUint32LE(high)
    ]);
  }
  
  /**
   * Hex to bytes
   */
  function hexToBytes(hex) {
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    return new Uint8Array(bytes);
  }
  
  /**
   * Bytes to hex
   */
  function bytesToHex(bytes) {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  
  /**
   * Build P2PKH scriptPubKey from address
   */
  async function addressToScriptPubKey(address) {
    // This will use the base58 decode from ZcashKeys
    const decoded = await self.ZcashKeys.base58Decode(address);
    const pubKeyHash = decoded.slice(2, 22); // Skip 2-byte prefix
    
    // Build P2PKH: OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
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
   * Build OP_RETURN script
   */
  function buildOpReturnScript(data) {
    const script = new Uint8Array(2 + data.length);
    script[0] = 0x6a; // OP_RETURN
    
    if (data.length <= 75) {
      script[1] = data.length;
    } else if (data.length <= 255) {
      script[1] = 0x4c; // OP_PUSHDATA1
      script[2] = data.length;
      const extendedScript = new Uint8Array(3 + data.length);
      extendedScript.set(script.slice(0, 2));
      extendedScript[2] = data.length;
      extendedScript.set(data, 3);
      return extendedScript;
    } else {
      throw new Error('OP_RETURN data too large');
    }
    
    script.set(data, 2);
    return script;
  }
  
  /**
   * Build a Zcash v4 transaction
   */
  async function buildTransaction(params) {
    const {
      utxos,           // Array of UTXOs
      outputs,         // Array of {address, amount} or {opReturn: data}
      changeAddress,   // Change address
      feeRate = 1,     // Satoshis per byte
    } = params;
    
    if (!utxos || utxos.length === 0) {
      throw new Error('No UTXOs provided');
    }
    
    // Calculate total input
    const totalInput = utxos.reduce((sum, utxo) => sum + BigInt(utxo.satoshis || utxo.value), 0n);
    
    // Build output scripts
    const txOutputs = [];
    let totalOutput = 0n;
    
    for (const output of outputs) {
      if (output.opReturn) {
        // OP_RETURN output
        txOutputs.push({
          value: 0n,
          script: buildOpReturnScript(output.opReturn)
        });
      } else {
        // Regular P2PKH output
        txOutputs.push({
          value: BigInt(Math.round(output.amount * 100000000)), // ZEC to zatoshis
          script: await addressToScriptPubKey(output.address)
        });
        totalOutput += BigInt(Math.round(output.amount * 100000000));
      }
    }
    
    // Estimate size and fee
    const baseSize = 10; // version + locktime
    const inputSize = utxos.length * 148; // ~148 bytes per input
    const outputSize = txOutputs.length * 34; // ~34 bytes per output
    const changeOutputSize = 34;
    const estimatedSize = baseSize + inputSize + outputSize + changeOutputSize;
    const estimatedFee = BigInt(estimatedSize * feeRate);
    
    // Calculate change
    const changeAmount = totalInput - totalOutput - estimatedFee;
    
    if (changeAmount < 0n) {
      throw new Error(`Insufficient funds. Need ${totalOutput + estimatedFee} zatoshis, have ${totalInput}`);
    }
    
    // Add change output if significant
    if (changeAmount > 546n) { // Dust threshold
      txOutputs.push({
        value: changeAmount,
        script: await addressToScriptPubKey(changeAddress)
      });
    }
    
    return {
      version: 5 | (1 << 31), // Zcash v5 with Overwinter bit
      consensusBranchId: 0x4DEC4DF0, // NU6.1 consensus branch (active since Nov 23, 2025 at block 3,146,400)
      inputs: utxos.map(utxo => ({
        txid: utxo.txid,
        vout: utxo.vout,
        script: hexToBytes(utxo.scriptPubKey || ''),
        sequence: 0xffffffff,
        value: utxo.value || utxo.satoshis || 0 // REQUIRED for ZIP-244 signing!
      })),
      outputs: txOutputs,
      lockTime: 0,
      expiryHeight: 3300000 // Block 3.3M 
    };
  }
  
  /**
   * Serialize transaction for signing using ZIP-243 (Overwinter/Sapling)
   * This is completely different from Bitcoin signing!
   */
  async function serializeForSigning(tx, inputIndex, prevScript) {
    const buffer = [];
    
    // 1. nVersion + fOverwintered (v5)
    buffer.push(...encodeUint32LE(tx.version)); // v5 with Overwinter bit
    
    // 2. nVersionGroupId (v5 = 0x26A7270A)
    buffer.push(...encodeUint32LE(0x26A7270A));
    
    // 3. Consensus Branch ID (NU6.1 = 0x4DEC4DF0)
    buffer.push(...encodeUint32LE(tx.consensusBranchId));
    
    // 4. hashPrevouts (double SHA256 of all input outpoints)
    const prevoutsData = [];
    for (const input of tx.inputs) {
      const txidBytes = hexToBytes(input.txid);
      prevoutsData.push(...Array.from(txidBytes).reverse());
      prevoutsData.push(...encodeUint32LE(input.vout));
    }
    console.log('[ZIP-244-v5] prevoutsData length:', prevoutsData.length);
    const hashPrevouts = await hash256(new Uint8Array(prevoutsData));
    console.log('[ZIP-244-v5] hashPrevouts:', bytesToHex(hashPrevouts));
    buffer.push(...hashPrevouts);
    
    // 5. hashSequence (double SHA256 of all input sequences)
    const sequenceData = [];
    for (const input of tx.inputs) {
      sequenceData.push(...encodeUint32LE(input.sequence));
    }
    const hashSequence = await hash256(new Uint8Array(sequenceData));
    buffer.push(...hashSequence);
    
    // 6. hashOutputs (double SHA256 of all outputs)
    const outputsData = [];
    for (const output of tx.outputs) {
      outputsData.push(...encodeUint64LE(output.value));
      outputsData.push(...encodeVarInt(output.script.length));
      outputsData.push(...output.script);
    }
    const hashOutputs = await hash256(new Uint8Array(outputsData));
    buffer.push(...hashOutputs);
    
    // 7. hashJoinSplits (32 zero bytes for transparent-only)
    buffer.push(...new Array(32).fill(0));
    
    // 8. hashShieldedSpends (32 zero bytes for transparent-only)
    buffer.push(...new Array(32).fill(0));
    
    // 9. hashShieldedOutputs (32 zero bytes for transparent-only)
    buffer.push(...new Array(32).fill(0));
    
    // 10. nLockTime
    buffer.push(...encodeUint32LE(tx.lockTime));
    
    // 11. nExpiryHeight - use from tx object
    buffer.push(...encodeUint32LE(tx.expiryHeight));
    
    // 12. valueBalance (8 bytes, zero for transparent)
    buffer.push(...encodeUint64LE(0n));
    
    // 13. nHashType (SIGHASH_ALL)
    buffer.push(...encodeUint32LE(0x01));
    
    // 14. Input being signed: outpoint
    const input = tx.inputs[inputIndex];
    const txidBytes = hexToBytes(input.txid);
    buffer.push(...Array.from(txidBytes).reverse());
    buffer.push(...encodeUint32LE(input.vout));
    
    // 15. scriptCode of input (the prevScript)
    buffer.push(...encodeVarInt(prevScript.length));
    buffer.push(...prevScript);
    
    // 16. value of input (8 bytes)
    // We need to get this from the UTXO!
    const utxoValue = tx.inputs[inputIndex].value || 0n;
    console.log('[ZIP-244-v5] Input value for signing:', utxoValue, 'type:', typeof utxoValue);
    buffer.push(...encodeUint64LE(BigInt(utxoValue)));
    
    // 17. nSequence of input
    buffer.push(...encodeUint32LE(input.sequence));
    
    return new Uint8Array(buffer);
  }
  
  /**
   * Sign transaction
   * privateKey should be a 32-byte Uint8Array
   */
  async function signTransaction(tx, privateKey, utxos) {
    const signedInputs = [];
    
    for (let i = 0; i < tx.inputs.length; i++) {
      const input = tx.inputs[i];
      const utxo = utxos[i];
      
      // Get the scriptPubKey from the UTXO
      const prevScript = hexToBytes(utxo.scriptPubKey || '');
      
      // Serialize for signing
      const sigHash = await serializeForSigning(tx, i, prevScript);
      
      // Double SHA-256
      const hash = await hash256(sigHash);
      
      console.log('[ZcashTx] Signing input', i, 'hash:', bytesToHex(hash));
      
      // REAL SIGNING using FixedZcashKeys
      if (!self.FixedZcashKeys) {
        throw new Error('FixedZcashKeys not loaded! Cannot sign transaction.');
      }
      
      // Get DER signature from secp256k1
      const derSignature = self.FixedZcashKeys.signHash(hash, privateKey);
      
      // Append SIGHASH_ALL (0x01) to signature for Zcash
      const signatureWithHashType = new Uint8Array(derSignature.length + 1);
      signatureWithHashType.set(derSignature);
      signatureWithHashType[derSignature.length] = 0x01; // SIGHASH_ALL
      
      // Get public key from private key
      const publicKey = self.FixedZcashKeys.getPublicKey(privateKey);
      
      // Build scriptSig: <sig_length> <signature+hashtype> <pubkey_length> <pubkey>
      const scriptSig = new Uint8Array(signatureWithHashType.length + 1 + publicKey.length + 1);
      let offset = 0;
      scriptSig[offset++] = signatureWithHashType.length;
      scriptSig.set(signatureWithHashType, offset);
      offset += signatureWithHashType.length;
      scriptSig[offset++] = publicKey.length;
      scriptSig.set(publicKey, offset);
      
      signedInputs.push({
        ...input,
        script: scriptSig
      });
    }
    
    return {
      ...tx,
      inputs: signedInputs
    };
  }
  
  /**
   * Serialize signed transaction to hex
   */
  function serializeTransaction(tx) {
    const buffer = [];
    
    // Version (v5 with Overwinter bit)
    buffer.push(...encodeUint32LE(tx.version));
    
    // Group ID (v5 = 0x26A7270A)
    buffer.push(...encodeUint32LE(0x26A7270A));
    
    // Consensus Branch ID (NU6.1 = 0x4DEC4DF0)
    buffer.push(...encodeUint32LE(tx.consensusBranchId));
    
    // Lock time (moved before inputs in v5!)
    buffer.push(...encodeUint32LE(tx.lockTime));
    
    // Expiry height (moved before inputs in v5!)
    buffer.push(...encodeUint32LE(tx.expiryHeight));
    
    // Input count
    buffer.push(...encodeVarInt(tx.inputs.length));
    
    // Inputs
    for (const input of tx.inputs) {
      const txidBytes = hexToBytes(input.txid);
      buffer.push(...Array.from(txidBytes).reverse());
      buffer.push(...encodeUint32LE(input.vout));
      buffer.push(...encodeVarInt(input.script.length));
      buffer.push(...input.script);
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
    
    // v5: Sapling/Orchard counts (0 for transparent-only)
    buffer.push(...encodeVarInt(0)); // nSpendsSapling
    buffer.push(...encodeVarInt(0)); // nOutputsSapling
    buffer.push(...encodeVarInt(0)); // nActionsOrchard
    
    return bytesToHex(new Uint8Array(buffer));
  }
  
  return {
    buildTransaction,
    signTransaction,
    serializeTransaction,
    addressToScriptPubKey,
    buildOpReturnScript,
  };
  
})();

console.log('[ZcashTransaction] Module loaded');
