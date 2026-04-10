import { useMemo } from 'react'
import { useTradeStore } from '../store/useTradeStore'

export interface AppNotification {
  id: string
  type: 'warning' | 'success' | 'info'
  title: string
  message: string
}

function getJournalStreak(): { hasToday: boolean; streak: number } {
  try {
    const raw = localStorage.getItem('tradeinsight-journal')
    const entries: { date: string }[] = JSON.parse(raw || '[]')
    if (!Array.isArray(entries)) return { hasToday: false, streak: 0 }
    const today = new Date().toISOString().slice(0, 10)
    const hasToday = entries.some((e) => e.date === today)
    let streak = 0
    const dates = new Set(entries.map((e) => e.date))
    let d = new Date()
    if (!hasToday) d.setDate(d.getDate() - 1)
    while (dates.has(d.toISOString().slice(0, 10))) {
      streak++
      d.setDate(d.getDate() - 1)
    }
    return { hasToday, streak }
  } catch {
    return { hasToday: false, streak: 0 }
  }
}

export function useNotifications(): AppNotification[] {
  const { closedTrades, openPositions, riskRules } = useTradeStore()

  return useMemo(() => {
    const notifications: AppNotification[] = []
    const today = new Date().toISOString().slice(0, 10)
    const currentMonth = new Date().toISOString().slice(0, 7)

    const todayPnl = closedTrades
      .filter((t) => t.closed_at.slice(0, 10) === today)
      .reduce((s, t) => s + t.net_pnl, 0)
    const monthPnl = closedTrades
      .filter((t) => t.closed_at.slice(0, 7) === currentMonth)
      .reduce((s, t) => s + t.net_pnl, 0)

    // Daily loss alert
    if (riskRules.maxDailyLoss && todayPnl <= -riskRules.maxDailyLoss) {
      notifications.push({
        id: 'daily-loss',
        type: 'warning',
        title: '单日亏损超限',
        message: `今日亏损 $${Math.abs(todayPnl).toFixed(2)}，已超过限额 $${riskRules.maxDailyLoss}，建议停止交易`,
      })
    }

    // Monthly goal achieved
    if (riskRules.monthlyTarget && monthPnl >= riskRules.monthlyTarget) {
      notifications.push({
        id: 'monthly-goal',
        type: 'success',
        title: '月度目标达成 🎯',
        message: `本月盈利 $${monthPnl.toFixed(2)} 已达到目标 $${riskRules.monthlyTarget}！`,
      })
    }

    // Large unrealized loss warnings (> 10%)
    for (const pos of openPositions) {
      if (pos.unrealized_pnl_pct < -10) {
        notifications.push({
          id: `pos-loss-${pos.symbol}`,
          type: 'warning',
          title: `${pos.symbol} 持仓亏损预警`,
          message: `浮动亏损 ${pos.unrealized_pnl_pct.toFixed(1)}%，请关注风控`,
        })
      }
    }

    // Journal reminders
    const { hasToday, streak } = getJournalStreak()
    if (!hasToday && closedTrades.length > 0) {
      notifications.push({
        id: 'journal-reminder',
        type: 'info',
        title: '今日日志未记录',
        message: streak > 0
          ? `已连续记录 ${streak} 天，坚持记录今天的日志！`
          : '养成每日复盘的习惯，记录今天的交易日志',
      })
    }
    if (streak >= 7) {
      notifications.push({
        id: 'journal-streak',
        type: 'success',
        title: `日志连续打卡 ${streak} 天 🔥`,
        message: '坚持复盘是提高交易水平的关键，继续保持！',
      })
    }

    return notifications
  }, [closedTrades, openPositions, riskRules])
}
