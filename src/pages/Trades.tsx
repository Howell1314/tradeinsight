import { useState, useMemo, useEffect } from 'react'
import { useTradeStore } from '../store/useTradeStore'
import type { Trade, AssetClass } from '../types/trade'
import { formatCurrency } from '../utils/calculations'
import AddTradeModal from '../components/AddTradeModal'
import CsvImportModal from '../components/CsvImportModal'
import { Plus, Upload, Trash2, Edit3, Search, Filter, Download } from 'lucide-react'
import { useIsMobile } from '../hooks/useIsMobile'

const ASSET_COLORS: Record<AssetClass, string> = {
  crypto: '#f59e0b', equity: '#3b82f6', option: '#8b5cf6',
  etf: '#22c55e', cfd: '#ec4899', futures: '#f97316',
}

const ASSET_LABELS: Record<AssetClass, string> = {
  crypto: 'Crypto', equity: '个股', option: '期权',
  etf: 'ETF', cfd: 'CFD', futures: '期货',
}

const DIR_LABEL: Record<string, string> = {
  buy: '买入', sell: '卖出', short: '做空', cover: '回补',
}

const DIR_COLOR: Record<string, string> = {
  buy: '#22c55e', sell: '#ef4444', short: '#f97316', cover: '#3b82f6',
}

export default function Trades() {
  const { trades, deleteTrade, accounts } = useTradeStore()
  const isMobile = useIsMobile()
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? id
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editTrade, setEditTrade] = useState<Trade | undefined>()
  const [search, setSearch] = useState('')
  const [filterAsset, setFilterAsset] = useState<AssetClass | ''>('')
  const [filterDir, setFilterDir] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterExpanded, setFilterExpanded] = useState(false)
  const [page, setPage] = useState(1)

  const PAGE_SIZE = 20

  // Global 'N' key shortcut to open add trade modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !showAdd && !showImport &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault()
        setEditTrade(undefined)
        setShowAdd(true)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [showAdd, showImport])

  // Build month options from trade data
  const monthOptions = useMemo(() => {
    const months = new Set(trades.map((t) => t.traded_at.slice(0, 7)))
    return [...months].sort().reverse()
  }, [trades])

  const resetPage = () => setPage(1)

  const filtered = trades
    .filter((t) => {
      if (search && !t.symbol.toLowerCase().includes(search.toLowerCase()) &&
        !t.notes.toLowerCase().includes(search.toLowerCase())) return false
      if (filterAsset && t.asset_class !== filterAsset) return false
      if (filterDir && t.direction !== filterDir) return false
      if (filterMonth && !t.traded_at.startsWith(filterMonth)) return false
      if (filterDateFrom && t.traded_at < filterDateFrom) return false
      if (filterDateTo && t.traded_at > filterDateTo + 'T23:59:59') return false
      return true
    })
    .sort((a, b) => new Date(b.traded_at).getTime() - new Date(a.traded_at).getTime())

  const hasFilter = !!(search || filterAsset || filterDir || filterMonth || filterDateFrom || filterDateTo)

  function exportCsv() {
    const headers = ['日期', '品种', '标的', '方向', '数量', '价格', '金额', '佣金', '账户', '合约乘数', '到期日', '备注']
    const rows = filtered.map((t) => {
      const meta = t.metadata as Record<string, unknown>
      return [
        new Date(t.traded_at).toLocaleString('zh-CN'),
        ASSET_LABELS[t.asset_class] || t.asset_class,
        t.symbol,
        DIR_LABEL[t.direction] || t.direction,
        t.quantity,
        t.price,
        t.total_amount,
        t.commission,
        accountName(t.account_id),
        meta?.contract_multiplier ?? 1,
        meta?.expiration ?? '',
        t.notes,
      ]
    })
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `交易记录_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const total = filtered.length
  const pageCount = Math.ceil(total / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const inp = (style?: React.CSSProperties): React.CSSProperties => ({
    padding: '8px 12px', background: '#1a1d27', border: '1px solid #2d3148',
    borderRadius: 8, color: '#e2e8f0', fontSize: 13, outline: 'none', ...style,
  })

  return (
    <div style={{ padding: isMobile ? '12px 10px' : 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isMobile ? 12 : 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#e2e8f0' }}>交易记录</h1>
          <p style={{ margin: '4px 0 0', color: '#8892a4', fontSize: 14 }}>共 {total} 条记录</p>
        </div>
        <div style={{ display: 'flex', gap: isMobile ? 6 : 10 }}>
          {!isMobile && (
            <button onClick={exportCsv} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 16px', borderRadius: 8, border: '1px solid #2d3148',
              background: 'transparent', color: '#8892a4', cursor: 'pointer', fontSize: 14,
            }}>
              <Download size={16} /> 导出
            </button>
          )}
          {!isMobile && (
            <button onClick={() => setShowImport(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 16px', borderRadius: 8, border: '1px solid #2d3148',
              background: 'transparent', color: '#8892a4', cursor: 'pointer', fontSize: 14,
            }}>
              <Upload size={16} /> CSV 导入
            </button>
          )}
          {isMobile && (
            <button onClick={exportCsv} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 38, height: 38, borderRadius: 8, border: '1px solid #2d3148',
              background: 'transparent', color: '#8892a4', cursor: 'pointer',
            }}>
              <Download size={16} />
            </button>
          )}
          {isMobile && (
            <button onClick={() => setShowImport(true)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 38, height: 38, borderRadius: 8, border: '1px solid #2d3148',
              background: 'transparent', color: '#8892a4', cursor: 'pointer',
            }}>
              <Upload size={16} />
            </button>
          )}
          <button onClick={() => { setEditTrade(undefined); setShowAdd(true) }} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: isMobile ? '9px 12px' : '9px 16px', borderRadius: 8, border: 'none',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600,
          }}>
            <Plus size={16} /> {!isMobile && '添加交易'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
        {/* Row 1: search + dropdowns */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: isMobile ? '1 1 100%' : '2 1 200px' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8892a4' }} />
            <input value={search} onChange={(e) => { setSearch(e.target.value); resetPage() }}
              placeholder="搜索标的、备注..." style={{ ...inp(), paddingLeft: 32, width: '100%' }} />
          </div>
          <select value={filterAsset} onChange={(e) => { setFilterAsset(e.target.value as AssetClass | ''); resetPage() }} style={{ ...inp(), flex: '1 1 90px' }}>
            <option value="">全部品种</option>
            {Object.entries(ASSET_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={filterDir} onChange={(e) => { setFilterDir(e.target.value); resetPage() }} style={{ ...inp(), flex: '1 1 90px' }}>
            <option value="">全部方向</option>
            {Object.entries(DIR_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {isMobile ? (
            <button onClick={() => setFilterExpanded((v) => !v)} style={{ ...inp({ cursor: 'pointer' }), display: 'flex', alignItems: 'center', gap: 4, color: (filterMonth || filterDateFrom || filterDateTo) ? '#60a5fa' : '#8892a4', whiteSpace: 'nowrap' }}>
              <Filter size={13} /> {filterExpanded ? '收起' : '更多'}
            </button>
          ) : (
            <select value={filterMonth} onChange={(e) => { setFilterMonth(e.target.value); setFilterDateFrom(''); setFilterDateTo(''); resetPage() }} style={{ ...inp(), flex: '1 1 110px' }}>
              <option value="">全部月份</option>
              {monthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
        </div>

        {/* Row 2: date range (always on desktop, collapsible on mobile) */}
        {(!isMobile || filterExpanded) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {isMobile && (
              <select value={filterMonth} onChange={(e) => { setFilterMonth(e.target.value); setFilterDateFrom(''); setFilterDateTo(''); resetPage() }} style={{ ...inp(), flex: '1 1 100%' }}>
                <option value="">全部月份</option>
                {monthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            <span style={{ fontSize: 12, color: '#8892a4', whiteSpace: 'nowrap' }}>日期</span>
            <input type="date" value={filterDateFrom}
              onChange={(e) => { setFilterDateFrom(e.target.value); setFilterMonth(''); resetPage() }}
              style={{ ...inp({ colorScheme: 'dark', flex: '1 1 120px' }) }} />
            <span style={{ color: '#4a5268', fontSize: 13 }}>—</span>
            <input type="date" value={filterDateTo}
              onChange={(e) => { setFilterDateTo(e.target.value); setFilterMonth(''); resetPage() }}
              style={{ ...inp({ colorScheme: 'dark', flex: '1 1 120px' }) }} />
            {hasFilter && (
              <button onClick={() => { setSearch(''); setFilterAsset(''); setFilterDir(''); setFilterMonth(''); setFilterDateFrom(''); setFilterDateTo(''); resetPage() }}
                style={{ ...inp(), cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                <Filter size={13} /> 清除
              </button>
            )}
          </div>
        )}

        {hasFilter && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#60a5fa' }}>已筛选 {filtered.length} 条</div>
        )}
      </div>

      {/* Table */}
      <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 12, overflow: 'hidden' }}>
        {paged.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: '#4a5268', fontSize: 13 }}>
            {trades.length === 0 ? '暂无交易记录，点击右上角「添加交易」开始记录' : '没有匹配的记录'}
          </div>
        ) : isMobile ? (
          /* Mobile card layout */
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {paged.map((t, i) => (
              <div key={t.id} style={{
                padding: '12px 14px',
                borderBottom: i < paged.length - 1 ? '1px solid #1e2238' : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>{t.symbol}</span>
                    <span style={{
                      padding: '2px 7px', borderRadius: 8, fontSize: 11,
                      background: ASSET_COLORS[t.asset_class] + '22',
                      color: ASSET_COLORS[t.asset_class], fontWeight: 600,
                    }}>{ASSET_LABELS[t.asset_class]}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: DIR_COLOR[t.direction] }}>{DIR_LABEL[t.direction]}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button onClick={() => { setEditTrade(t); setShowAdd(true) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8892a4', padding: 0 }}>
                      <Edit3 size={14} />
                    </button>
                    <button onClick={() => { if (confirm('确认删除此交易记录？')) deleteTrade(t.id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 0 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#8892a4', flexWrap: 'wrap' }}>
                  <span>{new Date(t.traded_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  <span>×{t.quantity} @ <span style={{ color: '#e2e8f0' }}>{formatCurrency(t.price)}</span></span>
                  <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{formatCurrency(t.total_amount)}</span>
                  <span>{accountName(t.account_id)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Desktop table */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2d3148', background: '#161928' }}>
                  {['日期', '品种', '标的', '方向', '数量', '价格', '金额', '佣金', '账户', '标签', ''].map((h) => (
                    <th key={h} style={{ padding: '11px 14px', textAlign: 'left', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 12, letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((t, i) => (
                  <tr key={t.id} style={{
                    borderBottom: i < paged.length - 1 ? '1px solid #1e2238' : 'none',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                  }}>
                    <td style={{ padding: '10px 14px', color: '#8892a4', whiteSpace: 'nowrap' }}>
                      {new Date(t.traded_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, background: ASSET_COLORS[t.asset_class] + '22', color: ASSET_COLORS[t.asset_class], fontWeight: 600 }}>{ASSET_LABELS[t.asset_class]}</span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#e2e8f0', fontWeight: 600 }}>{t.symbol}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ color: DIR_COLOR[t.direction], fontWeight: 600 }}>{DIR_LABEL[t.direction]}</span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#e2e8f0', textAlign: 'right' }}>{t.quantity.toLocaleString()}</td>
                    <td style={{ padding: '10px 14px', color: '#e2e8f0', textAlign: 'right' }}>{formatCurrency(t.price)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}><span style={{ color: '#e2e8f0' }}>{formatCurrency(t.total_amount)}</span></td>
                    <td style={{ padding: '10px 14px', color: '#8892a4', textAlign: 'right' }}>{formatCurrency(t.commission)}</td>
                    <td style={{ padding: '10px 14px', color: '#8892a4' }}>{accountName(t.account_id)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {t.strategy_tags.slice(0, 2).map((tag) => (
                          <span key={tag} style={{ padding: '1px 6px', borderRadius: 6, fontSize: 11, background: '#22263a', color: '#8892a4' }}>{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => { setEditTrade(t); setShowAdd(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8892a4', padding: 2 }}><Edit3 size={15} /></button>
                        <button onClick={() => { if (confirm('确认删除此交易记录？')) deleteTrade(t.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pageCount > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '12px 14px', borderTop: '1px solid #2d3148' }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #2d3148', background: 'transparent', color: page === 1 ? '#4a5268' : '#e2e8f0', cursor: page === 1 ? 'default' : 'pointer', fontSize: 13 }}>
              上一页
            </button>
            <span style={{ color: '#8892a4', fontSize: 13 }}>{page} / {pageCount}</span>
            <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page === pageCount}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #2d3148', background: 'transparent', color: page === pageCount ? '#4a5268' : '#e2e8f0', cursor: page === pageCount ? 'default' : 'pointer', fontSize: 13 }}>
              下一页
            </button>
          </div>
        )}
      </div>

      {showAdd && <AddTradeModal onClose={() => { setShowAdd(false); setEditTrade(undefined) }} editTrade={editTrade} />}
      {showImport && <CsvImportModal onClose={() => setShowImport(false)} />}
    </div>
  )
}
