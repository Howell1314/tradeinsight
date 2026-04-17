import type { KLine, OhlcRow } from './types';

/** Supabase 行 -> KLineChart KLineData */
export function rowToKLine(row: OhlcRow): KLine {
  return {
    timestamp: row.ts * 1000,
    open: row.o,
    high: row.h,
    low: row.l,
    close: row.c,
    volume: row.v,
  };
}

export function rowsToKLines(rows: OhlcRow[]): KLine[] {
  // 保证按时间升序，klinecharts 要求严格递增
  const out = rows.map(rowToKLine);
  out.sort((a, b) => a.timestamp - b.timestamp);
  return dedupeByTimestamp(out);
}

export function klineToRow(k: KLine, symbol: string, timeframe: string): OhlcRow {
  return {
    symbol_code: symbol,
    timeframe: timeframe as OhlcRow['timeframe'],
    ts: Math.floor(k.timestamp / 1000),
    o: k.open,
    h: k.high,
    l: k.low,
    c: k.close,
    v: k.volume,
  };
}

/** 合并新到的 k 线到已有数组（增量更新常用） */
export function mergeKLines(existing: KLine[], incoming: KLine[]): KLine[] {
  if (existing.length === 0) return dedupeByTimestamp([...incoming].sort((a, b) => a.timestamp - b.timestamp));
  if (incoming.length === 0) return existing;

  const map = new Map<number, KLine>();
  for (const k of existing) map.set(k.timestamp, k);
  for (const k of incoming) map.set(k.timestamp, k); // 后到覆盖（处理未收盘的最新一根）

  const merged = Array.from(map.values());
  merged.sort((a, b) => a.timestamp - b.timestamp);
  return merged;
}

function dedupeByTimestamp(klines: KLine[]): KLine[] {
  const out: KLine[] = [];
  let last = -Infinity;
  for (const k of klines) {
    if (k.timestamp === last) {
      out[out.length - 1] = k; // 用后面的值覆盖
    } else {
      out.push(k);
      last = k.timestamp;
    }
  }
  return out;
}

/** 给定 timeframe 返回毫秒步长，方便判断最新一根是否已收盘 */
export function timeframeToMs(tf: string): number {
  const map: Record<string, number> = {
    '1m': 60_000,
    '5m': 5 * 60_000,
    '15m': 15 * 60_000,
    '30m': 30 * 60_000,
    '1h': 60 * 60_000,
    '4h': 4 * 60 * 60_000,
    '1d': 24 * 60 * 60_000,
    '1w': 7 * 24 * 60 * 60_000,
  };
  return map[tf] ?? 60_000;
}
