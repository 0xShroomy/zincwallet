/**
 * Deploy Info API Endpoint
 * Returns deployment details for a ZRC-20 token (mint price, deployer, etc.)
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[Deploy Info API] Missing Supabase credentials');
}

const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { txid, network = 'mainnet' } = req.query;
  
  if (!txid) {
    return res.status(400).json({ 
      success: false,
      error: 'txid parameter is required'
    });
  }

  if (!supabase) {
    return res.status(500).json({
      success: false,
      error: 'Database not configured'
    });
  }

  try {
    console.log(`[Deploy Info API] Fetching deploy info for txid:`, txid);

    // Query inscriptions table for the deploy transaction
    const { data, error } = await supabase
      .from('inscriptions')
      .select('txid, sender_address, data, timestamp, block_height')
      .eq('txid', txid)
      .eq('operation', 'deploy')
      .eq('protocol', 'zinc')
      .eq('network', network)
      .single();

    if (error) {
      console.error('[Deploy Info API] Query error:', error);
      throw error;
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Deploy transaction not found'
      });
    }

    // Parse the deploy data
    const deployData = data.data || {};
    
    // Extract relevant fields
    const deployInfo = {
      txid: data.txid,
      ticker: deployData.tick || deployData.ticker,
      maxSupply: parseInt(deployData.max || deployData.maxSupply || 0),
      limitPerMint: parseInt(deployData.lim || deployData.limit || 0),
      decimals: parseInt(deployData.dec || deployData.decimals || 8),
      mintPrice: parseInt(deployData.mintPrice || deployData.price || 0), // in zatoshis
      deployerAddress: data.sender_address,
      timestamp: data.timestamp,
      blockHeight: data.block_height,
      network: network
    };

    console.log(`[Deploy Info API] Found deploy:`, deployInfo.ticker, 'mint price:', deployInfo.mintPrice);

    return res.status(200).json({
      success: true,
      ...deployInfo
    });

  } catch (error) {
    console.error('[Deploy Info API] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch deploy info',
      mintPrice: 0,
      deployerAddress: null
    });
  }
}
