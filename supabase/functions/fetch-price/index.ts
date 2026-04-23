// Edge Function: fetch-price
// ----------------------------------------------------------------
// Browser-side CORS proxy for stock/ETF latest price quotes.
// Tries Stooq (CSV) first, falls back to Yahoo Finance chart API.
//
// Request:  POST { symbol: "SOXL" }
// Response: { price: number | null, source: "stooq" | "yahoo" | null }
//
// Deploy:  supabase functions deploy fetch-price --no-verify-jwt
// ----------------------------------------------------------------

import { corsHeaders, json, badRequest } from '../_shared/http.ts';

interface Body { symbol?: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return badRequest('POST only');

  let body: Body;
  try { body = await req.json(); } catch { return badRequest('invalid json'); }
  const raw = (body.symbol ?? '').trim();
  if (!raw) return badRequest('missing symbol');

  const stooqPrice = await fetchStooq(raw);
  if (stooqPrice != null) return json({ price: stooqPrice, source: 'stooq' });

  const yahooPrice = await fetchYahoo(raw);
  if (yahooPrice != null) return json({ price: yahooPrice, source: 'yahoo' });

  return json({ price: null, source: null });
});

async function fetchStooq(symbol: string): Promise<number | null> {
  const s = symbol.toLowerCase();
  const stooqSymbol = s.includes('.') ? s : `${s}.us`;
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlcv&h&e=csv`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return null;
    const cols = lines[1].split(',');
    if (cols.length < 7) return null;
    const closeStr = cols[6];
    if (closeStr === 'N/D') return null;
    const price = parseFloat(closeStr);
    return !isNaN(price) && price > 0 ? price : null;
  } catch { return null; }
}

async function fetchYahoo(symbol: string): Promise<number | null> {
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    try {
      const res = await fetch(`https://${host}${path}`, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const price = (data as { chart?: { result?: { meta?: { regularMarketPrice?: number } }[] } })
        ?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price != null && !isNaN(price)) return price;
    } catch { /* try next */ }
  }
  return null;
}
