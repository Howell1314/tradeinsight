/**
 * 谐波形态模板 —— 每种形态的四个比率范围。
 *
 * 参考：Scott Carney "The Harmonic Trader" (1999)
 *       各种公开的谐波交易资料
 *
 * 比率定义：
 *   XA 是第一段（X→A）
 *   AB = |B.price - A.price| / |A.price - X.price|   (AB 占 XA 的比例)
 *   BC = |C.price - B.price| / |B.price - A.price|
 *   CD = |D.price - C.price| / |C.price - B.price|
 *   AD = |D.price - A.price| / |A.price - X.price|
 */

import type { HarmonicPattern } from './chart'

export interface RatioRange {
  min: number
  max: number
  /** 用于置信度计算的理想值 */
  ideal: number
}

export interface HarmonicTemplate {
  name: HarmonicPattern
  displayName: string
  description: string
  ab_xa: RatioRange
  bc_ab: RatioRange
  cd_bc: RatioRange
  ad_xa: RatioRange
}

const r = (min: number, max: number, ideal: number): RatioRange => ({ min, max, ideal })

/**
 * 九种经典谐波形态。
 *
 * 注意：这里的范围没有额外加容差。实际匹配时由 `harmonic.ts`
 * 通过 `ChartPrefs.harmonic_tolerance` 再做一次放宽。
 */
export const TEMPLATES: HarmonicTemplate[] = [
  {
    name: 'Gartley',
    displayName: '加特利',
    description: 'AB=0.618·XA, AD=0.786·XA —— 最经典的 M/W 反转形态',
    ab_xa: r(0.618, 0.618, 0.618),
    bc_ab: r(0.382, 0.886, 0.618),
    cd_bc: r(1.272, 1.618, 1.414),
    ad_xa: r(0.786, 0.786, 0.786),
  },
  {
    name: 'Bat',
    displayName: '蝙蝠',
    description: 'AB=0.382~0.5·XA, AD=0.886·XA —— 深度回撤反转',
    ab_xa: r(0.382, 0.500, 0.500),
    bc_ab: r(0.382, 0.886, 0.500),
    cd_bc: r(1.618, 2.618, 2.000),
    ad_xa: r(0.886, 0.886, 0.886),
  },
  {
    name: 'AltBat',
    displayName: '备用蝙蝠',
    description: '变体蝙蝠：AB=0.382·XA, AD=1.13·XA（扩展）',
    ab_xa: r(0.382, 0.382, 0.382),
    bc_ab: r(0.382, 0.886, 0.500),
    cd_bc: r(2.000, 3.618, 2.618),
    ad_xa: r(1.13, 1.13, 1.13),
  },
  {
    name: 'Butterfly',
    displayName: '蝴蝶',
    description: 'AB=0.786·XA, AD=1.27·XA —— 扩展反转形态',
    ab_xa: r(0.786, 0.786, 0.786),
    bc_ab: r(0.382, 0.886, 0.618),
    cd_bc: r(1.618, 2.24, 1.85),
    ad_xa: r(1.27, 1.414, 1.27),
  },
  {
    name: 'Crab',
    displayName: '螃蟹',
    description: 'AD=1.618·XA —— 深度扩展的反转，PRZ 极远',
    ab_xa: r(0.382, 0.618, 0.500),
    bc_ab: r(0.382, 0.886, 0.618),
    cd_bc: r(2.618, 3.618, 3.14),
    ad_xa: r(1.618, 1.618, 1.618),
  },
  {
    name: 'DeepCrab',
    displayName: '深海螃蟹',
    description: '变体螃蟹：AB=0.886·XA, AD=1.618·XA',
    ab_xa: r(0.886, 0.886, 0.886),
    bc_ab: r(0.382, 0.886, 0.500),
    cd_bc: r(2.24, 3.618, 2.618),
    ad_xa: r(1.618, 1.618, 1.618),
  },
  {
    name: 'Shark',
    displayName: '鲨鱼',
    description: '注意：鲨鱼用 O/X/A/B/C 五点命名，此处复用 X/A/B/C/D 对应 O/X/A/B/C',
    ab_xa: r(1.13, 1.618, 1.382),
    bc_ab: r(1.618, 2.24, 2.000),
    cd_bc: r(0.886, 1.13, 1.000),
    ad_xa: r(0.886, 1.13, 1.000),
  },
  {
    name: 'Cypher',
    displayName: '赛福',
    description: 'BC 扩展至 XA 的 1.13~1.414，D 回撤到 XA 的 0.786',
    ab_xa: r(0.382, 0.618, 0.500),
    bc_ab: r(1.272, 1.414, 1.382),
    cd_bc: r(0.786, 0.786, 0.786),
    ad_xa: r(0.786, 0.786, 0.786),
  },
  // ABCD 没有 X 点，我们填一个虚拟的"视觉 X"，识别时特殊处理。
  // 这里先不放进通用模板，识别逻辑里单独实现。
]

/**
 * 根据 4 个比率，计算与模板的匹配置信度。
 * 返回 0..1，1 = 完美匹配；0 = 不匹配。
 * 使用加权平均偏差法。
 *
 * tolerance 是额外放宽系数，比如 0.05 = 每个范围上下各放宽 5%。
 */
export function matchTemplate(
  template: HarmonicTemplate,
  ratios: { ab_xa: number; bc_ab: number; cd_bc: number; ad_xa: number },
  tolerance = 0.05,
): number {
  const score = (v: number, range: RatioRange): number => {
    // 放宽范围
    const pad = Math.max(range.ideal * tolerance, 0.01)
    const min = range.min - pad
    const max = range.max + pad
    if (v < min || v > max) return 0
    // 越接近 ideal 越高分
    const dev = Math.abs(v - range.ideal) / Math.max(range.ideal, 0.01)
    return Math.max(0, 1 - dev)
  }

  const s1 = score(ratios.ab_xa, template.ab_xa)
  const s2 = score(ratios.bc_ab, template.bc_ab)
  const s3 = score(ratios.cd_bc, template.cd_bc)
  const s4 = score(ratios.ad_xa, template.ad_xa)

  // AD/XA 是最重要的（决定 PRZ 位置），加大权重
  const weighted = s1 * 0.2 + s2 * 0.2 + s3 * 0.2 + s4 * 0.4

  // 任一项为 0 则整体判定为不匹配
  if (s1 === 0 || s2 === 0 || s3 === 0 || s4 === 0) return 0

  return weighted
}
