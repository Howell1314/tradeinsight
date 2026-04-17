/**
 * 谐波形态扫描器
 *
 * 输入：K 线序列 + ZigZag 折点
 * 输出：识别出的所有 HarmonicEvent
 *
 * 逻辑：
 *   1. 枚举最近 N 个折点窗口中所有严格交替的 5 点（低高低高低 或 高低高低高）
 *   2. 对每个候选，计算 4 个比率
 *   3. 依次对所有模板做匹配，取最高分的模板
 *   4. 如果分数超过阈值，产出一个 HarmonicEvent
 */

import type {
  Kline,
  Pivot,
  HarmonicEvent,
  HarmonicPattern,
  PatternDirection,
  PatternPoint,
  Timeframe,
} from './chart'
import { TEMPLATES, matchTemplate } from './templates'

interface ScanOptions {
  symbol: string
  timeframe: Timeframe
  /** 从最近 N 个折点往前枚举，默认 20（够捕获绝大部分形态）*/
  lookbackPivots?: number
  /** 谐波比率容差，0.05 = 5% */
  tolerance?: number
  /** 最低置信度阈值，低于此不产出事件 */
  minConfidence?: number
}

/**
 * 主扫描函数
 */
export function scanHarmonics(
  klines: Kline[],
  pivots: Pivot[],
  opts: ScanOptions,
): HarmonicEvent[] {
  const {
    symbol,
    timeframe,
    lookbackPivots = 20,
    tolerance = 0.05,
    minConfidence = 0.5,
  } = opts

  if (pivots.length < 5) return []

  const events: HarmonicEvent[] = []
  const tailPivots = pivots.slice(-lookbackPivots)

  // 按 D 点（最右侧）分组，每个 D 只取最佳匹配
  const bestByD = new Map<number, HarmonicEvent>()

  // 枚举所有 5 点组合（保持时间顺序 X<A<B<C<D）
  for (let iX = 0; iX < tailPivots.length - 4; iX++) {
    const X = tailPivots[iX]
    for (let iA = iX + 1; iA < tailPivots.length - 3; iA++) {
      const A = tailPivots[iA]
      if (A.kind === X.kind) continue // 必须严格交替
      for (let iB = iA + 1; iB < tailPivots.length - 2; iB++) {
        const B = tailPivots[iB]
        if (B.kind === A.kind) continue
        for (let iC = iB + 1; iC < tailPivots.length - 1; iC++) {
          const C = tailPivots[iC]
          if (C.kind === B.kind) continue
          for (let iD = iC + 1; iD < tailPivots.length; iD++) {
            const D = tailPivots[iD]
            if (D.kind === C.kind) continue

            const evt = tryMatch(X, A, B, C, D, klines, symbol, timeframe, tolerance, minConfidence)
            if (!evt) continue

            const existing = bestByD.get(D.idx)
            if (!existing || evt.confidence > existing.confidence) {
              bestByD.set(D.idx, evt)
            }
          }
        }
      }
    }
  }

  events.push(...bestByD.values())
  // 按置信度降序
  events.sort((a, b) => b.confidence - a.confidence)
  return events
}

/**
 * 对一个 5 点候选做模板匹配
 */
function tryMatch(
  X: Pivot, A: Pivot, B: Pivot, C: Pivot, D: Pivot,
  klines: Kline[],
  symbol: string,
  timeframe: Timeframe,
  tolerance: number,
  minConfidence: number,
): HarmonicEvent | null {
  // 方向判定：
  // 看涨形态：X 高，A 低，B 高，C 低，D 低（M 形但以低点 D 结尾）
  //   严格来说：X=high, A=low, B=high, C=low, D=low → 但 A/C/D 都是 low
  //   这与"严格交替"矛盾，说明初学谐波常见混淆。
  //   正确定义（以看涨 Gartley 为例）：
  //     XA 下降，AB 回升，BC 下降，CD 上升
  //     kind: X=high, A=low, B=high, C=low, D=high？不对。
  //   再查：
  //     看涨 Gartley：X high, A low, B high, C low, D low（D 比 A 更高，即浅底）
  //     也就是说 D 仍是低点，但比 A 高（A=XA 回撤 0.786 的位置）
  //   这意味着 D 和 A 都是低点，不能严格交替。
  //
  // 实现策略：放宽"严格交替"要求，只强制：
  //   - 看涨：X=high, A=low, B=high, C=low, D=low（或仅需 X 高 D 低的反转设置）
  //   - 看跌：对称
  const direction: PatternDirection | null = inferDirection(X, A, B, C, D)
  if (!direction) return null

  const ratios = computeRatios(X, A, B, C, D)
  if (!ratios) return null

  let bestTemplate: typeof TEMPLATES[number] | null = null
  let bestScore = 0

  for (const tpl of TEMPLATES) {
    const s = matchTemplate(tpl, ratios, tolerance)
    if (s > bestScore) {
      bestScore = s
      bestTemplate = tpl
    }
  }

  if (!bestTemplate || bestScore < minConfidence) return null

  const prz = computePRZ(X, A, bestTemplate.name, direction)

  const evt: HarmonicEvent = {
    id: `harmonic__${symbol}__${timeframe}__${bestTemplate.name}__${D.t}__${X.t}`,
    symbol,
    timeframe,
    pattern: bestTemplate.name,
    direction,
    points: {
      X: toPoint(X),
      A: toPoint(A),
      B: toPoint(B),
      C: toPoint(C),
      D: toPoint(D),
    },
    prz,
    confidence: bestScore,
    ratios,
    detected_at: klines[klines.length - 1]?.t ?? D.t,
    status: 'active',
  }
  return evt
}

function toPoint(p: Pivot): PatternPoint {
  return { t: p.t, price: p.price, idx: p.idx }
}

/**
 * 判定形态方向。
 *
 * 谐波形态的几何（以看涨 Gartley 为例）：
 *   X=低, A=高, B=低, C=高, D=低  → 反转买点在 D
 *   XA 是上涨主波，D 是最终回撤到 0.786·XA 的位置（仍是低点）
 *   Crab 等"扩展"变体 D 可能低于 X
 *
 * 看跌对称：X=高, A=低, B=高, C=低, D=高 → 反转卖点在 D
 *
 * 因此：X 和 D 必须同 kind。同 low → bullish；同 high → bearish。
 */
function inferDirection(X: Pivot, A: Pivot, _B: Pivot, _C: Pivot, D: Pivot): PatternDirection | null {
  if (X.kind !== D.kind) return null
  // 并校验 A 在"另一侧"
  if (X.kind === 'low' && A.kind === 'high' && X.price < A.price) return 'bullish'
  if (X.kind === 'high' && A.kind === 'low' && X.price > A.price) return 'bearish'
  return null
}

/**
 * 计算四个谐波比率。
 * 任何一个分母为 0 则返回 null（退化形态）。
 */
function computeRatios(X: Pivot, A: Pivot, B: Pivot, C: Pivot, D: Pivot): {
  ab_xa: number
  bc_ab: number
  cd_bc: number
  ad_xa: number
} | null {
  const xa = Math.abs(A.price - X.price)
  const ab = Math.abs(B.price - A.price)
  const bc = Math.abs(C.price - B.price)
  const cd = Math.abs(D.price - C.price)
  const ad = Math.abs(D.price - A.price)

  if (xa === 0 || ab === 0 || bc === 0) return null

  return {
    ab_xa: ab / xa,
    bc_ab: bc / ab,
    cd_bc: cd / bc,
    ad_xa: ad / xa,
  }
}

/**
 * 计算潜在反转区 (PRZ)
 *
 * 对看涨：XA 上涨，D 应位于 A 下方 `ad_xa·XA` 处（回撤到 A 与 X 之间）
 * 对看跌：XA 下跌，D 应位于 A 上方
 */
function computePRZ(
  X: Pivot, A: Pivot,
  pattern: HarmonicPattern,
  direction: PatternDirection,
): { high: number; low: number } {
  const tpl = TEMPLATES.find(t => t.name === pattern)
  if (!tpl) return { high: 0, low: 0 }
  const xa = Math.abs(A.price - X.price)

  const priceAtRatio = (ratio: number) =>
    direction === 'bullish' ? A.price - xa * ratio : A.price + xa * ratio

  const p1 = priceAtRatio(tpl.ad_xa.min)
  const p2 = priceAtRatio(tpl.ad_xa.max)
  return {
    high: Math.max(p1, p2),
    low: Math.min(p1, p2),
  }
}
