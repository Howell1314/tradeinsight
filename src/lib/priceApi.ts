import type { AssetClass } from '../types/trade'

/** Fetch latest price for a symbol. Returns null on failure (silent degradation). */
export async function fetchPrice(symbol: string, assetClass: AssetClass): Promise<number | null> {
  try {
    if (assetClass === 'crypto') {
      return await fetchCryptoPrice(symbol)
    }
    // equity, etf, option, cfd, futures — try Yahoo Finance
    return await fetchYahooPrice(symbol)
  } catch {
    return null
  }
}

async function fetchCryptoPrice(symbol: string): Promise<number | null> {
  // Normalize: BTC/USDT → BTCUSDT, BTC-USD → BTCUSDT, BTC → BTCUSDT
  const normalized = symbol
    .toUpperCase()
    .replace(/[-/]/, '')
    .replace(/USD$/, 'USDT')
  // If it doesn't end in USDT already, append USDT
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

async function fetchYahooPrice(symbol: string): Promise<number | null> {
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  const targetUrl = `https://query1.finance.yahoo.com${path}`
  const direct2 = `https://query2.finance.yahoo.com${path}`

  // Proxy variants — try multiple in case one is rate-limited or down
  const proxy1 = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`
  const proxy2 = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`
  const proxy3 = `https://corsproxy.io/?${encodeURIComponent(direct2)}`

  const extractPrice = (data: unknown): number | null => {
    const price = (data as { chart?: { result?: { meta?: { regularMarketPrice?: number } }[] } })
      ?.chart?.result?.[0]?.meta?.regularMarketPrice
    return price != null && !isNaN(price) ? price : null
  }

  // Try endpoints in order; return on first success
  for (const url of [targetUrl, direct2, proxy1, proxy2, proxy3]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
      if (!res.ok) continue
      const data = await res.json()
      const price = extractPrice(data)
      if (price != null) return price
    } catch {
      // network error or timeout — try next endpoint
    }
  }
  return null
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
