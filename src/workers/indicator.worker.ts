/**
 * Web Worker：把指标计算、策略回放搬离主线程。
 * - 用 Vite 的 `?worker` import 方式加载
 * - 协议见 src/lib/types.ts 的 WorkerRequest / WorkerResponse
 *
 * 被取消的请求（reqId 被标记）会直接丢弃结果。
 */
import { calculateIndicator, calculateMA } from '../algo/indicators';
import type { KLine, ChartTrade, WorkerRequest, WorkerResponse } from '../lib/types';

const canceled = new Set<string>();

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;

  if (msg.kind === 'cancel') {
    canceled.add(msg.reqId);
    return;
  }

  try {
    switch (msg.kind) {
      case 'calc_indicator': {
        const values = calculateIndicator(msg.name, msg.klines, msg.params);
        if (canceled.has(msg.reqId)) {
          canceled.delete(msg.reqId);
          return;
        }
        post({ kind: 'indicator_result', reqId: msg.reqId, values });
        break;
      }

      case 'run_strategy': {
        // TODO: 接入真实策略引擎；现在先做个占位的 naive MA cross
        // 这里和你算法层的 runStrategy 签名对齐即可
        const trades = naiveMaCross(msg.klines);
        if (canceled.has(msg.reqId)) {
          canceled.delete(msg.reqId);
          return;
        }
        post({
          kind: 'strategy_result',
          reqId: msg.reqId,
          trades,
          metrics: computeMetrics(trades),
        });
        break;
      }
    }
  } catch (err) {
    post({
      kind: 'error',
      reqId: msg.reqId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

function post(msg: WorkerResponse) {
  (self as unknown as Worker).postMessage(msg);
}

// -------- demo strategy (临时占位, 接入真实的再删掉) --------

function naiveMaCross(klines: KLine[]): ChartTrade[] {
  const fast = calculateMA(klines, 5).map((v) => v.ma);
  const slow = calculateMA(klines, 20).map((v) => v.ma);

  const trades: ChartTrade[] = [];
  let pos: { entry_ts: number; entry_price: number } | null = null;

  for (let i = 1; i < klines.length; i++) {
    const f = fast[i],
      s = slow[i],
      fPrev = fast[i - 1],
      sPrev = slow[i - 1];
    if (f == null || s == null || fPrev == null || sPrev == null) continue;

    const goldenCross = fPrev <= sPrev && f > s;
    const deathCross = fPrev >= sPrev && f < s;

    if (goldenCross && !pos) {
      pos = { entry_ts: klines[i].timestamp, entry_price: klines[i].close };
    } else if (deathCross && pos) {
      const exit_price = klines[i].close;
      const pnl = exit_price - pos.entry_price;
      trades.push({
        id: `t_${pos.entry_ts}`,
        symbol_code: 'DEMO',
        side: 'long',
        status: 'closed',
        entry_ts: pos.entry_ts,
        entry_price: pos.entry_price,
        exit_ts: klines[i].timestamp,
        exit_price,
        qty: 1,
        pnl,
        pnl_pct: pnl / pos.entry_price,
      });
      pos = null;
    }
  }
  return trades;
}

function computeMetrics(trades: ChartTrade[]) {
  const closed = trades.filter((t) => t.status === 'closed');
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const total_return = closed.reduce((s, t) => s + (t.pnl_pct ?? 0), 0);
  const grossWin = closed.filter((t) => (t.pnl ?? 0) > 0).reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(
    closed.filter((t) => (t.pnl ?? 0) < 0).reduce((s, t) => s + (t.pnl ?? 0), 0)
  );
  return {
    total_return,
    sharpe: 0, // TODO
    max_drawdown: 0, // TODO
    win_rate: closed.length ? wins / closed.length : 0,
    profit_factor: grossLoss === 0 ? (grossWin > 0 ? Infinity : 0) : grossWin / grossLoss,
    trade_count: closed.length,
  };
}

export {}; // 让 TS 把它当 module
