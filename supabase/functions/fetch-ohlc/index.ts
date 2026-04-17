// Edge Function: fetch-ohlc
// ----------------------------------------------------------------
// 流程：
//   1. 查 ohlc_bars，命中且覆盖请求区间 → 直接返回
//   2. 未命中或缺口 → 从 provider 拉取 → upsert 回 ohlc_bars → 返回
// ----------------------------------------------------------------
// 部署：
//   supabase functions deploy fetch-ohlc --no-verify-jwt
// （允许匿名调用；鉴权用 supabase-js 自带的 anon key 即可）
// ----------------------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json, badRequest } from '../_shared/http.ts';
import { fetchCandles } from '../_shared/providers.ts';

interface Body {
  symbol: string;
  timeframe: string;
  limit?: number;
  end_ts?: number;   // exclusive, seconds
  force?: boolean;   // 跳过 cache
}

const VALID_TF = new Set(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method !== 'POST') return badRequest('POST only');

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return badRequest('invalid json');
  }

  const symbol = (body.symbol ?? '').toUpperCase();
  const tf = body.timeframe ?? '';
  const limit = Math.min(Math.max(body.limit ?? 500, 1), 1000);
  const endTs = body.end_ts;

  if (!symbol) return badRequest('symbol required');
  if (!VALID_TF.has(tf)) return badRequest(`invalid timeframe: ${tf}`);

  // service_role 绕 RLS
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  // 查 symbol 元数据（拿 exchange）
  const { data: sym, error: symErr } = await admin
    .from('symbols')
    .select('code, exchange')
    .eq('code', symbol)
    .maybeSingle();
  if (symErr) return json({ error: symErr.message }, { status: 500 });
  if (!sym) return badRequest(`unknown symbol: ${symbol}`);

  // ---- 1) 查 cache ----
  if (!body.force) {
    let q = admin
      .from('ohlc_bars')
      .select('symbol_code,timeframe,ts,o,h,l,c,v')
      .eq('symbol_code', symbol)
      .eq('timeframe', tf)
      .order('ts', { ascending: false })
      .limit(limit);
    if (endTs) q = q.lt('ts', endTs);

    const { data: cached, error: cErr } = await q;
    if (cErr) return json({ error: cErr.message }, { status: 500 });

    const cacheFresh = isCacheFresh(cached ?? [], tf, endTs);
    if (cached && cached.length >= limit && cacheFresh) {
      // 返回时按升序（前端的 adapter 也会排，但保持协议）
      return json({ rows: cached.slice().reverse(), source: 'cache' });
    }
  }

  // ---- 2) miss → 远程拉 ----
  let candles;
  try {
    candles = await fetchCandles(sym.exchange, {
      symbol,
      timeframe: tf as 'CT',
      limit,
      endTs,
    });
  } catch (e) {
    return json(
      { error: `provider fetch failed: ${(e as Error).message}` },
      { status: 502 }
    );
  }

  if (candles.length === 0) return json({ rows: [], source: 'provider' });

  const rows = candles.map((c) => ({
    symbol_code: symbol,
    timeframe: tf,
    ts: c.ts,
    o: c.o,
    h: c.h,
    l: c.l,
    c: c.c,
    v: c.v,
  }));

  // upsert 到 cache（忽略错误 —— 拉到数据更重要）
  const { error: upErr } = await admin
    .from('ohlc_bars')
    .upsert(rows, { onConflict: 'symbol_code,timeframe,ts' });
  if (upErr) console.warn('[fetch-ohlc] upsert failed', upErr.message);

  return json({ rows, source: 'provider' });
});

function isCacheFresh(
  rows: Array<{ ts: number }>,
  tf: string,
  endTs?: number
): boolean {
  if (rows.length === 0) return false;
  // 最新一根如果是"最新收盘 bar"，cache 就算新鲜
  const nowSec = Math.floor(Date.now() / 1000);
  const target = endTs ?? nowSec;
  const step = tfToSec(tf);
  const maxTs = Math.max(...rows.map((r) => r.ts));
  // 允许 1 根 bar 的滞后（未收盘的最新根可以稍后补）
  return target - maxTs <= step * 2;
}

function tfToSec(tf: string): number {
  const m: Record<string, number> = {
    '1m': 60,
    '5m': 300,
    '15m': 900,
    '30m': 1800,
    '1h': 3600,
    '4h': 14400,
    '1d': 86400,
    '1w': 604800,
  };
  return m[tf] ?? 60;
}
