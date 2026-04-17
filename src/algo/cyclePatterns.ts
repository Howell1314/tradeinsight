/**
 * 市场周期形态识别（Pellas / Manson 体系）
 *
 * 参考：Kelly Pellas 基于 Jeff Manson 教学整理的
 *       "Where are you in the market cycle?"（fibonites group）
 *
 * 与谐波形态的关键区别：
 *   - 使用更少的关键点（ABC 3 点 或 XYABC 5 点）
 *   - 每个形态有明确的 entry / stop / target 规则
 *   - 强调 8/50/200 MA 的上下文（本模块暂不强制校验，算法层只做 pivot 比率校验）
 *
 * MVP 实现：
 *   - 延续：ABC (38.2-61.8 回撤) / MomentumContinuation (23.6-31.8 回撤)
 *   - 反转：Double Bottom/Top (78.6/88.6 和 113 两种变体) / V-Bottom/Top (224-314)
 *
 * 尚未实现（P2）：
 *   - Head & Shoulders / Inverse H&S
 *   - Momentum 的"AB 更陡"量化
 */

import type {
  Kline,
  Pivot,
  CycleEvent,
  CyclePattern,
  PatternDirection,
  PatternPoint,
  Timeframe,
} from './chart'

interface ScanOptions {
  symbol: string
  timeframe: Timeframe
  lookbackPivots?: number
  tolerance?: number
  minConfidence?: number
}

const toPoint = (p: Pivot): PatternPoint => ({ t: p.t, price: p.price, idx: p.idx })

/**
 * 主扫描入口
 */
export function scanCyclePatterns(
  klines: Kline[],
  pivots: Pivot[],
  opts: ScanOptions,
): CycleEvent[] {
  if (pivots.length < 3) return []
  const {
    lookbackPivots = 15,
    tolerance = 0.05,
    minConfidence = 0.5,
  } = opts

  const tail = pivots.slice(-lookbackPivots)
  const events: CycleEvent[] = []

  // 延续形态（ABC / Momentum）—— 3 点窗口
  for (let i = 0; i <= tail.length - 3; i++) {
    const A = tail[i], B = tail[i + 1], C = tail[i + 2]
    const e = detectABCContinuation(A, B, C, klines, opts, tolerance, minConfidence)
    if (e) events.push(e)
  }

  // 反转形态（Double Top/Bottom / V）—— 5 点窗口
  for (let i = 0; i <= tail.length - 5; i++) {
    const X = tail[i], Y = tail[i + 1], A = tail[i + 2], B = tail[i + 3], C = tail[i + 4]
    const dt = detectDoubleTopBottom(X, Y, A, B, C, klines, opts, tolerance, minConfidence)
    if (dt) events.push(dt)
    const v = detectVReversal(X, Y, A, B, C, klines, opts, tolerance, minConfidence)
    if (v) events.push(v)
  }

  events.sort((a, b) => b.confidence - a.confidence)
  // 同一 C 点位只保留置信度最高的事件
  const bestByC = new Map<number, CycleEvent>()
  for (const e of events) {
    const cIdx = e.points.C?.idx ?? -1
    const existing = bestByC.get(cIdx)
    if (!existing || e.confidence > existing.confidence) {
      bestByC.set(cIdx, e)
    }
  }
  return [...bestByC.values()].sort((a, b) => b.confidence - a.confidence)
}

// ============================================================
// 延续形态：ABC 与 Momentum
// ============================================================

/**
 * ABC 延续识别
 *
 * 多头延续（direction = bullish）：
 *   A=low, B=high, C=low
 *   趋势上涨，C 回撤到 AB 的 38.2-61.8%
 *   入场：close above 8MA（此处近似：用 C 之后若干 K 线 close > B 的第一根作为入场）
 *   止损：C 点
 *   目标 1：(B-A)/2 + C（即回到 B 高度）
 *   目标 2：(B-A) + C（即 AB 的 1.0 延伸）
 *
 * 多头动能 (MomentumContinuation)：同结构但 BC 回撤 23.6-31.8%
 */
function detectABCContinuation(
  A: Pivot, B: Pivot, C: Pivot,
  klines: Kline[],
  opts: ScanOptions,
  tolerance: number,
  minConfidence: number,
): CycleEvent | null {
  // 严格交替
  if (A.kind === B.kind || B.kind === C.kind) return null
  // 多头 ABC: A=low, B=high, C=low，A < C < B
  // 空头 ABC: A=high, B=low, C=high，A > C > B
  let direction: PatternDirection
  if (A.kind === 'low' && B.kind === 'high' && C.kind === 'low'
      && A.price < C.price && C.price < B.price) {
    direction = 'bullish'
  } else if (A.kind === 'high' && B.kind === 'low' && C.kind === 'high'
             && A.price > C.price && C.price > B.price) {
    direction = 'bearish'
  } else {
    return null
  }

  const ab = Math.abs(B.price - A.price)
  const bc = Math.abs(C.price - B.price)
  if (ab === 0) return null
  const bcRatio = bc / ab

  // 判定是 Momentum 还是 ABC
  const pad = tolerance
  let pattern: CyclePattern
  let ideal: number
  if (bcRatio >= 0.236 - pad && bcRatio <= 0.318 + pad) {
    pattern = 'MomentumContinuation'
    ideal = 0.277 // (0.236+0.318)/2
  } else if (bcRatio >= 0.382 - pad && bcRatio <= 0.618 + pad) {
    pattern = 'ABC'
    ideal = 0.500
  } else {
    return null
  }

  // 置信度：距离 ideal 越近越高
  const dev = Math.abs(bcRatio - ideal) / ideal
  const confidence = Math.max(0, 1 - dev)
  if (confidence < minConfidence) return null

  // 入场：C 之后价格突破 B 视为入场（近似规则，无 MA 依赖）
  const entry = B.price
  const stop = C.price
  const target1 = direction === 'bullish'
    ? C.price + ab * 1.27
    : C.price - ab * 1.27
  const target2 = direction === 'bullish'
    ? C.price + ab * 1.618
    : C.price - ab * 1.618

  const evt: CycleEvent = {
    id: `cycle__${opts.symbol}__${opts.timeframe}__${pattern}__${C.t}`,
    symbol: opts.symbol,
    timeframe: opts.timeframe,
    pattern,
    direction,
    points: { A: toPoint(A), B: toPoint(B), C: toPoint(C) },
    entry, stop, target1, target2,
    confidence,
    ratios: { bc_ab: bcRatio },
    detected_at: klines[klines.length - 1]?.t ?? C.t,
    status: 'active',
  }
  return evt
}

// ============================================================
// 反转形态：Double Top/Bottom
// ============================================================

/**
 * Double Bottom / Double Top 识别
 *
 * 多头双底（bullish）：
 *   X=high, Y=low(第一底), A=high(反弹), B=low(第二底), C=high(突破前的小回调)
 *   关键比率：YA/|X-Y| 任意（反弹 high A）
 *             B 与 Y 关系决定变体：
 *               经典 Double Bottom：YB ≈ 0（B ≈ Y）→ |A-B|/|A-Y| ∈ [0.786, 0.886]
 *               Double Bottom 113：B 略低于 Y（破前低）→ |A-B|/|A-Y| ∈ [1.10, 1.16]
 *   目标：XY 长度的 1.618 或 2.24（projection up from B）
 *   止损：B
 *   入场：close above 8MA 或 break of A
 *
 * 空头对称。
 */
function detectDoubleTopBottom(
  X: Pivot, Y: Pivot, A: Pivot, B: Pivot, C: Pivot,
  klines: Kline[],
  opts: ScanOptions,
  tolerance: number,
  minConfidence: number,
): CycleEvent | null {
  // 严格交替
  if (X.kind === Y.kind || Y.kind === A.kind || A.kind === B.kind || B.kind === C.kind) return null

  let direction: PatternDirection
  // 多头双底：X=high, Y=low, A=high, B=low, C=high，Y~B 价位相近
  if (X.kind === 'high' && Y.kind === 'low' && A.kind === 'high' && B.kind === 'low' && C.kind === 'high'
      && X.price > Y.price && A.price > Y.price && A.price > B.price && C.price > B.price) {
    direction = 'bullish'
  } else if (X.kind === 'low' && Y.kind === 'high' && A.kind === 'low' && B.kind === 'high' && C.kind === 'low'
             && X.price < Y.price && A.price < Y.price && A.price < B.price && C.price < B.price) {
    direction = 'bearish'
  } else {
    return null
  }

  // 计算 |A-B|/|A-Y|（B 相对于 YA 的位置）
  const ya = Math.abs(A.price - Y.price)
  const ab = Math.abs(A.price - B.price)
  if (ya === 0) return null
  const abOverYa = ab / ya

  // 判定变体
  let pattern: CyclePattern
  let ideal: number
  const pad = tolerance
  if (abOverYa >= 0.786 - pad && abOverYa <= 0.886 + pad) {
    pattern = direction === 'bullish' ? 'DoubleBottom_786' : 'DoubleTop_786'
    ideal = 0.836
  } else if (abOverYa >= 1.10 - pad && abOverYa <= 1.16 + pad) {
    pattern = direction === 'bullish' ? 'DoubleBottom_113' : 'DoubleTop_113'
    ideal = 1.13
  } else {
    return null
  }

  const dev = Math.abs(abOverYa - ideal) / ideal
  const confidence = Math.max(0, 1 - dev)
  if (confidence < minConfidence) return null

  // 交易规则
  const entry = A.price  // break of A = confirmation
  const stop = B.price
  const xy = Math.abs(X.price - Y.price)
  // 目标：XY 投影
  const target1 = direction === 'bullish' ? B.price + xy * 1.0 : B.price - xy * 1.0
  const target2 = direction === 'bullish' ? B.price + xy * 1.618 : B.price - xy * 1.618

  return {
    id: `cycle__${opts.symbol}__${opts.timeframe}__${pattern}__${B.t}`,
    symbol: opts.symbol,
    timeframe: opts.timeframe,
    pattern,
    direction,
    points: { X: toPoint(X), Y: toPoint(Y), A: toPoint(A), B: toPoint(B), C: toPoint(C) },
    entry, stop, target1, target2,
    confidence,
    ratios: { ab_ya: abOverYa, xy },
    detected_at: klines[klines.length - 1]?.t ?? C.t,
    status: 'active',
  }
}

// ============================================================
// 反转形态：V-Top / V-Bottom
// ============================================================

/**
 * V-Bottom / V-Top 识别
 *
 * 多头 V-Bottom（深度回撤但迅速反转）：
 *   X=high, Y=low, A=high, B=low, C=high
 *   B 远低于 Y：|A-B|/|A-Y| ∈ [2.24, 3.14]
 *
 * 非常激进的形态，常见于恐慌性抛售后的快速反转。
 */
function detectVReversal(
  X: Pivot, Y: Pivot, A: Pivot, B: Pivot, C: Pivot,
  klines: Kline[],
  opts: ScanOptions,
  tolerance: number,
  minConfidence: number,
): CycleEvent | null {
  if (X.kind === Y.kind || Y.kind === A.kind || A.kind === B.kind || B.kind === C.kind) return null

  let direction: PatternDirection
  if (X.kind === 'high' && Y.kind === 'low' && A.kind === 'high' && B.kind === 'low' && C.kind === 'high'
      && B.price < Y.price) {
    direction = 'bullish'
  } else if (X.kind === 'low' && Y.kind === 'high' && A.kind === 'low' && B.kind === 'high' && C.kind === 'low'
             && B.price > Y.price) {
    direction = 'bearish'
  } else {
    return null
  }

  const ya = Math.abs(A.price - Y.price)
  const ab = Math.abs(A.price - B.price)
  if (ya === 0) return null
  const abOverYa = ab / ya

  const pad = tolerance
  const idealRatios = [2.24, 2.618, 3.14]
  let bestIdeal = 0
  let bestDev = Infinity
  for (const r of idealRatios) {
    const d = Math.abs(abOverYa - r) / r
    if (d < bestDev) { bestDev = d; bestIdeal = r }
  }
  if (abOverYa < 2.24 - pad || abOverYa > 3.14 + pad) return null
  const confidence = Math.max(0, 1 - bestDev)
  if (confidence < minConfidence) return null

  const pattern: CyclePattern = direction === 'bullish' ? 'VBottom' : 'VTop'
  const entry = A.price
  const stop = B.price
  const xy = Math.abs(X.price - Y.price)
  const target1 = direction === 'bullish' ? B.price + xy * 0.786 : B.price - xy * 0.786
  const target2 = direction === 'bullish' ? B.price + xy * 1.0 : B.price - xy * 1.0

  return {
    id: `cycle__${opts.symbol}__${opts.timeframe}__${pattern}__${B.t}`,
    symbol: opts.symbol,
    timeframe: opts.timeframe,
    pattern,
    direction,
    points: { X: toPoint(X), Y: toPoint(Y), A: toPoint(A), B: toPoint(B), C: toPoint(C) },
    entry, stop, target1, target2,
    confidence,
    ratios: { ab_ya: abOverYa, ideal: bestIdeal },
    detected_at: klines[klines.length - 1]?.t ?? C.t,
    status: 'active',
  }
}
