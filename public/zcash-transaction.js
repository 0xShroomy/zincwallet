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
   * BLAKE2b-256 hash with personalization string (for ZIP-244)
   * Uses the blake2b.js library loaded in background.js
   */
  function blake2b256(data, personalization) {
    // blake2b(input, key, outlen, salt, personal)
    // Personalization must be exactly 16 bytes or undefined
    let personal = undefined;
    if (personalization) {
      const encoded = new TextEncoder().encode(personalization);
      personal = new Uint8Array(16);
      personal.set(encoded.slice(0, 16)); // Copy up to 16 bytes, rest stays 0
    }
    
    const hash = self.blake2b(data, null, 32, null, personal); // 32 bytes = 256 bits
    return new Uint8Array(hash);
  }
  
  /**
   * BLAKE2b-256 of empty array with personalization (common in ZIP-244)
   */
  function blake2b256Empty(personalization) {
    return blake2b256(new Uint8Array(0), personalization);
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
    
    // Calculate fee using ZIP-317 (NU6+)
    // Fee = marginal_fee × max(grace_actions, logical_actions)
    // marginal_fee = 5000 zatoshis
    // grace_actions = 2
    // logical_actions = max(inputs, outputs)
    const marginalFee = 5000;
    const graceActions = 2;
    const outputCount = txOutputs.length + 1; // +1 for change output
    const logicalActions = Math.max(utxos.length, outputCount);
    const estimatedFee = BigInt(marginalFee * Math.max(graceActions, logicalActions));
    
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
   * Serialize transaction for signing using ZIP-244 (v5 transactions)
   * Uses BLAKE2b-256 with personalization strings
   */
  function serializeForSigning(tx, inputIndex, prevScript, utxos) {
    // ZIP-244: Build signature digest using BLAKE2b-256
    
    // S.1: header_digest
    const headerData = [];
    headerData.push(...encodeUint32LE(tx.version));
    headerData.push(...encodeUint32LE(0x26A7270A)); // version_group_id
    headerData.push(...encodeUint32LE(tx.consensusBranchId));
    headerData.push(...encodeUint32LE(tx.lockTime));
    headerData.push(...encodeUint32LE(tx.expiryHeight));
    const headerDigest = blake2b256(new Uint8Array(headerData), 'ZTxIdHeadersHash');
    
    // S.2: transparent_sig_digest components (different from txid!)
    const hashType = 0x01; // SIGHASH_ALL
    
    // S.2b: prevouts_sig_digest (same as txid for SIGHASH_ALL)
    const prevoutsData = [];
    for (const input of tx.inputs) {
      const txidBytes = hexToBytes(input.txid);
      prevoutsData.push(...Array.from(txidBytes).reverse());
      prevoutsData.push(...encodeUint32LE(input.vout));
    }
    const prevoutsSigDigest = blake2b256(new Uint8Array(prevoutsData), 'ZTxIdPrevoutHash');
    
    // S.2c: amounts_sig_digest (hash of all input amounts)
    const amountsData = [];
    for (const input of tx.inputs) {
      const inputValue = BigInt(input.value || 0);
      amountsData.push(...encodeUint64LE(inputValue));
    }
    const amountsSigDigest = blake2b256(new Uint8Array(amountsData), 'ZTxTrAmountsHash');
    
    // S.2d: scriptpubkeys_sig_digest (hash of all input scriptPubKeys)
    // For SIGHASH_ALL, include ALL input scriptPubKeys
    const scriptPubKeysData = [];
    for (let i = 0; i < tx.inputs.length; i++) {
      const utxo = utxos[i];
      const scriptPubKey = hexToBytes(utxo.scriptPubKey || '');
      scriptPubKeysData.push(...encodeVarInt(scriptPubKey.length));
      scriptPubKeysData.push(...scriptPubKey);
    }
    const scriptPubKeysSigDigest = blake2b256(new Uint8Array(scriptPubKeysData), 'ZTxTrScriptsHash');
    
    // S.2e: sequence_sig_digest
    const sequenceData = [];
    for (const input of tx.inputs) {
      sequenceData.push(...encodeUint32LE(input.sequence));
    }
    const sequenceSigDigest = blake2b256(new Uint8Array(sequenceData), 'ZTxIdSequencHash');
    
    // S.2f: outputs_sig_digest (for SIGHASH_ALL, hash all outputs)
    const outputsData = [];
    for (const output of tx.outputs) {
      outputsData.push(...encodeUint64LE(output.value));
      outputsData.push(...encodeVarInt(output.script.length));
      outputsData.push(...output.script);
    }
    const outputsSigDigest = blake2b256(new Uint8Array(outputsData), 'ZTxIdOutputsHash');
    
    // transparent_sig_digest = hash(hash_type || prevouts || amounts || scriptpubkeys || sequence || outputs || txin)
    const transparentSigData = [];
    transparentSigData.push(hashType); // S.2a: 1 byte
    transparentSigData.push(...prevoutsSigDigest); // S.2b
    transparentSigData.push(...amountsSigDigest); // S.2c
    transparentSigData.push(...scriptPubKeysSigDigest); // S.2d
    transparentSigData.push(...sequenceSigDigest); // S.2e
    transparentSigData.push(...outputsSigDigest); // S.2f
    // txin_sig_digest (S.2g) will be added below
    const transparentDigest = transparentSigData; // Don't hash yet, need to add txin_sig_digest
    
    // S.2g: txin_sig_digest (the input being signed)
    const input = tx.inputs[inputIndex];
    const txinData = [];
    // prevout
    const txidBytes = hexToBytes(input.txid);
    txinData.push(...Array.from(txidBytes).reverse());
    txinData.push(...encodeUint32LE(input.vout));
    // value
    const utxoValue = BigInt(input.value || 0);
    txinData.push(...encodeUint64LE(utxoValue));
    // scriptPubKey
    txinData.push(...encodeVarInt(prevScript.length));
    txinData.push(...prevScript);
    // nSequence
    txinData.push(...encodeUint32LE(input.sequence));
    const txinSigDigest = blake2b256(new Uint8Array(txinData), 'Zcash___TxInHash');
    
    // Add txin_sig_digest to transparent_sig_data and hash it
    transparentSigData.push(...txinSigDigest); // S.2g
    const transparentSigDigest = blake2b256(new Uint8Array(transparentSigData), 'ZTxIdTranspaHash');
    
    // S.3: sapling_digest (empty for transparent-only)
    const saplingDigest = blake2b256Empty('ZTxIdSaplingHash');
    
    // S.4: orchard_digest (empty for transparent-only)
    const orchardDigest = blake2b256Empty('ZTxIdOrchardHash');
    
    // Final signature digest: BLAKE2b-256 of all components
    const sigData = [];
    sigData.push(...headerDigest);
    sigData.push(...transparentSigDigest); // Now properly hashed!
    sigData.push(...saplingDigest);
    sigData.push(...orchardDigest);
    
    // Personalization for signature: "ZcashSigHash" (12 bytes) + branch_id (4 bytes LE)
    const branchIdBytes = encodeUint32LE(tx.consensusBranchId);
    const personalizationPrefix = 'ZcashSigHash'; // 12 bytes
    const personalization = personalizationPrefix + String.fromCharCode(...branchIdBytes);
    
    console.log('[ZIP-244] Signing input', inputIndex, 'value:', utxoValue.toString());
    console.log('[ZIP-244] Personalization:', Array.from(new TextEncoder().encode(personalizationPrefix)).concat(branchIdBytes).map(b => b.toString(16).padStart(2, '0')).join(''));
    
    return blake2b256(new Uint8Array(sigData), personalization);
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
      
      // Get signature hash using ZIP-244 (already returns final BLAKE2b-256 hash)
      const sigHash = serializeForSigning(tx, i, prevScript, utxos);
      
      console.log('[ZcashTx] Signing input', i, 'hash:', bytesToHex(sigHash));
      
      // REAL SIGNING using FixedZcashKeys
      if (!self.FixedZcashKeys) {
        throw new Error('FixedZcashKeys not loaded! Cannot sign transaction.');
      }
      
      // Get DER signature from secp256k1
      const derSignature = self.FixedZcashKeys.signHash(sigHash, privateKey);
      
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
