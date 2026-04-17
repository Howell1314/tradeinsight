/**
 * ZigZag 折点提取
 *
 * 给定 K 线序列，找出显著的波峰与波谷（pivot）。
 * 后续谐波识别/供需区识别都依赖这个序列。
 *
 * 阈值采用 ATR 倍数而非固定百分比 —— 适配不同品种的波动率。
 */

import type { Kline, Pivot } from './chart'
import { atr } from './indicators'

interface ZigZagOptions {
  /** 阈值 = ATR × 此系数。默认 1.5 */
  atrMult?: number
  /** ATR 周期。默认 14 */
  atrPeriod?: number
  /** 用 high/low 作为 pivot 价格，还是用 close。默认 'hl'（谐波识别需要真实极值）*/
  source?: 'hl' | 'close'
}

/**
 * 提取 ZigZag 折点。
 *
 * 算法（state machine）：
 * - 维护"当前方向"（up/down）与"最近极值"
 * - 新 K 线越过极值 → 更新极值
 * - 新 K 线反向越过阈值 → 确认上一个极值为 pivot，翻转方向
 */
export function zigzag(klines: Kline[], opts: ZigZagOptions = {}): Pivot[] {
  const { atrMult = 1.5, atrPeriod = 14, source = 'hl' } = opts
  if (klines.length < atrPeriod + 2) return []

  const atrSeries = atr(klines, atrPeriod)
  const pivots: Pivot[] = []

  // 初始方向探测：在 ATR 可用之后，找第一个明确偏移
  let i0 = atrPeriod
  while (i0 < klines.length && !isFinite(atrSeries[i0])) i0++
  if (i0 >= klines.length - 1) return []

  // 初始化为第一根 K 线的 close
  const first = klines[i0]
  const hi = (k: Kline) => source === 'hl' ? k.h : k.c
  const lo = (k: Kline) => source === 'hl' ? k.l : k.c

  let dir: 'up' | 'down' | null = null
  let extIdx = i0
  let extPrice = hi(first) // 先假设可能是高点

  // 第一阶段：扫到第一个明确的反转
  let lowSeed = lo(first)
  let highSeed = hi(first)
  let lowSeedIdx = i0
  let highSeedIdx = i0

  for (let i = i0 + 1; i < klines.length; i++) {
    const k = klines[i]
    const thr = atrSeries[i] * atrMult
    if (!isFinite(thr)) continue

    if (hi(k) > highSeed) { highSeed = hi(k); highSeedIdx = i }
    if (lo(k) < lowSeed) { lowSeed = lo(k); lowSeedIdx = i }

    // 从 highSeed 下跌超过阈值 → 确认 highSeed 为第一个 pivot（向上方向启动）
    if (highSeed - lo(k) >= thr) {
      pivots.push({ idx: highSeedIdx, t: klines[highSeedIdx].t, price: highSeed, kind: 'high' })
      dir = 'down'
      extIdx = i
      extPrice = lo(k)
      break
    }
    // 从 lowSeed 上涨超过阈值 → 确认 lowSeed 为第一个 pivot
    if (hi(k) - lowSeed >= thr) {
      pivots.push({ idx: lowSeedIdx, t: klines[lowSeedIdx].t, price: lowSeed, kind: 'low' })
      dir = 'up'
      extIdx = i
      extPrice = hi(k)
      break
    }
  }

  if (dir === null) return pivots

  // 第二阶段：state machine
  for (let i = extIdx + 1; i < klines.length; i++) {
    const k = klines[i]
    const thr = atrSeries[i] * atrMult
    if (!isFinite(thr)) continue

    if (dir === 'up') {
      // 当前在找更高的高点
      if (hi(k) > extPrice) {
        extPrice = hi(k)
        extIdx = i
      } else if (extPrice - lo(k) >= thr) {
        // 从高点回落超过阈值 → 确认高点为 pivot，翻转
        pivots.push({ idx: extIdx, t: klines[extIdx].t, price: extPrice, kind: 'high' })
        dir = 'down'
        extPrice = lo(k)
        extIdx = i
      }
    } else {
      // dir === 'down'，找更低的低点
      if (lo(k) < extPrice) {
        extPrice = lo(k)
        extIdx = i
      } else if (hi(k) - extPrice >= thr) {
        pivots.push({ idx: extIdx, t: klines[extIdx].t, price: extPrice, kind: 'low' })
        dir = 'up'
        extPrice = hi(k)
        extIdx = i
      }
    }
  }

  // 最后一个 "临时" pivot（未确认，但对实时形态识别很重要）
  pivots.push({
    idx: extIdx,
    t: klines[extIdx].t,
    price: extPrice,
    kind: dir === 'up' ? 'high' : 'low',
  })

  return pivots
}
