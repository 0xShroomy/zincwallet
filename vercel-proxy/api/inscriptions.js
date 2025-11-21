/**
 * Inscription API Endpoint
 * Returns ZRC-20 token balances and NFTs for a given address
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[Inscriptions API] Missing Supabase credentials');
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

  const { address } = req.query;
  
  if (!address) {
    return res.status(400).json({ 
      success: false,
      error: 'Address parameter is required',
      zrc20: [],
      nfts: []
    });
  }

  if (!supabase) {
    return res.status(500).json({
      success: false,
      error: 'Database not configured',
      zrc20: [],
      nfts: []
    });
  }

  try {
    console.log('[Inscriptions API] Fetching data for:', address);

    // Get ZRC-20 token balances (Zinc Protocol)
    const { data: zrc20Data, error: zrc20Error } = await supabase
      .from('zrc20_balances')
      .select('tick, balance, updated_at')
      .eq('address', address)
      .gt('balance', 0); // Only return non-zero balances

    if (zrc20Error) {
      console.error('[Inscriptions API] ZRC-20 query error:', zrc20Error);
      throw zrc20Error;
    }

    // Get NFTs owned by address (Zinc Protocol)
    const { data: nftsData, error: nftsError } = await supabase
      .from('nft_ownership')
      .select('collection, token_id, metadata, txid, created_at')
      .eq('address', address);

    if (nftsError) {
      console.error('[Inscriptions API] NFTs query error:', nftsError);
      throw nftsError;
    }

    // Get all inscriptions for this address (both Zinc and Zerdinals)
    const { data: inscriptionsData, error: inscriptionsError } = await supabase
      .from('inscriptions')
      .select('txid, block_height, timestamp, protocol, operation, data, content_type, content_size')
      .eq('sender_address', address)
      .order('block_height', { ascending: false })
      .limit(100);

    if (inscriptionsError) {
      console.error('[Inscriptions API] Inscriptions query error:', inscriptionsError);
      throw inscriptionsError;
    }

    // Separate by protocol
    const zincInscriptions = (inscriptionsData || []).filter(i => i.protocol === 'zinc');
    const zerdinalsInscriptions = (inscriptionsData || []).filter(i => i.protocol === 'zerdinals');

    // Format response
    const zrc20 = (zrc20Data || []).map(token => ({
      tick: token.tick,
      balance: parseInt(token.balance),
      lastUpdate: token.updated_at
    }));

    const nfts = (nftsData || []).map(nft => ({
      id: nft.token_id,
      collection: nft.collection,
      metadata: nft.metadata || {},
      txid: nft.txid,
      owner: address
    }));

    console.log(`[Inscriptions API] Found ${zrc20.length} tokens, ${nfts.length} NFTs, ${zincInscriptions.length} Zinc, ${zerdinalsInscriptions.length} Zerdinals`);

    return res.status(200).json({
      success: true,
      // Zinc Protocol data
      zinc: {
        zrc20,
        nfts,
        inscriptions: zincInscriptions
      },
      // Zerdinals Protocol data
      zerdinals: {
        inscriptions: zerdinalsInscriptions
      },
      cached: false
    });

  } catch (error) {
    console.error('[Inscriptions API] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch inscriptions',
      zinc: {
        zrc20: [],
        nfts: [],
        inscriptions: []
      },
      zerdinals: {
        inscriptions: []
      }
    });
  }
}
