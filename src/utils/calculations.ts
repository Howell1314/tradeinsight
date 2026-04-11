import type { Trade, ClosedTrade, Position } from '../types/trade'

export interface DashboardStats {
  total_pnl: number; realized_pnl: number; unrealized_pnl: number
  win_rate: number; total_trades: number; winning_trades: number; losing_trades: number
  avg_win: number; avg_loss: number; risk_reward: number; expectancy: number
  max_drawdown: number; profit_factor: number; sharpe_ratio: number
  max_consecutive_wins: number; max_consecutive_losses: number; avg_holding_days: number
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export function formatCurrency(value: number, currency = 'USD', decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatPercent(value: number, decimals = 2): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

// Match open/close trades using FIFO to create ClosedTrades and open Positions
function calcR(
  direction: 'long' | 'short',
  openTrade: Trade,
  netPnl: number,
  qty: number,
  multiplier: number,
): { initial_risk?: number; actual_r?: number } {
  const stop = openTrade.planned_stop
  if (stop == null || stop <= 0) return {}
  let initial_risk: number
  if (direction === 'long') {
    initial_risk = (openTrade.price - stop) * qty * multiplier
  } else {
    initial_risk = (stop - openTrade.price) * qty * multiplier
  }
  if (initial_risk <= 0) return {}
  return { initial_risk, actual_r: netPnl / initial_risk }
}

export function processTradesIntoPositions(
  trades: Trade[],
): { closedTrades: ClosedTrade[]; openPositions: Position[] } {
  // Group by symbol + account
  const groups: Record<string, Trade[]> = {}
  const sorted = [...trades].sort(
    (a, b) => new Date(a.traded_at).getTime() - new Date(b.traded_at).getTime(),
  )

  for (const trade of sorted) {
    const key = `${trade.account_id}::${trade.symbol}`
    if (!groups[key]) groups[key] = []
    groups[key].push(trade)
  }

  const closedTrades: ClosedTrade[] = []
  const openPositions: Position[] = []

  for (const [key, groupTrades] of Object.entries(groups)) {
    const [account_id] = key.split('::')
    const symbol = groupTrades[0].symbol
    const asset_class = groupTrades[0].asset_class

    // Use FIFO matching
    const longQueue: { trade: Trade; remaining: number }[] = []
    const shortQueue: { trade: Trade; remaining: number }[] = []

    for (const trade of groupTrades) {
      const isBuy = trade.direction === 'buy' || trade.direction === 'cover'
      const isSell = trade.direction === 'sell' || trade.direction === 'short'

      if (isBuy) {
        // Buy: could open long or close short
        let remaining = trade.quantity
        while (remaining > 0 && shortQueue.length > 0) {
          const openShort = shortQueue[0]
          const matchQty = Math.min(remaining, openShort.remaining)
          const closingTrades = [trade]
          const openingTrades = [openShort.trade]
          const multiplier = Number((openShort.trade.metadata as Record<string, unknown>)?.contract_multiplier ?? 1) || 1
          const gross_pnl = (openShort.trade.price - trade.price) * matchQty * multiplier
          const total_commission =
            openShort.trade.commission * (matchQty / openShort.trade.quantity) +
            trade.commission * (matchQty / trade.quantity)
          const total_fees =
            openShort.trade.fees * (matchQty / openShort.trade.quantity) +
            trade.fees * (matchQty / trade.quantity)
          const shortNetPnl = gross_pnl - total_commission - total_fees
          closedTrades.push({
            id: `ct__${openShort.trade.id}__${trade.id}__${matchQty.toFixed(8)}`,
            symbol,
            asset_class,
            account_id,
            direction: 'short',
            open_trades: openingTrades,
            close_trades: closingTrades,
            open_price: openShort.trade.price,
            close_price: trade.price,
            quantity: matchQty,
            gross_pnl,
            net_pnl: shortNetPnl,
            commission: total_commission,
            fees: total_fees,
            opened_at: openShort.trade.traded_at,
            closed_at: trade.traded_at,
            holding_days: Math.max(
              0,
              Math.round(
                (new Date(trade.traded_at).getTime() -
                  new Date(openShort.trade.traded_at).getTime()) /
                  86400000,
              ),
            ),
            strategy_tags: [...openShort.trade.strategy_tags, ...trade.strategy_tags].filter(
              (v, i, a) => a.indexOf(v) === i,
            ),
            ...calcR('short', openShort.trade, shortNetPnl, matchQty, multiplier),
          })
          openShort.remaining -= matchQty
          remaining -= matchQty
          if (openShort.remaining <= 0) shortQueue.shift()
        }
        if (remaining > 0) {
          longQueue.push({ trade, remaining })
        }
      } else if (isSell) {
        // Sell: could close long or open short
        let remaining = trade.quantity
        while (remaining > 0 && longQueue.length > 0) {
          const openLong = longQueue[0]
          const matchQty = Math.min(remaining, openLong.remaining)
          const multiplier = Number((openLong.trade.metadata as Record<string, unknown>)?.contract_multiplier ?? 1) || 1
          const gross_pnl = (trade.price - openLong.trade.price) * matchQty * multiplier
          const total_commission =
            openLong.trade.commission * (matchQty / openLong.trade.quantity) +
            trade.commission * (matchQty / trade.quantity)
          const total_fees =
            openLong.trade.fees * (matchQty / openLong.trade.quantity) +
            trade.fees * (matchQty / trade.quantity)
          const longNetPnl = gross_pnl - total_commission - total_fees
          closedTrades.push({
            id: `ct__${openLong.trade.id}__${trade.id}__${matchQty.toFixed(8)}`,
            symbol,
            asset_class,
            account_id,
            direction: 'long',
            open_trades: [openLong.trade],
            close_trades: [trade],
            open_price: openLong.trade.price,
            close_price: trade.price,
            quantity: matchQty,
            gross_pnl,
            net_pnl: longNetPnl,
            commission: total_commission,
            fees: total_fees,
            opened_at: openLong.trade.traded_at,
            closed_at: trade.traded_at,
            holding_days: Math.max(
              0,
              Math.round(
                (new Date(trade.traded_at).getTime() -
                  new Date(openLong.trade.traded_at).getTime()) /
                  86400000,
              ),
            ),
            strategy_tags: [...openLong.trade.strategy_tags, ...trade.strategy_tags].filter(
              (v, i, a) => a.indexOf(v) === i,
            ),
            ...calcR('long', openLong.trade, longNetPnl, matchQty, multiplier),
          })
          openLong.remaining -= matchQty
          remaining -= matchQty
          if (openLong.remaining <= 0) longQueue.shift()
        }
        if (remaining > 0) {
          shortQueue.push({ trade, remaining })
        }
      }
    }

    // Remaining open long positions — aggregate all remaining lots into one position
    const remainingLongs = longQueue.filter(item => item.remaining > 0)
    if (remainingLongs.length > 0) {
      const totalQty = remainingLongs.reduce((s, item) => s + item.remaining, 0)
      const avgCost = remainingLongs.reduce((s, item) => s + item.trade.price * item.remaining, 0) / totalQty
      const multiplier = Number((remainingLongs[0].trade.metadata as Record<string, unknown>)?.contract_multiplier ?? 1) || 1
      openPositions.push({
        id: `pos__${account_id}__${symbol}__long`,
        account_id,
        asset_class,
        symbol,
        quantity: totalQty,
        avg_cost: avgCost,
        current_price: avgCost,
        unrealized_pnl: 0,
        unrealized_pnl_pct: 0,
        opened_at: remainingLongs[0].trade.traded_at,
        trades: groupTrades,
        contract_multiplier: multiplier,
      })
    }
    // Remaining open short positions — aggregate all remaining lots into one position
    const remainingShorts = shortQueue.filter(item => item.remaining > 0)
    if (remainingShorts.length > 0) {
      const totalQty = remainingShorts.reduce((s, item) => s + item.remaining, 0)
      const avgCost = remainingShorts.reduce((s, item) => s + item.trade.price * item.remaining, 0) / totalQty
      const multiplier = Number((remainingShorts[0].trade.metadata as Record<string, unknown>)?.contract_multiplier ?? 1) || 1
      openPositions.push({
        id: `pos__${account_id}__${symbol}__short`,
        account_id,
        asset_class,
        symbol,
        quantity: -totalQty, // negative = short
        avg_cost: avgCost,
        current_price: avgCost,
        unrealized_pnl: 0,
        unrealized_pnl_pct: 0,
        opened_at: remainingShorts[0].trade.traded_at,
        trades: groupTrades,
        contract_multiplier: multiplier,
      })
    }
  }

  return { closedTrades, openPositions }
}

export function computeStats(closedTrades: ClosedTrade[]): DashboardStats {
  if (closedTrades.length === 0) {
    return {
      total_pnl: 0, realized_pnl: 0, unrealized_pnl: 0,
      win_rate: 0, total_trades: 0, winning_trades: 0, losing_trades: 0,
      avg_win: 0, avg_loss: 0, risk_reward: 0, expectancy: 0,
      max_drawdown: 0, profit_factor: 0, sharpe_ratio: 0,
      max_consecutive_wins: 0, max_consecutive_losses: 0, avg_holding_days: 0,
    }
  }

  const sorted = [...closedTrades].sort(
    (a, b) => new Date(a.closed_at).getTime() - new Date(b.closed_at).getTime(),
  )

  const winners = sorted.filter((t) => t.net_pnl > 0)
  const losers = sorted.filter((t) => t.net_pnl < 0)

  const total_pnl = sorted.reduce((s, t) => s + t.net_pnl, 0)
  const total_wins = winners.reduce((s, t) => s + t.net_pnl, 0)
  const total_losses = Math.abs(losers.reduce((s, t) => s + t.net_pnl, 0))
  const avg_win = winners.length ? total_wins / winners.length : 0
  const avg_loss = losers.length ? total_losses / losers.length : 0

  // Equity curve for max drawdown
  let equity = 0
  let peak = 0
  let max_drawdown = 0
  for (const t of sorted) {
    equity += t.net_pnl
    if (equity > peak) peak = equity
    const dd = peak > 0 ? (peak - equity) / peak : 0
    if (dd > max_drawdown) max_drawdown = dd
  }

  // Sharpe ratio — group by trading day first, then annualize with sqrt(252)
  const byDay: Record<string, number> = {}
  for (const t of sorted) {
    const day = t.closed_at.slice(0, 10)
    byDay[day] = (byDay[day] || 0) + t.net_pnl
  }
  const dailyReturns = Object.values(byDay)
  const dailyMean = dailyReturns.reduce((s, v) => s + v, 0) / dailyReturns.length
  const dailyVariance = dailyReturns.reduce((s, v) => s + (v - dailyMean) ** 2, 0) / dailyReturns.length
  const dailyStd = Math.sqrt(dailyVariance)
  const sharpe_ratio = dailyStd > 0 ? (dailyMean / dailyStd) * Math.sqrt(252) : 0

  // Consecutive wins/losses
  let maxWins = 0, maxLosses = 0, curWins = 0, curLosses = 0
  for (const t of sorted) {
    if (t.net_pnl > 0) {
      curWins++; curLosses = 0
      if (curWins > maxWins) maxWins = curWins
    } else {
      curLosses++; curWins = 0
      if (curLosses > maxLosses) maxLosses = curLosses
    }
  }

  const avg_holding_days =
    sorted.reduce((s, t) => s + t.holding_days, 0) / sorted.length

  return {
    total_pnl,
    realized_pnl: total_pnl,
    unrealized_pnl: 0,
    win_rate: winners.length / sorted.length,
    total_trades: sorted.length,
    winning_trades: winners.length,
    losing_trades: losers.length,
    avg_win,
    avg_loss,
    risk_reward: avg_loss > 0 ? avg_win / avg_loss : avg_win > 0 ? Infinity : 0,
    expectancy: (winners.length / sorted.length) * avg_win - (losers.length / sorted.length) * avg_loss,
    max_drawdown: max_drawdown * 100,
    profit_factor: total_losses > 0 ? total_wins / total_losses : total_wins > 0 ? Infinity : 0,
    sharpe_ratio,
    max_consecutive_wins: maxWins,
    max_consecutive_losses: maxLosses,
    avg_holding_days,
  }
}

export function buildEquityCurve(closedTrades: ClosedTrade[]): { date: string; equity: number; pnl: number }[] {
  const sorted = [...closedTrades].sort(
    (a, b) => new Date(a.closed_at).getTime() - new Date(b.closed_at).getTime(),
  )
  let equity = 0
  return sorted.map((t) => {
    equity += t.net_pnl
    return {
      date: t.closed_at.slice(0, 10),
      equity: parseFloat(equity.toFixed(2)),
      pnl: parseFloat(t.net_pnl.toFixed(2)),
    }
  })
}

export function buildPnLByMonth(closedTrades: ClosedTrade[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const t of closedTrades) {
    const month = t.closed_at.slice(0, 7)
    result[month] = (result[month] || 0) + t.net_pnl
  }
  return result
}

export function buildPnLBySymbol(closedTrades: ClosedTrade[]): { symbol: string; pnl: number }[] {
  const bySymbol: Record<string, number> = {}
  for (const t of closedTrades) {
    bySymbol[t.symbol] = (bySymbol[t.symbol] || 0) + t.net_pnl
  }
  return Object.entries(bySymbol)
    .map(([symbol, pnl]) => ({ symbol, pnl }))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
}

export function buildPnLByAssetClass(closedTrades: ClosedTrade[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const t of closedTrades) {
    result[t.asset_class] = (result[t.asset_class] || 0) + t.net_pnl
  }
  return result
}

export function buildWinRateByMonth(closedTrades: ClosedTrade[]): { month: string; winRate: number; count: number }[] {
  const byMonth: Record<string, { wins: number; total: number }> = {}
  for (const t of closedTrades) {
    const m = t.closed_at.slice(0, 7)
    if (!byMonth[m]) byMonth[m] = { wins: 0, total: 0 }
    byMonth[m].total++
    if (t.net_pnl > 0) byMonth[m].wins++
  }
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { wins, total }]) => ({ month, winRate: total > 0 ? wins / total * 100 : 0, count: total }))
}

export function buildPnLByQuarter(closedTrades: ClosedTrade[]): { quarter: string; pnl: number; count: number }[] {
  const byQ: Record<string, { pnl: number; count: number }> = {}
  for (const t of closedTrades) {
    const d = new Date(t.closed_at)
    const q = `${d.getFullYear()} Q${Math.ceil((d.getMonth() + 1) / 3)}`
    if (!byQ[q]) byQ[q] = { pnl: 0, count: 0 }
    byQ[q].pnl += t.net_pnl
    byQ[q].count++
  }
  return Object.entries(byQ)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([quarter, v]) => ({ quarter, ...v }))
}

export function buildPnLByWeekday(closedTrades: ClosedTrade[]): { day: string; pnl: number; count: number }[] {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const data: { pnl: number; count: number }[] = Array.from({ length: 7 }, () => ({ pnl: 0, count: 0 }))
  for (const t of closedTrades) {
    const d = new Date(t.closed_at).getDay()
    data[d].pnl += t.net_pnl
    data[d].count++
  }
  return days.map((day, i) => ({ day, ...data[i] }))
}

export interface StrategyStats {
  strategy: string
  total_pnl: number
  win_rate: number
  risk_reward: number
  expectancy: number
  total_trades: number
  winning_trades: number
}

export function buildStatsByStrategy(closedTrades: ClosedTrade[]): StrategyStats[] {
  const map: Record<string, ClosedTrade[]> = {}
  for (const t of closedTrades) {
    const tags = t.strategy_tags.length > 0 ? t.strategy_tags : ['（无标签）']
    for (const tag of tags) {
      if (!map[tag]) map[tag] = []
      map[tag].push(t)
    }
  }
  return Object.entries(map)
    .map(([strategy, trades]) => {
      const winners = trades.filter(t => t.net_pnl > 0)
      const losers = trades.filter(t => t.net_pnl < 0)
      const avg_win = winners.length ? winners.reduce((s, t) => s + t.net_pnl, 0) / winners.length : 0
      const avg_loss = losers.length ? Math.abs(losers.reduce((s, t) => s + t.net_pnl, 0)) / losers.length : 0
      const win_rate = trades.length ? winners.length / trades.length : 0
      const risk_reward = avg_loss > 0 ? avg_win / avg_loss : avg_win > 0 ? Infinity : 0
      const expectancy = win_rate * avg_win - (1 - win_rate) * avg_loss
      return {
        strategy,
        total_pnl: trades.reduce((s, t) => s + t.net_pnl, 0),
        win_rate,
        risk_reward,
        expectancy,
        total_trades: trades.length,
        winning_trades: winners.length,
      }
    })
    .sort((a, b) => Math.abs(b.total_pnl) - Math.abs(a.total_pnl))
}

export function buildPnLByStrategyByMonth(
  closedTrades: ClosedTrade[],
): { month: string; [strategy: string]: number | string }[] {
  // Collect all unique strategies and months
  const strategies = new Set<string>()
  const monthMap: Record<string, Record<string, number>> = {}

  for (const t of closedTrades) {
    const month = t.closed_at.slice(0, 7)
    const tags = t.strategy_tags.length > 0 ? t.strategy_tags : ['（无标签）']
    if (!monthMap[month]) monthMap[month] = {}
    for (const tag of tags) {
      strategies.add(tag)
      monthMap[month][tag] = (monthMap[month][tag] || 0) + t.net_pnl
    }
  }

  return Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, byStrategy]) => ({ month, ...byStrategy }))
}

export function buildRMultipleStats(closedTrades: ClosedTrade[]): {
  distribution: { bucket: string; count: number; color: string }[]
  avg_r: number
  median_r: number
  tradesWithR: number
} {
  const rValues = closedTrades
    .filter(t => t.actual_r != null && isFinite(t.actual_r!))
    .map(t => t.actual_r!)

  if (rValues.length === 0) {
    return { distribution: [], avg_r: 0, median_r: 0, tradesWithR: 0 }
  }

  // Build distribution buckets: <-2, -2~-1, -1~0, 0~1, 1~2, 2~3, >3
  const buckets = [
    { label: '<-2R', min: -Infinity, max: -2 },
    { label: '-2~-1R', min: -2, max: -1 },
    { label: '-1~0R', min: -1, max: 0 },
    { label: '0~1R', min: 0, max: 1 },
    { label: '1~2R', min: 1, max: 2 },
    { label: '2~3R', min: 2, max: 3 },
    { label: '>3R', min: 3, max: Infinity },
  ]

  const distribution = buckets.map(b => ({
    bucket: b.label,
    count: rValues.filter(r => r >= b.min && r < b.max).length,
    color: b.min >= 0 ? '#22c55e' : '#ef4444',
  }))

  const sorted = [...rValues].sort((a, b) => a - b)
  const avg_r = rValues.reduce((s, v) => s + v, 0) / rValues.length
  const median_r = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)]

  return { distribution, avg_r, median_r, tradesWithR: rValues.length }
}

export function buildDrawdownCurve(closedTrades: ClosedTrade[]): { date: string; drawdown: number }[] {
  const sorted = [...closedTrades].sort(
    (a, b) => new Date(a.closed_at).getTime() - new Date(b.closed_at).getTime(),
  )
  let equity = 0
  let peak = 0
  return sorted.map(t => {
    equity += t.net_pnl
    if (equity > peak) peak = equity
    const drawdown = peak > 0 ? -((peak - equity) / peak) * 100 : 0
    return { date: t.closed_at.slice(0, 10), drawdown: parseFloat(drawdown.toFixed(2)) }
  })
}

export function buildPnLByEmotion(closedTrades: ClosedTrade[]): { emotion: string; avg_pnl: number; count: number; total_pnl: number }[] {
  const EMOTION_LABELS: Record<string, string> = {
    calm: '冷静', confident: '自信', hesitant: '犹豫', impulsive: '冲动',
  }
  const map: Record<string, { sum: number; count: number }> = {}
  for (const t of closedTrades) {
    const rawEmotion = (t.open_trades[0]?.emotion) ?? null
    if (!rawEmotion) continue
    const emotion = EMOTION_LABELS[rawEmotion] ?? rawEmotion
    if (!map[emotion]) map[emotion] = { sum: 0, count: 0 }
    map[emotion].sum += t.net_pnl
    map[emotion].count++
  }
  return Object.entries(map).map(([emotion, { sum, count }]) => ({
    emotion,
    avg_pnl: count > 0 ? sum / count : 0,
    total_pnl: sum,
    count,
  }))
}
