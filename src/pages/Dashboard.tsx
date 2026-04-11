import { useState, useMemo } from 'react'
import { useTradeStore } from '../store/useTradeStore'
import StatCard from '../components/StatCard'
import TradeCalendar from '../components/TradeCalendar'
import { useIsMobile } from '../hooks/useIsMobile'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, Legend, Brush,
} from 'recharts'
import {
  buildEquityCurve, buildPnLByAssetClass, buildPnLByWeekday,
  formatCurrency, formatPercent, formatNumber,
} from '../utils/calculations'
import { TrendingUp, Award, Target, AlertTriangle, Zap, BarChart2, Clock, LineChart as LineChartIcon, Percent } from 'lucide-react'
import { ASSET_COLORS, ASSET_LABELS } from '../constants/assets'

export default function Dashboard() {
  const { closedTrades, openPositions, stats, accounts, accountTransactions, riskRules } = useTradeStore()
  const isMobile = useIsMobile()
  const [calendarDayDetail, setCalendarDayDetail] = useState<{ date: string; trades: import('../types/trade').ClosedTrade[] } | null>(null)

  const equityCurve = useMemo(() => buildEquityCurve(closedTrades), [closedTrades])
  const pnlByAsset = useMemo(() => buildPnLByAssetClass(closedTrades), [closedTrades])
  const pnlByWeekday = useMemo(() => buildPnLByWeekday(closedTrades), [closedTrades])

  // Compute overall return rate
  const totalCapital = accounts.reduce((s, acc) => {
    const txs = accountTransactions.filter(t => t.account_id === acc.id)
    const deposits = txs.filter(t => t.type === 'deposit').reduce((a, t) => a + t.amount, 0)
    const withdrawals = txs.filter(t => t.type === 'withdrawal').reduce((a, t) => a + t.amount, 0)
    return s + (acc.initial_capital ?? 0) + deposits - withdrawals
  }, 0)
  const unrealizedPnl = openPositions.reduce((s, p) => s + p.unrealized_pnl, 0)
  const totalPnl = stats.realized_pnl + unrealizedPnl
  const returnRate = totalCapital > 0 ? (totalPnl / totalCapital) * 100 : null

  // Risk rule checks
  const today = new Date().toISOString().slice(0, 10)
  const todayPnl = closedTrades.filter(t => t.closed_at.slice(0, 10) === today).reduce((s, t) => s + t.net_pnl, 0)
  const currentMonth = new Date().toISOString().slice(0, 7)
  const monthPnl = closedTrades.filter(t => t.closed_at.slice(0, 7) === currentMonth).reduce((s, t) => s + t.net_pnl, 0)
  const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10) })()
  const weekPnl = closedTrades.filter(t => t.closed_at.slice(0, 10) >= weekStart).reduce((s, t) => s + t.net_pnl, 0)
  // Consecutive losses: count from most recent backward
  const recentSorted = [...closedTrades].sort((a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime())
  let consecutiveLosses = 0
  for (const t of recentSorted) { if (t.net_pnl < 0) consecutiveLosses++; else break }

  const dailyLossAlert = riskRules.maxDailyLoss && todayPnl <= -riskRules.maxDailyLoss
  const weeklyLossAlert = riskRules.maxWeeklyLoss && weekPnl <= -riskRules.maxWeeklyLoss
  const consecutiveLossAlert = riskRules.maxConsecutiveLosses && consecutiveLosses >= riskRules.maxConsecutiveLosses
  const monthlyTargetHit = riskRules.monthlyTarget && monthPnl >= riskRules.monthlyTarget

  const pieData = Object.entries(pnlByAsset).map(([k, v]) => ({
    name: ASSET_LABELS[k] || k,
    value: Math.abs(v),
    color: ASSET_COLORS[k] || '#6b7280',
  }))

  const hasData = closedTrades.length > 0

  return (
    <div style={{ padding: isMobile ? '16px 12px' : '24px 28px' }}>
      {/* Header */}
      <div style={{ marginBottom: isMobile ? 14 : 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#e2e8f0', letterSpacing: '-0.02em' }}>
            仪表盘
          </h1>
          <p style={{ margin: '5px 0 0', color: '#8892a4', fontSize: 13 }}>
            {hasData
              ? `共 ${stats.total_trades} 笔已结算交易 · ${openPositions.length} 个持仓中`
              : '暂无交易数据，请前往「交易记录」添加'}
          </p>
        </div>
        {hasData && (
          <div style={{
            background: stats.total_pnl >= 0 ? '#22c55e15' : '#ef444415',
            border: `1px solid ${stats.total_pnl >= 0 ? '#22c55e30' : '#ef444430'}`,
            borderRadius: 10, padding: '8px 16px',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <TrendingUp size={16} color={stats.total_pnl >= 0 ? '#22c55e' : '#ef4444'} />
            <span style={{ fontSize: 18, fontWeight: 700, color: stats.total_pnl >= 0 ? '#22c55e' : '#ef4444' }}>
              {formatCurrency(stats.total_pnl)}
            </span>
          </div>
        )}
      </div>

      {/* Risk alerts */}
      {dailyLossAlert && (
        <div style={{
          background: '#ef444415', border: '1px solid #ef444440', borderLeft: '4px solid #ef4444',
          borderRadius: 10, padding: '10px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <AlertTriangle size={16} color="#ef4444" />
          <div>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#ef4444' }}>已触发单日最大亏损限制</span>
            <span style={{ fontSize: 13, color: '#8892a4', marginLeft: 8 }}>
              今日亏损 {formatCurrency(Math.abs(todayPnl))} · 限额 {formatCurrency(riskRules.maxDailyLoss!)}，建议停止交易
            </span>
          </div>
        </div>
      )}
      {weeklyLossAlert && (
        <div style={{
          background: '#ef444415', border: '1px solid #ef444440', borderLeft: '4px solid #ef4444',
          borderRadius: 10, padding: '10px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <AlertTriangle size={16} color="#ef4444" />
          <div>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#ef4444' }}>已触发本周最大亏损限制</span>
            <span style={{ fontSize: 13, color: '#8892a4', marginLeft: 8 }}>
              本周亏损 {formatCurrency(Math.abs(weekPnl))} · 限额 {formatCurrency(riskRules.maxWeeklyLoss!)}，建议暂停交易
            </span>
          </div>
        </div>
      )}
      {consecutiveLossAlert && (
        <div style={{
          background: '#f97316' + '15', border: '1px solid ' + '#f97316' + '40', borderLeft: '4px solid #f97316',
          borderRadius: 10, padding: '10px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <AlertTriangle size={16} color="#f97316" />
          <div>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#f97316' }}>已触发连续亏损限制</span>
            <span style={{ fontSize: 13, color: '#8892a4', marginLeft: 8 }}>
              连续亏损 {consecutiveLosses} 笔 · 限额 {riskRules.maxConsecutiveLosses} 笔，建议冷静复盘再入场
            </span>
          </div>
        </div>
      )}
      {monthlyTargetHit && (
        <div style={{
          background: '#22c55e15', border: '1px solid #22c55e40', borderLeft: '4px solid #22c55e',
          borderRadius: 10, padding: '10px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <TrendingUp size={16} color="#22c55e" />
          <div>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#22c55e' }}>已达成本月盈利目标 🎯</span>
            <span style={{ fontSize: 13, color: '#8892a4', marginLeft: 8 }}>
              本月盈利 {formatCurrency(monthPnl)} · 目标 {formatCurrency(riskRules.monthlyTarget!)}
            </span>
          </div>
        </div>
      )}

      {/* Top stats */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 8 : 12, marginBottom: isMobile ? 8 : 12 }}>
        <StatCard
          label="总盈亏"
          value={formatCurrency(stats.total_pnl)}
          positive={stats.total_pnl > 0}
          negative={stats.total_pnl < 0}
          icon={<TrendingUp size={15} />}
        />
        <StatCard
          label="胜率"
          value={hasData ? formatPercent(stats.win_rate * 100, 1) : '--'}
          sub={`${stats.winning_trades} 胜 / ${stats.losing_trades} 负`}
          positive={stats.win_rate >= 0.5}
          negative={hasData && stats.win_rate < 0.5}
          icon={<Award size={15} />}
        />
        <StatCard
          label="盈亏比"
          value={hasData ? (isFinite(stats.risk_reward) ? formatNumber(stats.risk_reward, 2) + 'x' : '∞') : '--'}
          sub={`均赢 ${formatCurrency(stats.avg_win)} · 均亏 ${formatCurrency(stats.avg_loss)}`}
          positive={stats.risk_reward > 1}
          color="#8b5cf6"
          icon={<Target size={15} />}
        />
        <StatCard
          label="最大回撤"
          value={hasData ? formatPercent(stats.max_drawdown, 1) : '--'}
          negative={stats.max_drawdown > 0}
          icon={<AlertTriangle size={15} />}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: isMobile ? 8 : 12, marginBottom: isMobile ? 16 : 24 }}>
        <StatCard
          label="期望值"
          value={hasData ? formatCurrency(stats.expectancy) : '--'}
          positive={stats.expectancy > 0}
          negative={stats.expectancy < 0}
          icon={<Zap size={15} />}
        />
        <StatCard
          label="利润因子"
          value={hasData ? (isFinite(stats.profit_factor) ? formatNumber(stats.profit_factor, 2) : '∞') : '--'}
          positive={stats.profit_factor > 1}
          color="#f59e0b"
          icon={<BarChart2 size={15} />}
        />
        <StatCard
          label="夏普比率"
          value={hasData ? formatNumber(stats.sharpe_ratio, 2) : '--'}
          positive={stats.sharpe_ratio > 1}
          color="#06b6d4"
          icon={<LineChartIcon size={15} />}
        />
        <StatCard
          label="平均持仓"
          value={hasData ? formatNumber(stats.avg_holding_days, 1) + ' 天' : '--'}
          color="#a78bfa"
          icon={<Clock size={15} />}
        />
        <StatCard
          label="总回报率"
          value={returnRate !== null ? formatPercent(returnRate, 2) : '--'}
          sub={totalCapital > 0 ? `本金 ${formatCurrency(totalCapital)}` : '请在资料页设置初始资金'}
          positive={returnRate !== null && returnRate > 0}
          negative={returnRate !== null && returnRate < 0}
          color="#f59e0b"
          icon={<Percent size={15} />}
        />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 12, marginBottom: 12 }}>
        <ChartCard title="累计收益曲线" accent="#3b82f6">
          {equityCurve.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={equityCurve}>
                <defs>
                  <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#232740" />
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
                <Tooltip
                  contentStyle={{ background: '#1e2135', border: '1px solid #2d3148', borderRadius: 8, fontSize: 13 }}
                  labelStyle={{ color: '#e2e8f0', marginBottom: 4 }}
                  formatter={(v) => [formatCurrency(v as number), '净值']}
                />
                <Area type="monotone" dataKey="equity" stroke="#3b82f6" fill="url(#equityGrad)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#3b82f6' }} />
                {equityCurve.length > 20 && (
                  <Brush dataKey="date" height={18} stroke="#2d3148" fill="#161924"
                    travellerWidth={6} startIndex={Math.max(0, equityCurve.length - 20)} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        <ChartCard title="品种盈亏分布" accent="#8b5cf6">
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="45%" innerRadius={52} outerRadius={82}
                  dataKey="value" nameKey="name" paddingAngle={4}>
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1e2135', border: '1px solid #2d3148', borderRadius: 8, fontSize: 13 }}
                  formatter={(v) => [formatCurrency(v as number), '']}
                />
                <Legend iconType="circle" iconSize={8}
                  formatter={(v) => <span style={{ color: '#8892a4', fontSize: 11 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
        <ChartCard title="按星期分析" accent="#f59e0b">
          {hasData ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={pnlByWeekday} barSize={32}>
                <CartesianGrid strokeDasharray="3 3" stroke="#232740" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
                <Tooltip
                  contentStyle={{ background: '#1e2135', border: '1px solid #2d3148', borderRadius: 8, fontSize: 13 }}
                  formatter={(v) => [formatCurrency(v as number), 'P&L']}
                />
                <Bar dataKey="pnl" radius={[5, 5, 0, 0]}>
                  {pnlByWeekday.map((entry, i) => (
                    <Cell key={i} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        {/* Quick stats */}
        <div style={{
          background: 'linear-gradient(145deg, #1a1d27, #1d2136)',
          border: '1px solid #2d3148',
          borderTop: '2px solid #22c55e',
          borderRadius: 12, padding: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            <div style={{ width: 3, height: 16, background: '#22c55e', borderRadius: 2 }} />
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>交易统计</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { label: '总交易笔数', value: String(stats.total_trades), color: '#e2e8f0' },
              { label: '最长连胜', value: `${stats.max_consecutive_wins} 笔`, color: '#22c55e' },
              { label: '最长连亏', value: `${stats.max_consecutive_losses} 笔`, color: '#ef4444' },
              { label: '未平仓持仓', value: `${openPositions.length} 个`, color: '#60a5fa' },
              { label: '已实现盈亏', value: formatCurrency(stats.realized_pnl), color: stats.realized_pnl >= 0 ? '#22c55e' : '#ef4444' },
            ].map(({ label, value, color }, i, arr) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0',
                borderBottom: i < arr.length - 1 ? '1px solid #232740' : 'none',
              }}>
                <span style={{ fontSize: 13, color: '#8892a4' }}>{label}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trade Calendar Heatmap */}
      {hasData && (
        <div style={{ marginTop: 12 }}>
          <div style={{
            background: 'linear-gradient(145deg, #1a1d27, #1d2136)',
            border: '1px solid #2d3148',
            borderTop: '2px solid #a78bfa',
            borderRadius: 12, padding: '18px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 3, height: 14, background: '#a78bfa', borderRadius: 2 }} />
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>交易日历</h3>
              <span style={{ fontSize: 11, color: '#4a5268', marginLeft: 4 }}>悬停查看当日盈亏 · 点击查看明细</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <TradeCalendar
                closedTrades={closedTrades}
                months={isMobile ? 6 : 12}
                onDayClick={(date, trades) =>
                  setCalendarDayDetail(prev => prev?.date === date ? null : { date, trades })
                }
              />
            </div>
            {/* Day detail panel */}
            {calendarDayDetail && (
              <div style={{ marginTop: 14, background: '#161924', borderRadius: 10, padding: '12px 14px', border: '1px solid #2d3148' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
                    {calendarDayDetail.date} · {calendarDayDetail.trades.length} 笔交易
                  </span>
                  <button onClick={() => setCalendarDayDetail(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a5268', padding: 2 }}>
                    <span style={{ fontSize: 16, lineHeight: 1 }}>×</span>
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {calendarDayDetail.trades.map(t => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: '#e2e8f0', minWidth: 60 }}>{t.symbol}</span>
                        <span style={{ color: t.direction === 'long' ? '#22c55e' : '#f97316', fontSize: 11 }}>{t.direction === 'long' ? '多' : '空'}</span>
                        <span style={{ color: '#4a5268' }}>{formatCurrency(t.open_price)} → {formatCurrency(t.close_price)}</span>
                      </div>
                      <span style={{ fontWeight: 600, color: t.net_pnl >= 0 ? '#22c55e' : '#ef4444' }}>
                        {t.net_pnl >= 0 ? '+' : ''}{formatCurrency(t.net_pnl)}
                      </span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid #2d3148', marginTop: 4, paddingTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#8892a4' }}>当日合计</span>
                    {(() => {
                      const sum = calendarDayDetail.trades.reduce((s, t) => s + t.net_pnl, 0)
                      return <span style={{ fontWeight: 700, color: sum >= 0 ? '#22c55e' : '#ef4444' }}>{sum >= 0 ? '+' : ''}{formatCurrency(sum)}</span>
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ChartCard({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'linear-gradient(145deg, #1a1d27, #1d2136)',
      border: '1px solid #2d3148',
      borderTop: `2px solid ${accent}`,
      borderRadius: 12,
      padding: '18px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 3, height: 14, background: accent, borderRadius: 2 }} />
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{title}</h3>
      </div>
      {children}
    </div>
  )
}

function EmptyChart() {
  return (
    <div style={{
      height: 180, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 8,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: '#22263a', border: '1px solid #2d3148',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <BarChart2 size={18} color="#4a5268" />
      </div>
      <span style={{ color: '#4a5268', fontSize: 12 }}>暂无数据</span>
    </div>
  )
}
