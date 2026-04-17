/**
 * K 线 IndexedDB 缓存层
 *
 * 用 idb-keyval 简化 IndexedDB 操作。
 * 一个 key 对应一个 (symbol, timeframe) 的完整 K 线数组，按时间戳排序。
 *
 * 策略：
 *   - 读：先查缓存，hit 则直接返回；miss 回落到网络
 *   - 写：每次从网络拉取到新数据后，merge 到缓存
 *   - 失效：手动清除（用户点"重新加载"时）或在超过 TTL 后静默过期
 *
 * 空间管理：
 *   - 单个 key 最多存最近 N 根 K 线，超出则裁剪最老的
 *   - 不同周期的上限不同：1m 最多 5000 根，1D 最多 2000 根
 */

import { get, set, del, createStore, keys } from 'idb-keyval'
import type { Kline, Timeframe } from './chart'

const store = createStore('tradeinsight-chart', 'klines')

const MAX_PER_KEY: Record<Timeframe, number> = {
  '1m': 5000, '3m': 3000, '5m': 3000, '15m': 2500, '30m': 2000,
  '1h': 2000, '2h': 1500, '4h': 1500, '6h': 1200, '12h': 1000,
  '1D': 2000, '3D': 1200, '1W': 800, '1M': 400,
}

function makeKey(symbol: string, tf: Timeframe): string {
  return `${symbol}:${tf}`
}

interface CachedKlines {
  klines: Kline[]
  updated_at: number
}

/**
 * 读取缓存。返回 null 表示没有缓存。
 */
export async function readKlineCache(symbol: string, tf: Timeframe): Promise<CachedKlines | null> {
  try {
    const raw = await get<CachedKlines>(makeKey(symbol, tf), store)
    if (!raw || !Array.isArray(raw.klines)) return null
    return raw
  } catch (e) {
    console.warn('[klineCache] read failed', e)
    return null
  }
}

/**
 * 写入缓存。传入增量或全量 K 线，自动与现有数据 merge 并按时间戳排序。
 * 同一时间戳以新数据为准（覆盖旧数据）。
 */
export async function writeKlineCache(
  symbol: string,
  tf: Timeframe,
  incoming: Kline[],
): Promise<void> {
  if (incoming.length === 0) return
  try {
    const existing = await readKlineCache(symbol, tf)
    const merged = mergeKlines(existing?.klines ?? [], incoming)
    const capped = merged.length > MAX_PER_KEY[tf]
      ? merged.slice(merged.length - MAX_PER_KEY[tf])
      : merged
    await set(
      makeKey(symbol, tf),
      { klines: capped, updated_at: Date.now() } satisfies CachedKlines,
      store,
    )
  } catch (e) {
    console.warn('[klineCache] write failed', e)
  }
}

/**
 * 清除某个缓存
 */
export async function clearKlineCache(symbol: string, tf: Timeframe): Promise<void> {
  try {
    await del(makeKey(symbol, tf), store)
  } catch (e) {
    console.warn('[klineCache] clear failed', e)
  }
}

/**
 * 列出所有缓存 key（调试 / 管理界面用）
 */
export async function listCachedKeys(): Promise<string[]> {
  try {
    return (await keys(store)).map((k: IDBValidKey) => String(k))
  } catch {
    return []
  }
}

/**
 * Merge 两个 K 线数组，按时间戳去重，保留较新者。
 */
function mergeKlines(a: Kline[], b: Kline[]): Kline[] {
  if (a.length === 0) return [...b].sort((x, y) => x.t - y.t)
  if (b.length === 0) return a
  const map = new Map<number, Kline>()
  for (const k of a) map.set(k.t, k)
  for (const k of b) map.set(k.t, k)  // b 覆盖 a
  return Array.from(map.values()).sort((x, y) => x.t - y.t)
}
