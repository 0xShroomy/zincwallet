/**
 * Compare our transaction with Zcash RPC-built transaction
 * Uses Tatum API to call Zcash RPC methods
 */

require('dotenv').config({ path: '.env.local' });
const https = require('https');

const TATUM_API_KEY = process.env.TATUM_API_KEY || 'YOUR_TATUM_API_KEY';

// UTXO from your test
const UTXO = {
  txid: 'a0460dddf4733b79bee850d6c20420ab17ac52f80ece6bfe09f822dcd1f2f651',
  vout: 1,
  value: 0.01643975, // in ZEC
  scriptPubKey: '76a9149c02ad5188cafa9171b23228360b3fe4532ef21188ac'
};

// Transaction details
const TO_ADDRESS = 't1XVyLCC1vCnsWomwmVL3bCPCdYY1JGfXm5';
const FROM_ADDRESS = 't1Y6WdGGi4gCtU6jbzchREqSxyrZEJqNjsN';
const SEND_AMOUNT = 0.0001; // in ZEC

async function callZcashRPC(method, params) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    });

    const options = {
      hostname: 'api.tatum.io',
      port: 443,
      path: '/v3/blockchain/node/ZEC',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TATUM_API_KEY
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(json.error.message || JSON.stringify(json.error)));
          } else {
            resolve(json.result);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

(async () => {
  console.log('🔍 Testing Zcash RPC transaction building...\n');

  try {
    // Step 1: Create raw transaction using Zcash RPC
    console.log('📝 Creating raw transaction via RPC...');
    
    const inputs = [{
      txid: UTXO.txid,
      vout: UTXO.vout
    }];

    const changeAmount = UTXO.value - SEND_AMOUNT - 0.0001; // 0.0001 fee
    
    const outputs = {
      [TO_ADDRESS]: SEND_AMOUNT,
      [FROM_ADDRESS]: changeAmount
    };

    console.log('Inputs:', JSON.stringify(inputs, null, 2));
    console.log('Outputs:', JSON.stringify(outputs, null, 2));
    console.log('');

    const rpcTxHex = await callZcashRPC('createrawtransaction', [inputs, outputs]);
    
    console.log('✅ RPC created transaction:');
    console.log('Hex:', rpcTxHex);
    console.log('Length:', rpcTxHex.length, 'chars =', rpcTxHex.length / 2, 'bytes');
    console.log('');

    // Step 2: Decode the RPC transaction
    console.log('🔍 Decoding RPC transaction...');
    const rpcDecoded = await callZcashRPC('decoderawtransaction', [rpcTxHex]);
    console.log('Decoded:', JSON.stringify(rpcDecoded, null, 2));
    console.log('');

    // Step 3: Decode OUR transaction
    console.log('🔍 Decoding OUR transaction...');
    const ourTxHex = '0400008085202f890151f6f2d1dc22f809fe6bce0ef852ac17ab2004c2d650e8be793b73f4dd0d46a0010000006a47304402202ac6722077a5a9c907a67175806b99eebb83b7dafd633c9ddab3077c088492e602201391960e697a296840f2319a3e772d03a3f3b0ce1426656298274abfb5555b26012102b91c00188cb6a52ecbf3ec33810d0e01f611fec6208f2f8cafc435cd8ec65902ffffffff0210270000000000001976a914957a6940c621f9bbcb26fd74df2e0c1074814ab088aca7c71800000000001976a9149c02ad5188cafa9171b23228360b3fe4532ef21188ac00000000a05a32000000000000000000000000';
    
    const ourDecoded = await callZcashRPC('decoderawtransaction', [ourTxHex]);
    console.log('Decoded:', JSON.stringify(ourDecoded, null, 2));
    console.log('');

    // Compare
    console.log('📊 COMPARISON:');
    console.log('');
    console.log('RPC Transaction:');
    console.log('  Version:', rpcDecoded.version);
    console.log('  Locktime:', rpcDecoded.locktime);
    console.log('  Expiry:', rpcDecoded.expiryheight);
    console.log('  Inputs:', rpcDecoded.vin.length);
    console.log('  Outputs:', rpcDecoded.vout.length);
    console.log('');
    console.log('OUR Transaction:');
    console.log('  Version:', ourDecoded.version);
    console.log('  Locktime:', ourDecoded.locktime);
    console.log('  Expiry:', ourDecoded.expiryheight);
    console.log('  Inputs:', ourDecoded.vin.length);
    console.log('  Outputs:', ourDecoded.vout.length);
    console.log('');

    // Compare structure
    console.log('🔍 DIFFERENCES:');
    if (rpcDecoded.version !== ourDecoded.version) {
      console.log('  ❌ Version mismatch:', rpcDecoded.version, 'vs', ourDecoded.version);
    } else {
      console.log('  ✅ Version matches');
    }

    if (rpcDecoded.locktime !== ourDecoded.locktime) {
      console.log('  ❌ Locktime mismatch:', rpcDecoded.locktime, 'vs', ourDecoded.locktime);
    } else {
      console.log('  ✅ Locktime matches');
    }

    if (rpcDecoded.expiryheight !== ourDecoded.expiryheight) {
      console.log('  ❌ Expiry height mismatch:', rpcDecoded.expiryheight, 'vs', ourDecoded.expiryheight);
    } else {
      console.log('  ✅ Expiry height matches');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
})();
