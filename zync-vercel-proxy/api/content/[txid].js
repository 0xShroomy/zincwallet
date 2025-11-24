/**
 * Content Serving API
 * Serves inscription content (images, videos, HTML, etc.) from database
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[Content API] Missing Supabase credentials');
}

const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// Cache for content (1 hour TTL)
const contentCache = new Map();
const CACHE_TTL = 3600000; // 1 hour

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { txid } = req.query;
  
  if (!txid) {
    return res.status(400).json({ error: 'Transaction ID required' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    // Check cache first
    const cached = contentCache.get(txid);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      console.log('[Content API] Cache HIT for', txid.substring(0, 10));
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('X-Cache', 'HIT');
      return res.send(Buffer.from(cached.data, 'hex'));
    }

    console.log('[Content API] Fetching content for:', txid.substring(0, 10));

    // Fetch inscription from database
    const { data, error } = await supabase
      .from('inscriptions')
      .select('content_type, content_data, content_size')
      .eq('txid', txid)
      .single();

    if (error) {
      console.error('[Content API] Database error:', error);
      return res.status(404).json({ error: 'Inscription not found' });
    }

    if (!data || !data.content_data) {
      return res.status(404).json({ error: 'Content not found' });
    }

    // Cache the content
    contentCache.set(txid, {
      contentType: data.content_type,
      data: data.content_data,
      timestamp: Date.now()
    });

    // Set content type header
    res.setHeader('Content-Type', data.content_type || 'application/octet-stream');
    res.setHeader('Content-Length', data.content_size || data.content_data.length / 2);
    res.setHeader('X-Cache', 'MISS');
    
    // For HTML/JS, add sandbox headers
    if (data.content_type?.includes('html') || data.content_type?.includes('javascript')) {
      res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: https:; font-src data:");
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }

    // Convert hex to buffer and send
    const buffer = Buffer.from(data.content_data, 'hex');
    
    console.log(`[Content API] ✓ Served ${data.content_type} (${buffer.length} bytes)`);
    
    return res.send(buffer);

  } catch (error) {
    console.error('[Content API] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch content',
      message: error.message 
    });
  }
}
