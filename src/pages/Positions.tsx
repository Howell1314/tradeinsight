import { useState } from 'react'
import { useTradeStore } from '../store/useTradeStore'
import { formatCurrency, formatPercent } from '../utils/calculations'
import { useIsMobile } from '../hooks/useIsMobile'
import type { AssetClass } from '../types/trade'
import { Edit2, Check, RefreshCw, BookOpen } from 'lucide-react'
import { fetchPrices, fetchPrice } from '../lib/priceApi'
import { ASSET_COLORS, ASSET_LABELS } from '../constants/assets'

/** Returns a short relative-time label when price is stale (>30 min), null otherwise. */
function priceAgeLabel(updatedAt: number | undefined): { label: string; stale: boolean } | null {
  if (!updatedAt) return null
  const ageMs = Date.now() - updatedAt
  if (ageMs < 30 * 60 * 1000) return null // fresh — no label
  const ageMin = Math.floor(ageMs / 60000)
  if (ageMin < 60) return { label: `${ageMin}分钟前`, stale: false }
  const ageH = Math.floor(ageMin / 60)
  if (ageH < 24) return { label: `${ageH}小时前`, stale: ageH >= 4 }
  const ageD = Math.floor(ageH / 24)
  return { label: `${ageD}天前`, stale: true }
}

function PriceEditor({ symbol, assetClass, current, updatedAt, onSave }: {
  symbol: string; assetClass: AssetClass; current: number
  updatedAt?: number; onSave: (v: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(current))
  const [refreshing, setRefreshing] = useState(false)

  const commit = () => {
    const n = parseFloat(val)
    if (!isNaN(n) && n > 0) onSave(n)
    setEditing(false)
  }

  const refresh = async () => {
    setRefreshing(true)
    const price = await fetchPrice(symbol, assetClass)
    setRefreshing(false)
    if (price != null) { onSave(price); setVal(String(price)) }
  }

  const age = priceAgeLabel(updatedAt)

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number" step="any" min="0" autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          style={{
            width: 90, padding: '3px 6px', background: '#22263a',
            border: '1px solid #3b82f6', borderRadius: 6,
            color: '#e2e8f0', fontSize: 13, outline: 'none',
          }}
        />
        <button onClick={commit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#22c55e', padding: 2 }}>
          <Check size={14} />
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ color: '#e2e8f0' }}>{formatCurrency(current)}</span>
        <button onClick={refresh} disabled={refreshing} title="从行情接口刷新价格"
          style={{ background: 'none', border: 'none', cursor: refreshing ? 'default' : 'pointer', color: refreshing ? '#3b82f6' : '#4a5268', padding: 2,
            animation: refreshing ? 'spin 1s linear infinite' : 'none' }}>
          <RefreshCw size={12} />
        </button>
        <button
          onClick={() => { setVal(String(current)); setEditing(true) }}
          title="手动输入价格"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a5268', padding: 2 }}
        >
          <Edit2 size={12} />
        </button>
      </div>
      {age && (
        <span style={{
          fontSize: 10, color: age.stale ? '#f59e0b' : '#6b7280',
          lineHeight: 1, letterSpacing: '0.02em',
        }} title="价格更新时间">
          {age.stale ? '⚠ ' : ''}{age.label}
        </span>
      )}
    </div>
  )
}

export default function Positions() {
  const { openPositions, closedTrades, updateCurrentPrice, setView, currentPriceTimes } = useTradeStore()
  const isMobile = useIsMobile()
  const [refreshingAll, setRefreshingAll] = useState(false)

  const refreshAll = async () => {
    if (openPositions.length === 0) return
    setRefreshingAll(true)
    const priceMap = await fetchPrices(
      openPositions.map(p => ({ symbol: p.symbol, assetClass: p.asset_class }))
    )
    for (const pos of openPositions) {
      const price = priceMap[pos.symbol]
      if (price != null) updateCurrentPrice(pos.account_id, pos.symbol, price)
    }
    setRefreshingAll(false)
  }

  const recentClosed = [...closedTrades]
    .sort((a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime())
    .slice(0, 10)

  const totalUnrealizedPnl = openPositions.reduce((s, p) => s + p.unrealized_pnl, 0)

  const sectionHeader = (label: string, color: string, count?: number, extra?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <div style={{ width: 3, height: 16, background: color, borderRadius: 2 }} />
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>{label}</h2>
      {count !== undefined && count > 0 && (
        <span style={{ fontSize: 12, padding: '1px 8px', borderRadius: 10, background: color + '20', color, fontWeight: 600 }}>{count}</span>
      )}
      {extra}
    </div>
  )

  const emptyBox = (text: string) => (
    <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 12, padding: 32, textAlign: 'center', color: '#4a5268' }}>{text}</div>
  )

  return (
    <div style={{ padding: isMobile ? '12px 10px' : 24 }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div style={{ marginBottom: isMobile ? 16 : 24 }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 700, color: '#e2e8f0' }}>持仓管理</h1>
        <p style={{ margin: '4px 0 0', color: '#8892a4', fontSize: 13 }}>
          {openPositions.length} 个持仓中 · {closedTrades.length} 笔已结算
          {openPositions.length > 0 && (
            <span style={{ marginLeft: 12, color: totalUnrealizedPnl >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
              浮动盈亏: {totalUnrealizedPnl >= 0 ? '+' : ''}{formatCurrency(totalUnrealizedPnl)}
            </span>
          )}
        </p>
      </div>

      {/* Open Positions */}
      <div style={{ marginBottom: 20 }}>
        {sectionHeader('未平仓持仓', '#3b82f6', openPositions.length,
          openPositions.length > 0 ? (
            <button onClick={refreshAll} disabled={refreshingAll}
              style={{
                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 6, border: '1px solid #2d3148',
                background: 'transparent', color: refreshingAll ? '#3b82f6' : '#8892a4',
                cursor: refreshingAll ? 'default' : 'pointer', fontSize: 12,
              }}>
              <RefreshCw size={12} style={{ animation: refreshingAll ? 'spin 1s linear infinite' : 'none' }} />
              {refreshingAll ? '刷新中…' : '一键刷新行情'}
            </button>
          ) : undefined
        )}
        {openPositions.length === 0 ? emptyBox('暂无未平仓持仓') : isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {openPositions.map((pos) => {
              const days = Math.round((Date.now() - new Date(pos.opened_at).getTime()) / 86400000)
              return (
                <div key={pos.id} style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>{pos.symbol}</span>
                      <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 8, background: ASSET_COLORS[pos.asset_class] + '22', color: ASSET_COLORS[pos.asset_class] }}>{ASSET_LABELS[pos.asset_class]}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: pos.quantity >= 0 ? '#22c55e' : '#f97316' }}>{pos.quantity >= 0 ? '多头' : '空头'}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: pos.unrealized_pnl >= 0 ? '#22c55e' : '#ef4444' }}>
                        {pos.unrealized_pnl >= 0 ? '+' : ''}{formatCurrency(pos.unrealized_pnl)}
                      </div>
                      <div style={{ fontSize: 11, color: pos.unrealized_pnl_pct >= 0 ? '#22c55e' : '#ef4444' }}>
                        {formatPercent(pos.unrealized_pnl_pct, 2)}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 12, color: '#8892a4' }}>
                    <span>数量: <span style={{ color: '#e2e8f0' }}>{Math.abs(pos.quantity)}</span></span>
                    <span>均价: <span style={{ color: '#e2e8f0' }}>{formatCurrency(pos.avg_cost)}</span></span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      现价:
                      <PriceEditor
                        symbol={pos.symbol} assetClass={pos.asset_class}
                        current={pos.current_price}
                        updatedAt={currentPriceTimes[`${pos.account_id}::${pos.symbol}`]}
                        onSave={(p) => updateCurrentPrice(pos.account_id, pos.symbol, p)}
                      />
                    </span>
                    <span>持仓 {days} 天</span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #2d3148', background: '#161928' }}>
                    {['品种', '标的', '方向', '数量', '成本均价', '当前价格', '浮动盈亏', '浮动%', '持仓时长', '开仓时间'].map((h) => (
                      <th key={h} style={{ padding: '11px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {openPositions.map((pos) => {
                    const days = Math.round((Date.now() - new Date(pos.opened_at).getTime()) / 86400000)
                    return (
                      <tr key={pos.id} style={{ borderBottom: '1px solid #2d3148' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, background: ASSET_COLORS[pos.asset_class] + '22', color: ASSET_COLORS[pos.asset_class], fontWeight: 600 }}>{ASSET_LABELS[pos.asset_class]}</span>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#e2e8f0', fontWeight: 700 }}>{pos.symbol}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: pos.quantity >= 0 ? '#22c55e' : '#f97316' }}>{pos.quantity >= 0 ? '多头' : '空头'}</td>
                        <td style={{ padding: '10px 14px', color: '#e2e8f0' }}>{Math.abs(pos.quantity).toLocaleString()}</td>
                        <td style={{ padding: '10px 14px', color: '#e2e8f0' }}>{formatCurrency(pos.avg_cost)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <PriceEditor
                            symbol={pos.symbol} assetClass={pos.asset_class}
                            current={pos.current_price}
                            updatedAt={currentPriceTimes[`${pos.account_id}::${pos.symbol}`]}
                            onSave={(p) => updateCurrentPrice(pos.account_id, pos.symbol, p)}
                          />
                        </td>
                        <td style={{ padding: '10px 14px', color: pos.unrealized_pnl >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                          {pos.unrealized_pnl >= 0 ? '+' : ''}{formatCurrency(pos.unrealized_pnl)}
                        </td>
                        <td style={{ padding: '10px 14px', color: pos.unrealized_pnl_pct >= 0 ? '#22c55e' : '#ef4444', fontSize: 12 }}>
                          {formatPercent(pos.unrealized_pnl_pct, 2)}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#8892a4' }}>{days} 天</td>
                        <td style={{ padding: '10px 14px', color: '#8892a4' }}>{new Date(pos.opened_at).toLocaleDateString('zh-CN')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Recently Closed */}
      <div>
        {sectionHeader('最近结算交易', '#22c55e')}
        {recentClosed.length === 0 ? emptyBox('暂无已结算交易') : isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentClosed.map((ct) => (
              <div key={ct.id} style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>{ct.symbol}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: ct.direction === 'long' ? '#22c55e' : '#f97316' }}>{ct.direction === 'long' ? '多头' : '空头'}</span>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: ct.net_pnl >= 0 ? '#22c55e' : '#ef4444' }}>
                    {ct.net_pnl >= 0 ? '+' : ''}{formatCurrency(ct.net_pnl)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#8892a4', flexWrap: 'wrap' }}>
                  <span>数量: {ct.quantity}</span>
                  <span>{formatCurrency(ct.open_price)} → {formatCurrency(ct.close_price)}</span>
                  <span>{ct.holding_days}天 · {new Date(ct.closed_at).toLocaleDateString('zh-CN')}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #2d3148', background: '#161928' }}>
                    {['标的', '方向', '数量', '开仓价', '平仓价', '净盈亏', '持仓天数', '结算时间', ''].map((h) => (
                      <th key={h} style={{ padding: '11px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentClosed.map((ct, i) => (
                    <tr key={ct.id} style={{ borderBottom: '1px solid #2d3148', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                      <td style={{ padding: '10px 14px', color: '#e2e8f0', fontWeight: 700 }}>{ct.symbol}</td>
                      <td style={{ padding: '10px 14px', color: ct.direction === 'long' ? '#22c55e' : '#f97316', fontWeight: 600 }}>{ct.direction === 'long' ? '多头' : '空头'}</td>
                      <td style={{ padding: '10px 14px', color: '#e2e8f0' }}>{ct.quantity.toLocaleString()}</td>
                      <td style={{ padding: '10px 14px', color: '#e2e8f0' }}>{formatCurrency(ct.open_price)}</td>
                      <td style={{ padding: '10px 14px', color: '#e2e8f0' }}>{formatCurrency(ct.close_price)}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: ct.net_pnl >= 0 ? '#22c55e' : '#ef4444' }}>{ct.net_pnl >= 0 ? '+' : ''}{formatCurrency(ct.net_pnl)}</td>
                      <td style={{ padding: '10px 14px', color: '#8892a4' }}>{ct.holding_days} 天</td>
                      <td style={{ padding: '10px 14px', color: '#8892a4' }}>{new Date(ct.closed_at).toLocaleDateString('zh-CN')}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <button
                          onClick={() => {
                            localStorage.setItem('tradeinsight-journal-prefill', ct.closed_at.slice(0, 10))
                            setView('journal')
                          }}
                          title="为该日期写日志"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            background: 'none', border: '1px solid #2d3148', borderRadius: 6,
                            padding: '3px 8px', cursor: 'pointer', color: '#8892a4', fontSize: 11,
                          }}>
                          <BookOpen size={11} /> 写日志
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
