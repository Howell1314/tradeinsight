// Edge Function: run-backtest
// ----------------------------------------------------------------
// 接收一个回测请求，在 Edge runtime 里直接跑策略（轻量情况）。
// 流程：
//   1. 校验 + 记录 backtest_runs(status=running)
//   2. 用 fetch-ohlc 相同的 provider 拉 OHLC
//   3. 调用策略函数（stub：naiveMaCross；换成你的算法层即可）
//   4. 写回 trades + 更新 backtest_runs(status=done, metrics, equity_curve)
//   5. 返回 run_id，前端通过 realtime 订阅或轮询结果
// ----------------------------------------------------------------
// 部署：
//   supabase functions deploy run-backtest
// （默认验证 JWT，拿到 user_id 做归属）
// ----------------------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json, badRequest } from '../_shared/http.ts';
import { fetchCandles } from '../_shared/providers.ts';

interface Body {
  strategy_id: string;
  symbol_code: string;
  timeframe: string;
  start_ts: number;       // 秒
  end_ts: number;         // 秒
  initial_capital?: number;
  params?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return badRequest('POST only');

  // 从 JWT 拿 user_id
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, { status: 401 });

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }
  const userId = userData.user.id;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return badRequest('invalid json');
  }
  if (!body.strategy_id || !body.symbol_code || !body.timeframe) {
    return badRequest('missing required fields');
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  // ---- 1. 创建 run ----
  const { data: run, error: runErr } = await admin
    .from('backtest_runs')
    .insert({
      user_id: userId,
      strategy_id: body.strategy_id,
      symbol_code: body.symbol_code,
      timeframe: body.timeframe,
      start_ts: body.start_ts,
      end_ts: body.end_ts,
      status: 'running',
    })
    .select()
    .single();
  if (runErr || !run) {
    return json({ error: runErr?.message ?? 'create run failed' }, { status: 500 });
  }

  // ---- 2-4. 在后台执行（Edge Functions 有 CPU 时间上限，重策略建议改成 queue + worker） ----
  try {
    // 拉 symbol exchange
    const { data: sym } = await admin
      .from('symbols')
      .select('exchange')
      .eq('code', body.symbol_code)
      .maybeSingle();
    if (!sym) throw new Error(`unknown symbol: ${body.symbol_code}`);

    // 拉 OHLC（按 end_ts 分页拉满区间）
    const candles = await fetchRange(
      sym.exchange,
      body.symbol_code,
      body.timeframe,
      body.start_ts,
      body.end_ts
    );

    // 跑策略（stub）
    const { trades, equity, metrics } = runStrategyStub(
      candles,
      body.params ?? {},
      body.initial_capital ?? 10000
    );

    // 写 trades
    if (trades.length > 0) {
      const tradeRows = trades.map((t) => ({
        user_id: userId,
        backtest_id: run.id,
        strategy_id: body.strategy_id,
        symbol_code: body.symbol_code,
        side: t.side,
        status: 'closed',
        entry_ts: t.entry_ts,
        entry_price: t.entry_price,
        exit_ts: t.exit_ts,
        exit_price: t.exit_price,
        qty: t.qty,
        pnl: t.pnl,
        pnl_pct: t.pnl_pct,
      }));
      const { error: tErr } = await admin.from('backtest_trades').insert(tradeRows);
      if (tErr) throw tErr;
    }

    // 完成 run
    await admin
      .from('backtest_runs')
      .update({
        status: 'done',
        metrics,
        equity_curve: equity,
        finished_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    return json({ run_id: run.id, status: 'done', metrics, trade_count: trades.length });
  } catch (e) {
    await admin
      .from('backtest_runs')
      .update({
        status: 'failed',
        error: (e as Error).message,
        finished_at: new Date().toISOString(),
      })
      .eq('id', run.id);
    return json({ run_id: run.id, error: (e as Error).message }, { status: 500 });
  }
});

// ---- helpers ----

async function fetchRange(
  exchange: string,
  symbol: string,
  tf: string,
  startSec: number,
  endSec: number
): Promise<Array<{ ts: number; o: number; h: number; l: number; c: number; v: number }>> {
  const all: Array<{ ts: number; o: number; h: number; l: number; c: number; v: number }> = [];
  let cursor = endSec;
  // 简单分页：每次 1000 根往前翻
  // 生产里建议先查 ohlc_bars，缺口再远程拉
  for (let i = 0; i < 50; i++) {
    const batch = await fetchCandles(exchange, {
      symbol,
      // deno-lint-ignore no-explicit-any
      timeframe: tf as any,
      limit: 1000,
      endTs: cursor,
    });
    if (batch.length === 0) break;
    const filtered = batch.filter((c) => c.ts >= startSec && c.ts <= endSec);
    all.push(...filtered);
    const oldest = Math.min(...batch.map((c) => c.ts));
    if (oldest <= startSec) break;
    cursor = oldest;
  }
  all.sort((a, b) => a.ts - b.ts);
  // 去重
  const out: typeof all = [];
  let last = -Infinity;
  for (const c of all) {
    if (c.ts !== last) {
      out.push(c);
      last = c.ts;
    }
  }
  return out;
}

// Stub 策略：与 Worker 里的 naiveMaCross 一致
// 生产中把这里替换成 import 的算法层函数
function runStrategyStub(
  candles: Array<{ ts: number; c: number }>,
  _params: Record<string, unknown>,
  initialCapital: number
) {
  const fast = sma(candles.map((c) => c.c), 5);
  const slow = sma(candles.map((c) => c.c), 20);

  const trades: Array<{
    side: 'long';
    entry_ts: number;
    entry_price: number;
    exit_ts: number;
    exit_price: number;
    qty: number;
    pnl: number;
    pnl_pct: number;
  }> = [];

  let pos: { entry_ts: number; entry_price: number } | null = null;
  let equity = initialCapital;
  const equityCurve: Array<{ ts: number; value: number }> = [];

  for (let i = 1; i < candles.length; i++) {
    const f = fast[i], s = slow[i], fp = fast[i - 1], sp = slow[i - 1];
    const price = candles[i].c;
    if (f != null && s != null && fp != null && sp != null) {
      if (fp <= sp && f > s && !pos) {
        pos = { entry_ts: candles[i].ts * 1000, entry_price: price };
      } else if (fp >= sp && f < s && pos) {
        const pnl = price - pos.entry_price;
        const pnl_pct = pnl / pos.entry_price;
        equity *= 1 + pnl_pct;
        trades.push({
          side: 'long',
          entry_ts: pos.entry_ts,
          entry_price: pos.entry_price,
          exit_ts: candles[i].ts * 1000,
          exit_price: price,
          qty: 1,
          pnl,
          pnl_pct,
        });
        pos = null;
      }
    }
    equityCurve.push({ ts: candles[i].ts, value: equity });
  }

  const wins = trades.filter((t) => t.pnl > 0).length;
  const grossWin = trades.filter((t) => t.pnl > 0).reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.pnl < 0).reduce((a, t) => a + t.pnl, 0));

  const metrics = {
    total_return: equity / initialCapital - 1,
    sharpe: 0,          // TODO
    max_drawdown: maxDrawdown(equityCurve.map((e) => e.value)),
    win_rate: trades.length ? wins / trades.length : 0,
    profit_factor: grossLoss === 0 ? (grossWin > 0 ? 999 : 0) : grossWin / grossLoss,
    trade_count: trades.length,
  };

  return { trades, equity: equityCurve, metrics };
}

function sma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

function maxDrawdown(values: number[]): number {
  let peak = -Infinity;
  let mdd = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    const dd = (peak - v) / peak;
    if (dd > mdd) mdd = dd;
  }
  return mdd;
}
