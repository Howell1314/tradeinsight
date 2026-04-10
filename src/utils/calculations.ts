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
          closedTrades.push({
            id: generateId(),
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
            net_pnl: gross_pnl - total_commission,
            commission: total_commission,
            fees: 0,
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
          closedTrades.push({
            id: generateId(),
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
            net_pnl: gross_pnl - total_commission,
            commission: total_commission,
            fees: 0,
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

    // Remaining open long positions
    for (const item of longQueue) {
      if (item.remaining > 0) {
        const multiplier = Number((item.trade.metadata as Record<string, unknown>)?.contract_multiplier ?? 1) || 1
        openPositions.push({
          id: generateId(),
          account_id,
          asset_class,
          symbol,
          quantity: item.remaining,
          avg_cost: item.trade.price,
          current_price: item.trade.price,
          unrealized_pnl: 0,
          unrealized_pnl_pct: 0,
          opened_at: item.trade.traded_at,
          trades: groupTrades,
          contract_multiplier: multiplier,
        })
      }
    }
    // Remaining open short positions
    for (const item of shortQueue) {
      if (item.remaining > 0) {
        const multiplier = Number((item.trade.metadata as Record<string, unknown>)?.contract_multiplier ?? 1) || 1
        openPositions.push({
          id: generateId(),
          account_id,
          asset_class,
          symbol,
          quantity: -item.remaining, // negative = short
          avg_cost: item.trade.price,
          current_price: item.trade.price,
          unrealized_pnl: 0,
          unrealized_pnl_pct: 0,
          opened_at: item.trade.traded_at,
          trades: groupTrades,
          contract_multiplier: multiplier,
        })
      }
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

  // Sharpe ratio (simplified)
  const returns = sorted.map((t) => t.net_pnl)
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length
  const std = Math.sqrt(variance)
  const sharpe_ratio = std > 0 ? (mean / std) * Math.sqrt(252) : 0

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
