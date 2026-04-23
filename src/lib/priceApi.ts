import type { AssetClass } from '../types/trade'
import { invokeFn } from './supabase'

/** Fetch latest price for a symbol. Returns null on failure (silent degradation). */
export async function fetchPrice(symbol: string, assetClass: AssetClass): Promise<number | null> {
  try {
    if (assetClass === 'crypto') return await fetchCryptoPrice(symbol)
    // Option / CFD / futures: no reliable public quote source — force manual input.
    if (assetClass === 'option' || assetClass === 'cfd' || assetClass === 'futures') return null
    // Equity / ETF via Supabase Edge Function proxy (bypasses CORS)
    return await fetchEquityPrice(symbol)
  } catch {
    return null
  }
}

async function fetchCryptoPrice(symbol: string): Promise<number | null> {
  const normalized = symbol
    .toUpperCase()
    .replace(/[-/]/, '')
    .replace(/USD$/, 'USDT')
  const pair = normalized.endsWith('USDT') ? normalized : normalized + 'USDT'

  const res = await fetch(
    `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(pair)}`,
    { signal: AbortSignal.timeout(5000) },
  )
  if (!res.ok) return null
  const data = (await res.json()) as { price?: string }
  const price = parseFloat(data.price ?? '')
  return isNaN(price) ? null : price
}

async function fetchEquityPrice(symbol: string): Promise<number | null> {
  try {
    const data = await invokeFn<{ price: number | null }>('fetch-price', { symbol })
    return data?.price ?? null
  } catch {
    return null
  }
}

/** Fetch prices for multiple positions in parallel, returning a map of symbol → price. */
export async function fetchPrices(
  positions: { symbol: string; assetClass: AssetClass }[],
): Promise<Record<string, number | null>> {
  const results = await Promise.allSettled(
    positions.map(async (p) => ({
      symbol: p.symbol,
      price: await fetchPrice(p.symbol, p.assetClass),
    })),
  )
  const map: Record<string, number | null> = {}
  for (const r of results) {
    if (r.status === 'fulfilled') {
      map[r.value.symbol] = r.value.price
    }
  }
  return map
}
