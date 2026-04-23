import { useState, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useTradeStore } from '../store/useTradeStore'
import { useAuthStore } from '../store/useAuthStore'
import {
  LayoutDashboard, TrendingUp, BookOpen, BarChart2, Briefcase,
  Plus, Trash2, X, Check, UserCircle, Menu, Bell, LineChart, Target,
} from 'lucide-react'
import { generateId } from '../utils/calculations'
import { useIsMobile } from '../hooks/useIsMobile'
import { useNotifications } from '../hooks/useNotifications'

const NAV_ITEMS = [
  { id: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
  { id: 'plans', label: '交易计划', icon: Target },
  { id: 'trades', label: '交易记录', icon: TrendingUp },
  { id: 'positions', label: '持仓管理', icon: Briefcase },
  { id: 'analytics', label: '统计分析', icon: BarChart2 },
  { id: 'journal', label: '交易日志', icon: BookOpen },
  { id: 'chart', label: 'K线图表', icon: LineChart },
] as const

export default function Layout({ children }: { children: ReactNode }) {
  const { view, setView, accounts, selectedAccount, setSelectedAccount, addAccount, deleteAccount, closedTrades, riskRules } = useTradeStore()
  const { user, profile } = useAuthStore()
  const displayName = profile?.nickname || user?.email?.split('@')[0] || ''
  const isMobile = useIsMobile()

  // Risk badge computation
  const today = new Date().toISOString().slice(0, 10)
  const todayPnl = closedTrades.filter(t => t.closed_at.slice(0, 10) === today).reduce((s, t) => s + t.net_pnl, 0)
  const weekStart = (() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10)
  })()
  const weekPnl = closedTrades.filter(t => t.closed_at.slice(0, 10) >= weekStart).reduce((s, t) => s + t.net_pnl, 0)

  type RiskLevel = 'ok' | 'warning' | 'danger'
  let riskLevel: RiskLevel = 'ok'
  let riskLabel = ''
  if (riskRules.maxDailyLoss && todayPnl <= -riskRules.maxDailyLoss) {
    riskLevel = 'danger'; riskLabel = '单日亏损触发'
  } else if (riskRules.maxDailyLoss && todayPnl <= -(riskRules.maxDailyLoss * 0.8)) {
    riskLevel = 'warning'; riskLabel = '接近单日限额'
  } else if (riskRules.monthlyTarget) {
    const currentMonth = new Date().toISOString().slice(0, 7)
    const monthPnl = closedTrades.filter(t => t.closed_at.slice(0, 7) === currentMonth).reduce((s, t) => s + t.net_pnl, 0)
    if (monthPnl <= -(riskRules.monthlyTarget * 0.8)) {
      riskLevel = 'warning'; riskLabel = '本月亏损偏高'
    }
  }
  // suppress unused weekPnl warning — may be used in future rules
  void weekPnl

  const [showAddAccount, setShowAddAccount] = useState(false)
  const [newAccountName, setNewAccountName] = useState('')
  const [newAccountBroker, setNewAccountBroker] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const notifRef = useRef<HTMLDivElement>(null)
  const notifications = useNotifications()
  const visibleNotifications = notifications.filter(n => !dismissedIds.has(n.id))

  const dismissNotif = (id: string) => setDismissedIds(prev => new Set([...prev, id]))
  const dismissAll = () => setDismissedIds(new Set(notifications.map(n => n.id)))

  // Close notification panel when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const closeSidebar = () => setSidebarOpen(false)
  const navAndClose = (id: typeof view) => { setView(id); if (isMobile) closeSidebar() }

  const handleAddAccount = () => {
    const name = newAccountName.trim()
    if (!name) return
    const id = generateId()
    addAccount({ id, name, currency: 'USD', broker: newAccountBroker.trim() || undefined })
    setSelectedAccount(id)
    setNewAccountName('')
    setNewAccountBroker('')
    setShowAddAccount(false)
  }

  const currentLabel = NAV_ITEMS.find((n) => n.id === view)?.label ?? (view === 'profile' ? '个人资料' : '仪表盘')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0f1117' }}>
      <style>{`@keyframes riskPulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
      {/* Mobile overlay backdrop */}
      {isMobile && sidebarOpen && (
        <div onClick={closeSidebar} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          zIndex: 99, backdropFilter: 'blur(2px)',
        }} />
      )}

      {/* Sidebar */}
      <aside style={{
        width: 220,
        background: '#1a1d27',
        borderRight: '1px solid #2d3148',
        display: 'flex',
        flexDirection: 'column',
        padding: '0 0 16px',
        flexShrink: 0,
        // Mobile: fixed drawer
        ...(isMobile ? {
          position: 'fixed', top: 0, left: 0, height: '100vh',
          zIndex: 100, transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
        } : {}),
      }}>
        {/* Logo */}
        <div style={{
          padding: '18px 20px 16px',
          borderBottom: '1px solid #2d3148',
          marginBottom: 8,
          background: 'linear-gradient(180deg, #1e2236 0%, #1a1d27 100%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 17, fontWeight: 800, color: '#fff',
                boxShadow: '0 2px 8px rgba(59,130,246,0.35)',
              }}>T</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#e2e8f0', lineHeight: 1 }}>TradeInsight</div>
                <div style={{ fontSize: 10, color: '#4a5268', marginTop: 2 }}>交易分析平台</div>
              </div>
              {riskLevel !== 'ok' && (
                <div style={{
                  padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                  background: riskLevel === 'danger' ? '#ef444420' : '#f59e0b20',
                  border: `1px solid ${riskLevel === 'danger' ? '#ef444450' : '#f59e0b50'}`,
                  color: riskLevel === 'danger' ? '#f87171' : '#fbbf24',
                  animation: riskLevel === 'danger' ? 'riskPulse 1.5s ease-in-out infinite' : 'none',
                  whiteSpace: 'nowrap' as const,
                }}>
                  {riskLevel === 'danger' ? '⚠' : '!'} {riskLabel}
                </div>
              )}
            </div>
            {isMobile && (
              <button onClick={closeSidebar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8892a4', padding: 4 }}>
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Account selector */}
        <div style={{ padding: '0 12px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <label style={{ fontSize: 11, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '0.08em' }}>账户</label>
            <button
              onClick={() => setShowAddAccount((v) => !v)}
              title="新建账户"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#4a5268', padding: 2, lineHeight: 1, borderRadius: 4,
                display: 'flex', alignItems: 'center',
              }}
            >
              <Plus size={13} />
            </button>
          </div>

          {/* New account inline form */}
          {showAddAccount && (
            <div style={{
              background: '#22263a', border: '1px solid #2d3148',
              borderRadius: 8, padding: '10px', marginBottom: 6,
            }}>
              <input
                autoFocus
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddAccount(); if (e.key === 'Escape') setShowAddAccount(false) }}
                placeholder="账户名称"
                style={{
                  width: '100%', padding: '5px 8px', marginBottom: 6,
                  background: '#1a1d27', border: '1px solid #2d3148',
                  borderRadius: 6, color: '#e2e8f0', fontSize: 12, outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <input
                value={newAccountBroker}
                onChange={(e) => setNewAccountBroker(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddAccount(); if (e.key === 'Escape') setShowAddAccount(false) }}
                placeholder="券商（可选）"
                style={{
                  width: '100%', padding: '5px 8px', marginBottom: 8,
                  background: '#1a1d27', border: '1px solid #2d3148',
                  borderRadius: 6, color: '#e2e8f0', fontSize: 12, outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={handleAddAccount}
                  disabled={!newAccountName.trim()}
                  style={{
                    flex: 1, padding: '5px', borderRadius: 6, border: 'none',
                    background: newAccountName.trim() ? '#3b82f6' : '#22263a',
                    color: newAccountName.trim() ? '#fff' : '#4a5268',
                    cursor: newAccountName.trim() ? 'pointer' : 'default',
                    fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}
                >
                  <Check size={12} /> 确认
                </button>
                <button
                  onClick={() => { setShowAddAccount(false); setNewAccountName(''); setNewAccountBroker('') }}
                  style={{
                    padding: '5px 8px', borderRadius: 6, border: '1px solid #2d3148',
                    background: 'transparent', color: '#8892a4', cursor: 'pointer', fontSize: 12,
                    display: 'flex', alignItems: 'center',
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          )}

          {/* Account list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* All accounts option */}
            <button
              onClick={() => { setSelectedAccount(null); if (isMobile) closeSidebar() }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '6px 10px', borderRadius: 6, border: 'none',
                cursor: 'pointer', textAlign: 'left', fontSize: 13,
                background: selectedAccount === null ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: selectedAccount === null ? '#60a5fa' : '#8892a4',
              }}
            >
              全部账户
            </button>

            {accounts.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button
                  onClick={() => { setSelectedAccount(a.id); if (isMobile) closeSidebar() }}
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                    padding: '5px 10px', borderRadius: 6, border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                    background: selectedAccount === a.id ? 'rgba(59,130,246,0.15)' : 'transparent',
                    color: selectedAccount === a.id ? '#60a5fa' : '#e2e8f0',
                  }}
                >
                  <span style={{ fontSize: 13 }}>{a.name}</span>
                  {a.broker && <span style={{ fontSize: 10, color: '#4a5268' }}>{a.broker}</span>}
                </button>
                {a.id !== 'default' && (
                  <button
                    onClick={() => {
                      if (confirm(`删除账户「${a.name}」？`)) {
                        if (selectedAccount === a.id) setSelectedAccount(null)
                        deleteAccount(a.id)
                      }
                    }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#4a5268', padding: '4px', lineHeight: 1, borderRadius: 4,
                      flexShrink: 0,
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: '#2d3148', margin: '4px 12px 8px' }} />

        {/* Nav */}
        <nav style={{ flex: 1, padding: '0 8px' }}>
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = view === id
            return (
              <button
                key={id}
                onClick={() => navAndClose(id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '9px 12px', borderRadius: 8,
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  fontSize: 14, fontWeight: active ? 600 : 400,
                  background: active ? 'linear-gradient(90deg, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0.06) 100%)' : 'transparent',
                  color: active ? '#60a5fa' : '#8892a4',
                  marginBottom: 2,
                  borderLeft: active ? '2px solid #3b82f6' : '2px solid transparent',
                  transition: 'all 0.15s',
                }}
              >
                <Icon size={17} />
                {label}
              </button>
            )
          })}
        </nav>

        {/* Notification bell (sidebar) */}
        <div ref={notifRef} style={{ padding: '6px 12px', position: 'relative' }}>
          <button onClick={() => setShowNotifications((v) => !v)} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', padding: '7px 10px', borderRadius: 8, border: 'none',
            background: showNotifications ? 'rgba(251,191,36,0.1)' : 'transparent',
            cursor: 'pointer', color: '#8892a4',
          }}>
            <div style={{ position: 'relative' }}>
              <Bell size={16} />
              {visibleNotifications.length > 0 && (
                <span style={{
                  position: 'absolute', top: -5, right: -6,
                  width: 14, height: 14, borderRadius: '50%',
                  background: visibleNotifications.some(n => n.type === 'warning') ? '#ef4444' : '#f59e0b',
                  fontSize: 9, fontWeight: 700, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{visibleNotifications.length}</span>
              )}
            </div>
            <span style={{ fontSize: 13 }}>通知</span>
          </button>

          {/* Notification dropdown */}
          {showNotifications && (
            <div style={{
              position: 'absolute', bottom: '110%', left: 12, right: 12,
              background: '#1e2236', border: '1px solid #2d3148',
              borderRadius: 12, padding: '8px 0', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              zIndex: 200, maxHeight: 320, overflowY: 'auto',
            }}>
              <div style={{ padding: '6px 14px 10px', borderBottom: '1px solid #2d3148', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>通知中心</span>
                {visibleNotifications.length > 0 && (
                  <button onClick={dismissAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#4a5268', padding: '2px 0' }}>
                    清除全部
                  </button>
                )}
              </div>
              {visibleNotifications.length === 0 ? (
                <div style={{ padding: '20px 14px', color: '#4a5268', fontSize: 13, textAlign: 'center' }}>暂无通知</div>
              ) : visibleNotifications.map((n) => (
                <div key={n.id} style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid #1a1d27',
                  borderLeft: `3px solid ${n.type === 'warning' ? '#ef4444' : n.type === 'success' ? '#22c55e' : '#3b82f6'}`,
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: n.type === 'warning' ? '#f87171' : n.type === 'success' ? '#4ade80' : '#60a5fa', marginBottom: 3 }}>
                      {n.title}
                    </div>
                    <div style={{ fontSize: 12, color: '#8892a4', lineHeight: 1.5 }}>{n.message}</div>
                  </div>
                  <button onClick={() => dismissNotif(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a5268', padding: 2, flexShrink: 0, marginTop: 1 }}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '8px 12px 0', borderTop: '1px solid #2d3148' }}>
          {/* Profile nav */}
          {user && (
            <button onClick={() => navAndClose('profile')}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '8px 10px', borderRadius: 8,
                border: 'none', cursor: 'pointer', textAlign: 'left',
                background: view === 'profile' ? 'rgba(59,130,246,0.15)' : 'transparent',
                marginBottom: 6,
              }}>
              {/* Mini avatar */}
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <UserCircle size={18} color="#fff" />}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: view === 'profile' ? '#60a5fa' : '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {displayName}
                </div>
                <div style={{ fontSize: 10, color: '#4a5268', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  个人资料
                </div>
              </div>
            </button>
          )}
          <div style={{ fontSize: 11, color: '#4a5268', paddingLeft: 4 }}>© 2025 TradeInsight</div>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'auto', minWidth: 0, ...(isMobile ? { paddingTop: 56 } : {}) }}>
        {/* Mobile top bar */}
        {isMobile && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, height: 56,
            background: '#1a1d27', borderBottom: '1px solid #2d3148',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 16px', zIndex: 98,
          }}>
            <button onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e2e8f0', padding: 4 }}>
              <Menu size={22} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 26, height: 26, borderRadius: 8,
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800, color: '#fff',
              }}>T</div>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>{currentLabel}</span>
              {riskLevel !== 'ok' && (
                <div style={{
                  padding: '1px 6px', borderRadius: 20, fontSize: 9, fontWeight: 700,
                  background: riskLevel === 'danger' ? '#ef444420' : '#f59e0b20',
                  border: `1px solid ${riskLevel === 'danger' ? '#ef444450' : '#f59e0b50'}`,
                  color: riskLevel === 'danger' ? '#f87171' : '#fbbf24',
                  animation: riskLevel === 'danger' ? 'riskPulse 1.5s ease-in-out infinite' : 'none',
                }}>
                  {riskLevel === 'danger' ? '⚠' : '!'}
                </div>
              )}
            </div>
            <button onClick={() => setShowNotifications((v) => !v)} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: '#8892a4', padding: 4, position: 'relative',
            }}>
              <Bell size={20} />
              {visibleNotifications.length > 0 && (
                <span style={{
                  position: 'absolute', top: 0, right: 0,
                  width: 14, height: 14, borderRadius: '50%',
                  background: visibleNotifications.some(n => n.type === 'warning') ? '#ef4444' : '#f59e0b',
                  fontSize: 9, fontWeight: 700, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{visibleNotifications.length}</span>
              )}
            </button>
          </div>
        )}

        {/* Mobile notification panel */}
        {isMobile && showNotifications && (
          <div style={{
            position: 'fixed', top: 56, right: 0, left: 0,
            background: '#1e2236', border: '1px solid #2d3148',
            borderBottom: '1px solid #2d3148',
            zIndex: 97, maxHeight: 300, overflowY: 'auto',
          }}>
            <div style={{ padding: '8px 16px 10px', borderBottom: '1px solid #2d3148', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>通知中心</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {visibleNotifications.length > 0 && (
                  <button onClick={dismissAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#4a5268', padding: 0 }}>清除全部</button>
                )}
                <button onClick={() => setShowNotifications(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8892a4', padding: 2 }}><X size={16} /></button>
              </div>
            </div>
            {visibleNotifications.length === 0 ? (
              <div style={{ padding: '20px', color: '#4a5268', fontSize: 13, textAlign: 'center' }}>暂无通知</div>
            ) : visibleNotifications.map((n) => (
              <div key={n.id} style={{
                padding: '10px 16px', borderBottom: '1px solid #1a1d27',
                borderLeft: `3px solid ${n.type === 'warning' ? '#ef4444' : n.type === 'success' ? '#22c55e' : '#3b82f6'}`,
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: n.type === 'warning' ? '#f87171' : n.type === 'success' ? '#4ade80' : '#60a5fa', marginBottom: 2 }}>{n.title}</div>
                  <div style={{ fontSize: 12, color: '#8892a4' }}>{n.message}</div>
                </div>
                <button onClick={() => dismissNotif(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a5268', padding: 2, flexShrink: 0, marginTop: 1 }}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
