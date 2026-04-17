/**
 * TradeInsight 分析图表模块 · 类型定义
 *
 * 这些类型与现有 types/trade.ts 完全独立，不污染现有类型系统。
 * 如需把 Trade 关联到图表（显示进出场），在图表模块内 import Trade 即可。
 */

// ============================================================
// 基础
// ============================================================

export type Timeframe =
  | '1m' | '3m' | '5m' | '15m' | '30m'
  | '1h' | '2h' | '4h' | '6h' | '12h'
  | '1D' | '3D' | '1W' | '1M'

export const TIMEFRAME_LIST: Timeframe[] = [
  '1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W',
]

/** Binance interval 映射 */
export const TIMEFRAME_TO_BINANCE: Record<Timeframe, string> = {
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '12h': '12h',
  '1D': '1d', '3D': '3d', '1W': '1w', '1M': '1M',
}

/** 每根 K 线的毫秒数（近似，月度可能不精确） */
export const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1m': 60_000, '3m': 180_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
  '1h': 3_600_000, '2h': 7_200_000, '4h': 14_400_000, '6h': 21_600_000, '12h': 43_200_000,
  '1D': 86_400_000, '3D': 259_200_000, '1W': 604_800_000, '1M': 2_592_000_000,
}

// ============================================================
// K 线
// ============================================================

/** 统一 OHLCV，所有市场的数据都归一化成这个 */
export interface Kline {
  /** 开盘时间戳（毫秒）*/
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

// ============================================================
// 形态
// ============================================================

export type HarmonicPattern =
  | 'Gartley' | 'Bat' | 'AltBat' | 'Butterfly'
  | 'Crab' | 'DeepCrab' | 'Shark' | 'Cypher' | 'ABCD'

export type PatternDirection = 'bullish' | 'bearish'

// ============================================================
// 市场周期形态（Pellas / Manson 体系）
// ============================================================

export type CyclePattern =
  // 延续形态
  | 'ABC'                        // 38.2-61.8 回撤
  | 'MomentumContinuation'       // 23.6-31.8 回撤（动能强）
  // 反转形态
  | 'DoubleBottom_786'           // 78.6/88.6 of XY
  | 'DoubleTop_786'
  | 'DoubleBottom_113'           // 113 of XY（二次探底略破前低）
  | 'DoubleTop_113'
  | 'VBottom'                    // 224/261.8/314 of XY
  | 'VTop'

/**
 * 市场周期形态识别事件
 * 比 HarmonicEvent 多了明确的交易建议（入场/止损/目标）
 */
export interface CycleEvent {
  id: string
  symbol: string
  timeframe: Timeframe
  pattern: CyclePattern
  direction: PatternDirection

  /** 形态关键点位（延续形态：A/B/C；反转形态额外含 X/Y）*/
  points: Partial<Record<'X' | 'Y' | 'A' | 'B' | 'C', PatternPoint>>

  /** 建议入场价（close above/below 8MA 或 break of B）*/
  entry: number
  /** 止损价 */
  stop: number
  /** 第一目标 */
  target1: number
  /** 第二目标（可选）*/
  target2?: number

  /** 用于展示与排序的置信度 0..1 */
  confidence: number
  /** 识别时用到的关键比率 */
  ratios: Record<string, number>

  detected_at: number
  status: 'active' | 'triggered' | 'invalidated'
}

export interface PatternPoint {
  /** 时间戳 ms */
  t: number
  price: number
  /** 在 K 线数组中的索引 */
  idx: number
}

export interface HarmonicEvent {
  id: string
  symbol: string
  timeframe: Timeframe
  pattern: HarmonicPattern
  direction: PatternDirection
  points: {
    X: PatternPoint
    A: PatternPoint
    B: PatternPoint
    C: PatternPoint
    D: PatternPoint
  }
  /** 潜在反转区 */
  prz: { high: number; low: number }
  /** 置信度 0..1，基于比率与理想值的偏差 */
  confidence: number
  /** 各边比率（用于调试/展示）*/
  ratios: {
    ab_xa: number
    bc_ab: number
    cd_bc: number
    ad_xa: number
  }
  detected_at: number
  status: 'active' | 'triggered' | 'invalidated'
}

export type ZoneType = 'RBR' | 'DBD' | 'RBD' | 'DBR'

export interface SupplyDemandZone {
  id: string
  symbol: string
  timeframe: Timeframe
  type: ZoneType
  top: number
  bottom: number
  formed_at: number
  /** Base 范围内 K 线的索引范围 */
  base_range: [number, number]
  touches: number
  status: 'active' | 'broken'
}

// ============================================================
// 画线
// ============================================================

export type DrawingType =
  | 'trend' | 'horizontal' | 'vertical' | 'rect' | 'channel'
  | 'fib_retracement' | 'fib_extension' | 'xabcd' | 'zone' | 'text'

export interface DrawingPoint {
  t: number
  price: number
}

export interface ChartDrawing {
  id: string
  type: DrawingType
  points: DrawingPoint[]
  style?: {
    color?: string
    lineWidth?: number
    fillColor?: string
  }
  text?: string
  created_at: number
}

// ============================================================
// ZigZag 折点
// ============================================================

export interface Pivot {
  /** 索引 */
  idx: number
  /** 时间戳 */
  t: number
  /** 价格 */
  price: number
  /** 'high' = 波峰, 'low' = 波谷 */
  kind: 'high' | 'low'
}

// ============================================================
// 图表偏好（存 user_settings.chart_prefs）
// ============================================================

export interface ChartPrefs {
  default_timeframe: Timeframe
  pattern_auto_detect: boolean
  show_zones: boolean
  show_my_trades: boolean
  zigzag_atr_mult: number  // ZigZag 阈值 = ATR × 这个系数，默认 1.5
  harmonic_tolerance: number  // 谐波比率容差，默认 0.05 (=5%)
}

export const DEFAULT_CHART_PREFS: ChartPrefs = {
  default_timeframe: '1D',
  pattern_auto_detect: true,
  show_zones: true,
  show_my_trades: true,
  zigzag_atr_mult: 1.5,
  harmonic_tolerance: 0.05,
}
