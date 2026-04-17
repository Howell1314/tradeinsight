/**
 * 基础技术指标 —— 纯函数实现，无副作用。
 *
 * 只包含形态识别需要的指标。
 * 全量指标（RSI/MACD/BOLL 等）由 KLineChart 内置提供，这里不重复实现。
 */

import type { Kline } from './chart'

/**
 * Simple Moving Average
 * 返回长度等于 klines 的数组，前 period-1 个为 NaN。
 */
export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN)
  if (period <= 0 || period > values.length) return out
  let sum = 0
  for (let i = 0; i < period; i++) sum += values[i]
  out[period - 1] = sum / period
  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period]
    out[i] = sum / period
  }
  return out
}

/**
 * Exponential Moving Average
 */
export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN)
  if (period <= 0 || period > values.length) return out
  const k = 2 / (period + 1)
  // seed with SMA
  let seed = 0
  for (let i = 0; i < period; i++) seed += values[i]
  out[period - 1] = seed / period
  for (let i = period; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k)
  }
  return out
}

/**
 * True Range 序列
 * TR = max(high-low, |high-prevClose|, |low-prevClose|)
 */
export function trueRange(klines: Kline[]): number[] {
  const out = new Array<number>(klines.length).fill(0)
  if (klines.length === 0) return out
  out[0] = klines[0].h - klines[0].l
  for (let i = 1; i < klines.length; i++) {
    const k = klines[i]
    const prevC = klines[i - 1].c
    out[i] = Math.max(
      k.h - k.l,
      Math.abs(k.h - prevC),
      Math.abs(k.l - prevC),
    )
  }
  return out
}

/**
 * Average True Range (Wilder 方式)
 * 前 period-1 个为 NaN。
 */
export function atr(klines: Kline[], period = 14): number[] {
  const tr = trueRange(klines)
  const out = new Array<number>(klines.length).fill(NaN)
  if (klines.length < period) return out
  // seed with simple average
  let sum = 0
  for (let i = 0; i < period; i++) sum += tr[i]
  out[period - 1] = sum / period
  // Wilder smoothing
  for (let i = period; i < klines.length; i++) {
    out[i] = (out[i - 1] * (period - 1) + tr[i]) / period
  }
  return out
}

/**
 * 计算 K 线实体大小（|close - open|）
 */
export function bodies(klines: Kline[]): number[] {
  return klines.map(k => Math.abs(k.c - k.o))
}

// ============================================================
// Worker 适配层 —— 接受 KLine（lib/types 格式，camelCase）并桥接到以上纯函数
// KLine { timestamp, open, high, low, close, volume }
// Kline { t, o, h, l, c, v }
// ============================================================

type KLineInput = { timestamp: number; open: number; high: number; low: number; close: number; volume: number }

/** KLine → Kline 转换，供内部复用 */
function toKline(k: KLineInput): Kline {
  return { t: k.timestamp, o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume }
}

export type IndicatorValues = Array<Record<string, number | null>>

/**
 * Worker 用：接受 KLine 数组，按名称分发到对应指标函数，返回通用格式。
 */
export function calculateIndicator(
  name: string,
  klines: KLineInput[],
  params: (number | string)[],
): IndicatorValues {
  const closes = klines.map(k => k.close)
  const period = typeof params[0] === 'number' ? params[0] : Number(params[0]) || 14
  switch (name.toUpperCase()) {
    case 'MA':
    case 'SMA':
      return sma(closes, period).map(v => ({ ma: isNaN(v) ? null : v }))
    case 'EMA':
      return ema(closes, period).map(v => ({ ema: isNaN(v) ? null : v }))
    case 'ATR': {
      const native = klines.map(toKline)
      return atr(native, period).map(v => ({ atr: isNaN(v) ? null : v }))
    }
    default:
      return klines.map(() => ({}))
  }
}

/**
 * Worker 用：MA 快捷函数，返回 { ma: number | null }[]
 */
export function calculateMA(klines: KLineInput[], period: number): Array<{ ma: number | null }> {
  const closes = klines.map(k => k.close)
  return sma(closes, period).map(v => ({ ma: isNaN(v) ? null : v }))
}
