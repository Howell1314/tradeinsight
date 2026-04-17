/**
 * 供需区（Supply & Demand Zone）识别
 *
 * 四种基础形态：
 *   RBR (Rally-Base-Rally)   — 多头继续 → 需求区
 *   DBR (Drop-Base-Rally)    — 多头反转 → 需求区
 *   DBD (Drop-Base-Drop)     — 空头继续 → 供给区
 *   RBD (Rally-Base-Drop)    — 空头反转 → 供给区
 *
 * 识别逻辑：
 *   1. 找"引擎 K 线"：实体 ≥ atrMult × ATR 的强动能 K 线
 *   2. 向前回溯 1..maxBaseBars 根，找到连续的"盘整 K 线"（实体 < baseMult × ATR）
 *   3. 盘整区域的 high/low 即为区间边界
 *   4. 根据引擎前后方向判定 RBR/DBR/DBD/RBD 类型
 */

import type { Kline, SupplyDemandZone, Timeframe, ZoneType } from './chart'
import { atr, bodies } from './indicators'

interface ScanZonesOptions {
  symbol: string
  timeframe: Timeframe
  /** 引擎 K 线阈值 = atrMult × ATR，默认 2.0 */
  engineAtrMult?: number
  /** 盘整 K 线阈值 = baseMult × ATR，默认 0.5 */
  baseAtrMult?: number
  /** Base 最大 K 线数，默认 5 */
  maxBaseBars?: number
  /** Base 最小 K 线数，默认 1 */
  minBaseBars?: number
}

export function scanSupplyDemandZones(
  klines: Kline[],
  opts: ScanZonesOptions,
): SupplyDemandZone[] {
  const {
    symbol,
    timeframe,
    engineAtrMult = 2.0,
    baseAtrMult = 0.5,
    maxBaseBars = 5,
    minBaseBars = 1,
  } = opts

  if (klines.length < 20) return []

  const atrSeries = atr(klines, 14)
  const bodySeries = bodies(klines)
  const zones: SupplyDemandZone[] = []

  for (let i = 15; i < klines.length - 1; i++) {
    const engineAtr = atrSeries[i]
    if (!isFinite(engineAtr) || engineAtr === 0) continue
    if (bodySeries[i] < engineAtr * engineAtrMult) continue

    const engine = klines[i]
    const engineIsUp = engine.c > engine.o // 阳引擎
    const engineIsDown = engine.c < engine.o

    // 向前回溯找 base
    const baseIndices: number[] = []
    for (let j = i - 1; j >= Math.max(0, i - maxBaseBars); j--) {
      const jatr = atrSeries[j]
      if (!isFinite(jatr) || jatr === 0) break
      if (bodySeries[j] < jatr * baseAtrMult) {
        baseIndices.unshift(j)
      } else {
        break
      }
    }
    if (baseIndices.length < minBaseBars) continue

    // base 前一根（引发形成 base 的 K 线）
    const priorIdx = baseIndices[0] - 1
    if (priorIdx < 0) continue
    const prior = klines[priorIdx]
    const priorIsUp = prior.c > prior.o
    const priorIsDown = prior.c < prior.o

    // 判定类型
    let type: ZoneType | null = null
    if (priorIsUp && engineIsUp) type = 'RBR'
    else if (priorIsDown && engineIsUp) type = 'DBR'
    else if (priorIsDown && engineIsDown) type = 'DBD'
    else if (priorIsUp && engineIsDown) type = 'RBD'
    if (!type) continue

    // 区间边界取 base 所有 K 线的 high/low
    const baseKlines = baseIndices.map(k => klines[k])
    const top = Math.max(...baseKlines.map(k => k.h))
    const bottom = Math.min(...baseKlines.map(k => k.l))

    // 统计后续触碰
    let touches = 0
    let broken = false
    for (let k = i + 1; k < klines.length; k++) {
      const kl = klines[k]
      // 供给区：价格从下方触碰
      if (type === 'DBD' || type === 'RBD') {
        if (kl.h >= bottom && kl.l <= top) touches++
        if (kl.c > top) { broken = true; break }
      } else {
        // 需求区：价格从上方触碰
        if (kl.l <= top && kl.h >= bottom) touches++
        if (kl.c < bottom) { broken = true; break }
      }
    }

    zones.push({
      id: `zone__${symbol}__${timeframe}__${type}__${engine.t}`,
      symbol,
      timeframe,
      type,
      top,
      bottom,
      formed_at: engine.t,
      base_range: [baseIndices[0], baseIndices[baseIndices.length - 1]],
      touches,
      status: broken ? 'broken' : 'active',
    })
  }

  return zones
}
