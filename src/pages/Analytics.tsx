import { useState } from 'react'
import { useTradeStore } from '../store/useTradeStore'
import {
  buildEquityCurve, buildPnLBySymbol, buildPnLByAssetClass,
  buildPnLByMonth, buildPnLByWeekday, buildWinRateByMonth, buildPnLByQuarter,
  computeStats, formatCurrency, formatPercent, formatNumber,
} from '../utils/calculations'
import {
  AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, LineChart, Line, Brush,
} from 'recharts'
import { X } from 'lucide-react'

const ASSET_COLORS: Record<string, string> = {
  crypto: '#f59e0b', equity: '#3b82f6', option: '#8b5cf6',
  etf: '#22c55e', cfd: '#ec4899', futures: '#f97316',
}

const ASSET_LABELS: Record<string, string> = {
  crypto: '数字货币', equity: '美股个股', option: '期权',
  etf: 'ETF', cfd: 'CFD', futures: '期货',
}

type Tab = 'overview' | 'symbols' | 'time' | 'risk'

export default function Analytics() {
  const { closedTrades } = useTradeStore()
  const [tab, setTab] = useState<Tab>('overview')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const equityCurve = buildEquityCurve(closedTrades)
  const pnlBySymbol = buildPnLBySymbol(closedTrades).slice(0, 15)
  const pnlByAsset = buildPnLByAssetClass(closedTrades)
  const pnlByMonth = buildPnLByMonth(closedTrades)
  const pnlByWeekday = buildPnLByWeekday(closedTrades)
  const winRateByMonth = buildWinRateByMonth(closedTrades)
  const pnlByQuarter = buildPnLByQuarter(closedTrades)
  const stats = computeStats(closedTrades)

  const monthData = Object.entries(pnlByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, pnl]) => ({ month, pnl }))

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: '综合分析' },
    { id: 'symbols', label: '标的分析' },
    { id: 'time', label: '时间分析' },
    { id: 'risk', label: '风险指标' },
  ]

  const hasData = closedTrades.length > 0

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#e2e8f0' }}>统计分析</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#1a1d27', padding: 4, borderRadius: 10, border: '1px solid #2d3148', width: 'fit-content' }}>
        {TABS.map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: tab === id ? 600 : 400,
            background: tab === id ? '#22263a' : 'transparent',
            color: tab === id ? '#e2e8f0' : '#8892a4',
          }}>{label}</button>
        ))}
      </div>

      {!hasData && (
        <div style={{ textAlign: 'center', padding: 60, color: '#4a5268', fontSize: 14 }}>
          暂无已结算交易数据，请先添加交易记录
        </div>
      )}

      {hasData && tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Equity curve full */}
          <Card title="累计收益曲线（净值）" hint="点击曲线查看当日交易 · 拖动底部滑块缩放">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={equityCurve} style={{ cursor: 'pointer' }}
                onClick={(data: unknown) => {
                  const d = data as { activePayload?: { payload: { date: string } }[] } | null
                  if (d?.activePayload?.[0]) {
                    const date = d.activePayload[0].payload.date
                    setSelectedDate((prev) => prev === date ? null : date)
                  }
                }}>
                <defs>
                  <linearGradient id="eg2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3148" />
                <XAxis dataKey="date" tick={{ fill: '#8892a4', fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fill: '#8892a4', fontSize: 11 }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
                <Tooltip contentStyle={{ background: '#22263a', border: '1px solid #2d3148', borderRadius: 8 }}
                  formatter={(v) => [formatCurrency(v as number), '净值']} />
                <ReferenceLine y={0} stroke="#2d3148" />
                <Area type="monotone" dataKey="equity" stroke="#3b82f6" fill="url(#eg2)" strokeWidth={2} dot={false}
                  activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }} />
                <Brush dataKey="date" height={22} stroke="#2d3148" fill="#161924"
                  travellerWidth={8} startIndex={Math.max(0, equityCurve.length - 30)} />
              </AreaChart>
            </ResponsiveContainer>

            {/* Selected date trades panel */}
            {selectedDate && (() => {
              const dayTrades = closedTrades.filter((t) => t.closed_at.slice(0, 10) === selectedDate)
              return (
                <div style={{ marginTop: 12, background: '#161924', borderRadius: 10, padding: '12px 14px', border: '1px solid #2d3148' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{selectedDate} 交易记录 ({dayTrades.length} 笔)</span>
                    <button onClick={() => setSelectedDate(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a5268', padding: 2 }}><X size={14} /></button>
                  </div>
                  {dayTrades.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#4a5268' }}>该日期无已结算交易</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {dayTrades.map((t) => (
                        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, color: '#e2e8f0', width: 60 }}>{t.symbol}</span>
                            <span style={{ color: t.direction === 'long' ? '#22c55e' : '#f97316', fontSize: 11 }}>{t.direction === 'long' ? '多' : '空'}</span>
                            <span style={{ color: '#4a5268' }}>{t.quantity} × {formatCurrency(t.open_price)} → {formatCurrency(t.close_price)}</span>
                          </div>
                          <span style={{ fontWeight: 600, color: t.net_pnl >= 0 ? '#22c55e' : '#ef4444' }}>
                            {t.net_pnl >= 0 ? '+' : ''}{formatCurrency(t.net_pnl)}
                          </span>
                        </div>
                      ))}
                      <div style={{ borderTop: '1px solid #2d3148', marginTop: 4, paddingTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: '#8892a4' }}>当日合计</span>
                        {(() => {
                          const sum = dayTrades.reduce((s, t) => s + t.net_pnl, 0)
                          return <span style={{ fontWeight: 700, color: sum >= 0 ? '#22c55e' : '#ef4444' }}>{sum >= 0 ? '+' : ''}{formatCurrency(sum)}</span>
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </Card>

          {/* Key metrics grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { label: '总盈亏', value: formatCurrency(stats.total_pnl), color: stats.total_pnl >= 0 ? '#22c55e' : '#ef4444' },
              { label: '胜率', value: formatPercent(stats.win_rate * 100, 1), color: stats.win_rate >= 0.5 ? '#22c55e' : '#ef4444' },
              { label: '盈亏比', value: isFinite(stats.risk_reward) ? formatNumber(stats.risk_reward, 2) + 'x' : '∞', color: stats.risk_reward >= 1.5 ? '#22c55e' : '#ef4444' },
              { label: '期望值', value: formatCurrency(stats.expectancy), color: stats.expectancy >= 0 ? '#22c55e' : '#ef4444' },
              { label: '最大回撤', value: formatPercent(-stats.max_drawdown, 1), color: '#ef4444' },
              { label: '利润因子', value: isFinite(stats.profit_factor) ? formatNumber(stats.profit_factor, 2) : '∞', color: stats.profit_factor > 1 ? '#22c55e' : '#ef4444' },
              { label: '夏普比率', value: formatNumber(stats.sharpe_ratio, 2), color: stats.sharpe_ratio >= 1 ? '#22c55e' : '#eab308' },
              { label: '平均持仓', value: formatNumber(stats.avg_holding_days, 1) + ' 天', color: '#8892a4' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, color: '#8892a4', marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Per-asset breakdown */}
          <Card title="各品种盈亏">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(pnlByAsset).map(([asset, pnl]) => {
                const total = Object.values(pnlByAsset).reduce((s, v) => s + Math.abs(v), 0)
                const pct = total > 0 ? Math.abs(pnl) / total * 100 : 0
                return (
                  <div key={asset} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 70, fontSize: 13, color: ASSET_COLORS[asset] || '#8892a4' }}>{ASSET_LABELS[asset] || asset}</span>
                    <div style={{ flex: 1, height: 8, background: '#22263a', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: ASSET_COLORS[asset] || '#3b82f6', borderRadius: 4 }} />
                    </div>
                    <span style={{ width: 100, textAlign: 'right', fontSize: 13, fontWeight: 600, color: pnl >= 0 ? '#22c55e' : '#ef4444' }}>
                      {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      )}

      {hasData && tab === 'symbols' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="标的盈亏排行（Top 15）">
            <ResponsiveContainer width="100%" height={Math.max(250, pnlBySymbol.length * 30 + 40)}>
              <BarChart data={pnlBySymbol} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3148" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#8892a4', fontSize: 11 }} tickLine={false}
                  tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
                <YAxis type="category" dataKey="symbol" tick={{ fill: '#e2e8f0', fontSize: 12 }} tickLine={false} width={70} />
                <Tooltip contentStyle={{ background: '#22263a', border: '1px solid #2d3148', borderRadius: 8 }}
                  formatter={(v) => [formatCurrency(v as number), 'P&L']} />
                <ReferenceLine x={0} stroke="#2d3148" />
                <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>
                  {pnlBySymbol.map((entry, i) => (
                    <Cell key={i} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Trade list per symbol */}
          <Card title="标的详情">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2d3148' }}>
                  {['标的', '交易次数', '胜率', '总盈亏', '平均盈亏'].map((h) => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#8892a4', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pnlBySymbol.map(({ symbol, pnl }) => {
                  const symbolTrades = closedTrades.filter((t) => t.symbol === symbol)
                  const wins = symbolTrades.filter((t) => t.net_pnl > 0)
                  return (
                    <tr key={symbol} style={{ borderBottom: '1px solid #2d3148' }}>
                      <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 700 }}>{symbol}</td>
                      <td style={{ padding: '8px 12px', color: '#8892a4' }}>{symbolTrades.length}</td>
                      <td style={{ padding: '8px 12px', color: wins.length / symbolTrades.length >= 0.5 ? '#22c55e' : '#ef4444' }}>
                        {formatPercent(wins.length / symbolTrades.length * 100, 1)}
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: pnl >= 0 ? '#22c55e' : '#ef4444' }}>
                        {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                      </td>
                      <td style={{ padding: '8px 12px', color: pnl / symbolTrades.length >= 0 ? '#22c55e' : '#ef4444' }}>
                        {(pnl / symbolTrades.length >= 0 ? '+' : '')}{formatCurrency(pnl / symbolTrades.length)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {hasData && tab === 'time' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Monthly P&L */}
          <Card title="月度盈亏">
            {monthData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3148" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#8892a4', fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fill: '#8892a4', fontSize: 11 }} tickLine={false} axisLine={false}
                    tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
                  <Tooltip contentStyle={{ background: '#22263a', border: '1px solid #2d3148', borderRadius: 8 }}
                    formatter={(v) => [formatCurrency(v as number), '月度P&L']} />
                  <ReferenceLine y={0} stroke="#2d3148" />
                  <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                    {monthData.map((e, i) => <Cell key={i} fill={e.pnl >= 0 ? '#22c55e' : '#ef4444'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </Card>

          {/* Weekday P&L */}
          <Card title="星期盈亏分布">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={pnlByWeekday}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3148" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: '#8892a4', fontSize: 12 }} tickLine={false} />
                <YAxis tick={{ fill: '#8892a4', fontSize: 11 }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
                <Tooltip contentStyle={{ background: '#22263a', border: '1px solid #2d3148', borderRadius: 8 }}
                  formatter={(v, name) => [(name as string) === 'pnl' ? formatCurrency(v as number) : v, (name as string) === 'pnl' ? '盈亏' : '交易次数']} />
                <ReferenceLine y={0} stroke="#2d3148" />
                <Bar dataKey="pnl" name="pnl" radius={[4, 4, 0, 0]}>
                  {pnlByWeekday.map((e, i) => <Cell key={i} fill={e.pnl >= 0 ? '#22c55e' : '#ef4444'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Win rate by month */}
          <Card title="月度胜率趋势">
            {winRateByMonth.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={winRateByMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3148" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: '#8892a4', fontSize: 11 }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: '#8892a4', fontSize: 11 }} tickLine={false} axisLine={false}
                    tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={{ background: '#22263a', border: '1px solid #2d3148', borderRadius: 8 }}
                    formatter={(v, _n, props) => [`${(v as number).toFixed(1)}% (${(props as { payload: { count: number } }).payload.count}笔)`, '胜率']} />
                  <ReferenceLine y={50} stroke="#4a5268" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="winRate" stroke="#f59e0b" strokeWidth={2}
                    dot={{ fill: '#f59e0b', r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </Card>

          {/* Quarterly P&L */}
          {pnlByQuarter.length > 0 && (
            <Card title="季度盈亏对比">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={pnlByQuarter}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3148" vertical={false} />
                  <XAxis dataKey="quarter" tick={{ fill: '#8892a4', fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fill: '#8892a4', fontSize: 11 }} tickLine={false} axisLine={false}
                    tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
                  <Tooltip contentStyle={{ background: '#22263a', border: '1px solid #2d3148', borderRadius: 8 }}
                    formatter={(v, _n, props) => [formatCurrency(v as number), `${(props as { payload: { count: number } }).payload.count}笔`]} />
                  <ReferenceLine y={0} stroke="#2d3148" />
                  <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                    {pnlByQuarter.map((e, i) => <Cell key={i} fill={e.pnl >= 0 ? '#22c55e' : '#ef4444'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Monthly table */}
          <Card title="月度统计表">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2d3148' }}>
                  {['月份', '交易次数', '盈利笔', '亏损笔', '月度盈亏', '胜率'].map((h) => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#8892a4', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthData.map(({ month, pnl }) => {
                  const monthTrades = closedTrades.filter((t) => t.closed_at.slice(0, 7) === month)
                  const wins = monthTrades.filter((t) => t.net_pnl > 0)
                  return (
                    <tr key={month} style={{ borderBottom: '1px solid #2d3148' }}>
                      <td style={{ padding: '8px 12px', color: '#e2e8f0', fontWeight: 600 }}>{month}</td>
                      <td style={{ padding: '8px 12px', color: '#8892a4' }}>{monthTrades.length}</td>
                      <td style={{ padding: '8px 12px', color: '#22c55e' }}>{wins.length}</td>
                      <td style={{ padding: '8px 12px', color: '#ef4444' }}>{monthTrades.length - wins.length}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: pnl >= 0 ? '#22c55e' : '#ef4444' }}>
                        {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                      </td>
                      <td style={{ padding: '8px 12px', color: wins.length / monthTrades.length >= 0.5 ? '#22c55e' : '#ef4444' }}>
                        {formatPercent(wins.length / monthTrades.length * 100, 1)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {hasData && tab === 'risk' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Risk metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { label: '最大回撤', value: formatPercent(-stats.max_drawdown, 2), desc: '权益峰值到谷值的最大跌幅', color: '#ef4444' },
              { label: '夏普比率', value: formatNumber(stats.sharpe_ratio, 3), desc: '风险调整后收益（年化）', color: stats.sharpe_ratio >= 1 ? '#22c55e' : '#eab308' },
              { label: '利润因子', value: isFinite(stats.profit_factor) ? formatNumber(stats.profit_factor, 3) : '∞', desc: '总利润 / 总亏损', color: stats.profit_factor > 1 ? '#22c55e' : '#ef4444' },
              { label: '期望值', value: formatCurrency(stats.expectancy), desc: '每笔交易的数学期望收益', color: stats.expectancy >= 0 ? '#22c55e' : '#ef4444' },
              { label: '最长连胜', value: `${stats.max_consecutive_wins} 笔`, desc: '历史最长连续盈利', color: '#22c55e' },
              { label: '最长连亏', value: `${stats.max_consecutive_losses} 笔`, desc: '历史最长连续亏损', color: '#ef4444' },
            ].map(({ label, value, desc, color }) => (
              <div key={label} style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ fontSize: 12, color: '#8892a4', marginBottom: 8 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color, marginBottom: 6 }}>{value}</div>
                <div style={{ fontSize: 11, color: '#4a5268' }}>{desc}</div>
              </div>
            ))}
          </div>

          {/* Drawdown visualization */}
          <Card title="逐笔盈亏分布">
            {(() => {
              const data = closedTrades
                .sort((a, b) => new Date(a.closed_at).getTime() - new Date(b.closed_at).getTime())
                .map((t, i) => ({ index: i + 1, pnl: t.net_pnl, symbol: t.symbol }))
              return (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2d3148" vertical={false} />
                    <XAxis dataKey="index" tick={{ fill: '#8892a4', fontSize: 10 }} tickLine={false} label={{ value: '交易序号', position: 'insideBottom', fill: '#8892a4', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#8892a4', fontSize: 11 }} tickLine={false} axisLine={false}
                      tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
                    <Tooltip contentStyle={{ background: '#22263a', border: '1px solid #2d3148', borderRadius: 8 }}
                      formatter={(v, _name, props) => [formatCurrency(v as number), (props as { payload: { symbol: string } }).payload.symbol]} />
                    <ReferenceLine y={0} stroke="#3d4263" />
                    <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                      {data.map((e, i) => <Cell key={i} fill={e.pnl >= 0 ? '#22c55e' : '#ef4444'} fillOpacity={0.8} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )
            })()}
          </Card>
        </div>
      )}
    </div>
  )
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 12, padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>{title}</h3>
        {hint && <span style={{ fontSize: 11, color: '#4a5268' }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function EmptyChart() {
  return (
    <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a5268', fontSize: 13 }}>
      暂无数据
    </div>
  )
}
