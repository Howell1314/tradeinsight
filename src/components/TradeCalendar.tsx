import { useMemo, useState } from 'react'
import type { ClosedTrade } from '../types/trade'
import { formatCurrency } from '../utils/calculations'

interface Props {
  closedTrades: ClosedTrade[]
  /** How many months to display (default 12) */
  months?: number
  onDayClick?: (date: string, trades: ClosedTrade[]) => void
}

interface DayData {
  date: string
  pnl: number
  count: number
}

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

function getMonthGrid(year: number, month: number): (string | null)[] {
  // month: 1-based
  const firstDay = new Date(year, month - 1, 1)
  // Monday-first: 0=Mon … 6=Sun
  const startOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: (string | null)[] = Array(startOffset).fill(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  // Pad end to complete last week
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function cellColor(pnl: number, maxAbs: number): string {
  if (maxAbs === 0) return '#22263a'
  const ratio = Math.min(Math.abs(pnl) / maxAbs, 1)
  if (pnl > 0) {
    // green gradient: #1e3a2a → #22c55e
    const r = Math.round(30 + ratio * (34 - 30))
    const g = Math.round(58 + ratio * (197 - 58))
    const b = Math.round(42 + ratio * (94 - 42))
    return `rgb(${r},${g},${b})`
  } else {
    // red gradient: #3a1e1e → #ef4444
    const r = Math.round(58 + ratio * (239 - 58))
    const g = Math.round(30 + ratio * (68 - 30))
    const b = Math.round(30 + ratio * (68 - 30))
    return `rgb(${r},${g},${b})`
  }
}

export default function TradeCalendar({ closedTrades, months = 12, onDayClick }: Props) {
  const [tooltip, setTooltip] = useState<{ date: string; pnl: number; count: number; x: number; y: number } | null>(null)

  const dayMap = useMemo<Record<string, DayData>>(() => {
    const map: Record<string, DayData> = {}
    for (const t of closedTrades) {
      const date = t.closed_at.slice(0, 10)
      if (!map[date]) map[date] = { date, pnl: 0, count: 0 }
      map[date].pnl += t.net_pnl
      map[date].count++
    }
    return map
  }, [closedTrades])

  const maxAbs = useMemo(
    () => Math.max(...Object.values(dayMap).map(d => Math.abs(d.pnl)), 1),
    [dayMap],
  )

  // Build list of months to display (last N months ending this month)
  const monthList = useMemo(() => {
    const now = new Date()
    const result: { year: number; month: number }[] = []
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      result.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
    }
    // Filter to only months that have trade data or are current/recent
    return result
  }, [months])

  const handleMouseEnter = (e: React.MouseEvent, data: DayData) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    setTooltip({ ...data, x: rect.left + rect.width / 2, y: rect.top - 8 })
  }

  const handleMouseLeave = () => setTooltip(null)

  if (closedTrades.length === 0) {
    return (
      <div style={{ color: '#4a5268', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
        暂无数据
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Month grids */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
        {monthList.map(({ year, month }) => {
          const cells = getMonthGrid(year, month)
          const label = `${year}/${String(month).padStart(2, '0')}`
          return (
            <div key={label} style={{ minWidth: 160 }}>
              <div style={{ fontSize: 11, color: '#8892a4', marginBottom: 6, fontWeight: 600 }}>{label}</div>
              {/* Weekday header */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 20px)', gap: 2, marginBottom: 2 }}>
                {WEEKDAY_LABELS.map(d => (
                  <div key={d} style={{ fontSize: 9, color: '#4a5268', textAlign: 'center', lineHeight: '20px' }}>{d}</div>
                ))}
              </div>
              {/* Day cells */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 20px)', gap: 2 }}>
                {cells.map((date, i) => {
                  if (!date) return <div key={i} style={{ width: 20, height: 20 }} />
                  const data = dayMap[date]
                  const hasData = !!data
                  const bg = hasData ? cellColor(data.pnl, maxAbs) : '#1e2238'
                  return (
                    <div
                      key={date}
                      onMouseEnter={hasData ? (e) => handleMouseEnter(e, data) : undefined}
                      onMouseLeave={hasData ? handleMouseLeave : undefined}
                      onClick={hasData && onDayClick ? () => onDayClick(date, closedTrades.filter(t => t.closed_at.slice(0, 10) === date)) : undefined}
                      style={{
                        width: 20, height: 20,
                        borderRadius: 3,
                        background: bg,
                        cursor: hasData ? (onDayClick ? 'pointer' : 'default') : 'default',
                        border: hasData ? `1px solid ${bg}` : '1px solid #232740',
                        transition: 'transform 0.1s',
                        boxSizing: 'border-box',
                      }}
                      onMouseOver={hasData ? (e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.3)' } : undefined}
                      onMouseOut={hasData ? (e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' } : undefined}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14 }}>
        <span style={{ fontSize: 10, color: '#4a5268' }}>亏损</span>
        {[-1, -0.6, -0.3, 0, 0.3, 0.6, 1].map((ratio, i) => (
          <div key={i} style={{
            width: 12, height: 12, borderRadius: 2,
            background: ratio === 0 ? '#1e2238' : cellColor(ratio * maxAbs, maxAbs),
          }} />
        ))}
        <span style={{ fontSize: 10, color: '#4a5268' }}>盈利</span>
        <span style={{ marginLeft: 12, fontSize: 10, color: '#4a5268' }}>· 无交易</span>
        <div style={{ width: 12, height: 12, borderRadius: 2, background: '#1e2238', border: '1px solid #232740', display: 'inline-block' }} />
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.x,
          top: tooltip.y,
          transform: 'translate(-50%, -100%)',
          background: '#22263a',
          border: '1px solid #2d3148',
          borderRadius: 8,
          padding: '6px 10px',
          fontSize: 12,
          color: '#e2e8f0',
          pointerEvents: 'none',
          zIndex: 9999,
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{tooltip.date}</div>
          <div style={{ color: tooltip.pnl >= 0 ? '#22c55e' : '#ef4444' }}>
            {tooltip.pnl >= 0 ? '+' : ''}{formatCurrency(tooltip.pnl)}
          </div>
          <div style={{ color: '#8892a4', fontSize: 11 }}>{tooltip.count} 笔交易</div>
        </div>
      )}
    </div>
  )
}
