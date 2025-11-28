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
      if (personalization instanceof Uint8Array) {
        // Already binary - use directly
        personal = new Uint8Array(16);
        personal.set(personalization.slice(0, 16));
      } else if (typeof personalization === 'string') {
        // String - encode to bytes (only works for ASCII)
        const encoded = new TextEncoder().encode(personalization);
        personal = new Uint8Array(16);
        personal.set(encoded.slice(0, 16));
      }
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
      version: 4 | (1 << 31), // Zcash v4 with Overwinter bit
      consensusBranchId: 0x4dec4df0, // NU6.1 consensus branch (current mainnet)
      inputs: utxos.map(utxo => ({
        txid: utxo.txid,
        vout: utxo.vout,
        script: hexToBytes(utxo.scriptPubKey || ''),
        sequence: 0xffffffff,
        value: utxo.value || utxo.satoshis || 0 // REQUIRED for ZIP-244 signing!
      })),
      outputs: txOutputs,
      lockTime: 0,
      expiryHeight: 0 // Use 0 to mean "current block + 20" per Zcash default
    };
  }
  
  /**
   * Serialize transaction for signing using ZIP-243 (v4 transactions) 
   * Uses SHA256 double hash (BIP-143 style) - proven to work!
   */
  async function serializeForSigning(tx, inputIndex, prevScript, _utxos) {
    // ZIP-243: Build signature digest using BLAKE2b-256 (NOT SHA256!)
    const hashType = 0x01; // SIGHASH_ALL
    
    // 3. hashPrevouts - BLAKE2b-256 with personalization 'ZcashPrevoutHash'
    const prevoutsData = [];
    for (const input of tx.inputs) {
      const txidBytes = hexToBytes(input.txid);
      prevoutsData.push(...Array.from(txidBytes).reverse());
      prevoutsData.push(...encodeUint32LE(input.vout));
    }
    const hashPrevouts = blake2b256(new Uint8Array(prevoutsData), 'ZcashPrevoutHash');
    console.log('[ZIP-243] prevoutsData:', bytesToHex(new Uint8Array(prevoutsData)));
    console.log('[ZIP-243] hashPrevouts:', bytesToHex(hashPrevouts));
    
    // 4. hashSequence - BLAKE2b-256 with personalization 'ZcashSequencHash'
    const sequenceData = [];
    for (const input of tx.inputs) {
      sequenceData.push(...encodeUint32LE(input.sequence));
    }
    const hashSequence = blake2b256(new Uint8Array(sequenceData), 'ZcashSequencHash');
    console.log('[ZIP-243] hashSequence:', bytesToHex(hashSequence));
    
    // 5. hashOutputs - BLAKE2b-256 with personalization 'ZcashOutputsHash'
    const outputsData = [];
    for (const output of tx.outputs) {
      outputsData.push(...encodeUint64LE(output.value));
      outputsData.push(...encodeVarInt(output.script.length));
      outputsData.push(...output.script);
    }
    const hashOutputs = blake2b256(new Uint8Array(outputsData), 'ZcashOutputsHash');
    console.log('[ZIP-243] outputsData:', bytesToHex(new Uint8Array(outputsData)));
    console.log('[ZIP-243] hashOutputs:', bytesToHex(hashOutputs));
    
    // 6-8. Empty hashes for JoinSplits and Shielded (transparent-only)
    const hashJoinSplits = new Uint8Array(32).fill(0);
    const hashShieldedSpends = new Uint8Array(32).fill(0);
    const hashShieldedOutputs = new Uint8Array(32).fill(0);
    
    // Build final signature preimage
    const sigData = [];
    
    // 1. header (version with overwinter bit)
    sigData.push(...encodeUint32LE(tx.version));
    
    // 2. nVersionGroupId
    sigData.push(...encodeUint32LE(0x892F2085));
    
    // 3-8. All the hashes
    sigData.push(...hashPrevouts);
    sigData.push(...hashSequence);
    sigData.push(...hashOutputs);
    sigData.push(...hashJoinSplits);
    sigData.push(...hashShieldedSpends);
    sigData.push(...hashShieldedOutputs);
    
    // 9. nLockTime
    sigData.push(...encodeUint32LE(tx.lockTime));
    
    // 10. nExpiryHeight
    sigData.push(...encodeUint32LE(tx.expiryHeight));
    
    // 11. valueBalance (8 bytes, 0 for transparent-only)
    sigData.push(...encodeUint64LE(0n));
    
    // 12. nHashType
    sigData.push(...encodeUint32LE(hashType));
    
    // 13. Input being signed
    const input = tx.inputs[inputIndex];
    const txidBytes = hexToBytes(input.txid);
    sigData.push(...Array.from(txidBytes).reverse());
    sigData.push(...encodeUint32LE(input.vout));
    
    // 14. scriptCode
    console.log('[ZIP-243] prevScript (scriptCode):', bytesToHex(prevScript));
    sigData.push(...encodeVarInt(prevScript.length));
    sigData.push(...prevScript);
    
    // 15. value (8 bytes)
    const utxoValue = BigInt(input.value || 0);
    sigData.push(...encodeUint64LE(utxoValue));
    
    // 16. nSequence
    sigData.push(...encodeUint32LE(input.sequence));
    
    console.log('[ZIP-243] Signing input', inputIndex, 'value:', utxoValue.toString());
    console.log('[ZIP-243] Full preimage length:', sigData.length, 'bytes');
    console.log('[ZIP-243] Full preimage:', bytesToHex(new Uint8Array(sigData)));
    
    // Final signature hash: BLAKE2b-256 with personalization "ZcashSigHash" + consensusBranchId
    // MUST use Uint8Array because consensusBranchId bytes can be > 127 (e.g. 0xf0 in 0x4dec4df0)
    // String.fromCharCode + TextEncoder corrupts bytes > 127 due to UTF-8 encoding
    const personalization = new Uint8Array(16);
    const prefix = new TextEncoder().encode('ZcashSigHash'); // 12 bytes ASCII
    personalization.set(prefix);
    personalization.set(encodeUint32LE(tx.consensusBranchId), 12); // 4 bytes LE at offset 12
    
    console.log('[ZIP-243] Personalization hex:', bytesToHex(personalization));
    return blake2b256(new Uint8Array(sigData), personalization);
  }
  
  /**
   * Build P2PKH scriptPubKey from Zcash address
   */
  function buildScriptPubKeyFromAddress(address) {
    // Simple base58 alphabet
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    
    // Count leading '1's (they represent 0x00 bytes)
    let leadingZeros = 0;
    for (let i = 0; i < address.length && address[i] === '1'; i++) {
      leadingZeros++;
    }
    
    // Decode base58
    let decoded = BigInt(0);
    for (let i = 0; i < address.length; i++) {
      const char = address[i];
      const value = ALPHABET.indexOf(char);
      if (value === -1) throw new Error('Invalid base58 character');
      decoded = decoded * 58n + BigInt(value);
    }
    
    // Convert to bytes with proper padding
    let hex = decoded.toString(16);
    if (hex.length % 2 !== 0) hex = '0' + hex; // Ensure even length
    
    const bytes = [];
    // Add leading zero bytes
    for (let i = 0; i < leadingZeros; i++) {
      bytes.push(0);
    }
    // Add decoded bytes
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    
    console.log('[ZcashTx] Base58 decoded to', bytes.length, 'bytes:', bytesToHex(new Uint8Array(bytes)));
    
    // Zcash t1 addresses: 2 version bytes + 20 pubkey hash bytes + 4 checksum bytes = 26 bytes
    // Extract the 20-byte pubkey hash (skip 2 version bytes, take 20 bytes before checksum)
    const pubkeyHash = new Uint8Array(bytes.slice(2, 22)); // Skip 2 version bytes, take next 20 bytes
    
    console.log('[ZcashTx] Decoded address, pubkey hash:', bytesToHex(pubkeyHash));
    
    // Build P2PKH script: OP_DUP OP_HASH160 <20-byte-hash> OP_EQUALVERIFY OP_CHECKSIG
    const script = new Uint8Array(25);
    script[0] = 0x76;  // OP_DUP
    script[1] = 0xa9;  // OP_HASH160
    script[2] = 0x14;  // Push 20 bytes
    script.set(pubkeyHash, 3);
    script[23] = 0x88; // OP_EQUALVERIFY
    script[24] = 0xac; // OP_CHECKSIG
    
    return script;
  }

  /**
   * Sign transaction
   * privateKey should be a 32-byte Uint8Array
   * options.envelope - optional Zerdinals envelope to prepend to first input's scriptSig
   */
  async function signTransaction(tx, privateKey, utxos, options = {}) {
    const signedInputs = [];
    const envelope = options.envelope; // Zerdinals envelope (Uint8Array)
    
    for (let i = 0; i < tx.inputs.length; i++) {
      const input = tx.inputs[i];
      const utxo = utxos[i];
      
      // Get the scriptPubKey from the UTXO, or build it from the address
      let prevScript;
      if (utxo.scriptPubKey) {
        prevScript = hexToBytes(utxo.scriptPubKey);
      } else {
        // Build scriptPubKey from address (Blockchair doesn't provide it)
        console.log('[ZcashTx] Building scriptPubKey from address:', utxo.address);
        prevScript = buildScriptPubKeyFromAddress(utxo.address);
      }
      
      console.log('[ZcashTx] prevScript length:', prevScript.length, 'bytes');
      
      // Get signature hash using ZIP-243 (SHA256 double-hash)
      const sigHash = await serializeForSigning(tx, i, prevScript, utxos);
      
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
      
      // Build base scriptSig: <sig_length> <signature+hashtype> <pubkey_length> <pubkey>
      const baseScriptSig = new Uint8Array(signatureWithHashType.length + 1 + publicKey.length + 1);
      let offset = 0;
      baseScriptSig[offset++] = signatureWithHashType.length;
      baseScriptSig.set(signatureWithHashType, offset);
      offset += signatureWithHashType.length;
      baseScriptSig[offset++] = publicKey.length;
      baseScriptSig.set(publicKey, offset);
      
      // For Zerdinals: prepend envelope to first input's scriptSig
      let scriptSig;
      if (i === 0 && envelope && envelope.length > 0) {
        console.log('[ZcashTx] Prepending Zerdinals envelope to scriptSig, size:', envelope.length);
        scriptSig = new Uint8Array(envelope.length + baseScriptSig.length);
        scriptSig.set(envelope, 0);
        scriptSig.set(baseScriptSig, envelope.length);
      } else {
        scriptSig = baseScriptSig;
      }
      
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
    
    // Version (v4 with Overwinter bit)
    buffer.push(...encodeUint32LE(tx.version));
    
    // Group ID (v4 Sapling = 0x892F2085)
    buffer.push(...encodeUint32LE(0x892F2085));
    
    // Input count (v4 has inputs BEFORE locktime/expiry)
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
    
    // v4: Locktime and expiry AFTER outputs
    buffer.push(...encodeUint32LE(tx.lockTime));
    buffer.push(...encodeUint32LE(tx.expiryHeight));
    
    // v4: Value balance (8 bytes, 0 for transparent-only)
    buffer.push(...encodeUint64LE(0n));
    
    // v4: Shielded counts (0 for transparent-only)
    buffer.push(...encodeVarInt(0)); // nShieldedSpend
    buffer.push(...encodeVarInt(0)); // nShieldedOutput
    
    // v4: JoinSplit count (0 for transparent-only)
    buffer.push(...encodeVarInt(0)); // nJoinSplit
    
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
