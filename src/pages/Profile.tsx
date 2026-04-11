import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import { useTradeStore } from '../store/useTradeStore'
import { formatCurrency, generateId } from '../utils/calculations'
import { getRegistrationOpen, setRegistrationOpen } from '../lib/supabase'
import { Camera, Save, LogOut, User, Phone, FileText, Mail, Shield, Plus, Trash2, DollarSign, AlertTriangle, Download, Users } from 'lucide-react'
import type { AccountTransaction } from '../types/trade'

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string | undefined

export default function Profile() {
  const { user, profile, updateProfile, uploadAvatar, signOut, loading } = useAuthStore()
  const { accounts, accountTransactions, updateAccount, addAccountTransaction, deleteAccountTransaction, closedTrades, openPositions, riskRules, setRiskRules, trades, clearUserData } = useTradeStore()

  const [form, setForm] = useState({ nickname: '', phone: '', bio: '' })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Capital management state
  const [editingCapital, setEditingCapital] = useState<string | null>(null) // account id being edited
  const [capitalInput, setCapitalInput] = useState('')
  const [txForm, setTxForm] = useState<{ accountId: string; type: 'deposit' | 'withdrawal'; amount: string; date: string; note: string } | null>(null)

  // Risk rules state
  const [riskForm, setRiskForm] = useState({
    monthlyTarget: String(riskRules.monthlyTarget ?? ''),
    maxDailyLoss: String(riskRules.maxDailyLoss ?? ''),
    maxPositionRiskPct: String(riskRules.maxPositionRiskPct ?? ''),
    maxWeeklyLoss: String(riskRules.maxWeeklyLoss ?? ''),
    maxConsecutiveLosses: String(riskRules.maxConsecutiveLosses ?? ''),
  })
  const [riskSaved, setRiskSaved] = useState(false)

  const saveRiskRules = () => {
    setRiskRules({
      monthlyTarget: parseFloat(riskForm.monthlyTarget) > 0 ? parseFloat(riskForm.monthlyTarget) : undefined,
      maxDailyLoss: parseFloat(riskForm.maxDailyLoss) > 0 ? parseFloat(riskForm.maxDailyLoss) : undefined,
      maxPositionRiskPct: parseFloat(riskForm.maxPositionRiskPct) > 0 ? parseFloat(riskForm.maxPositionRiskPct) : undefined,
      maxWeeklyLoss: parseFloat(riskForm.maxWeeklyLoss) > 0 ? parseFloat(riskForm.maxWeeklyLoss) : undefined,
      maxConsecutiveLosses: parseInt(riskForm.maxConsecutiveLosses) > 0 ? parseInt(riskForm.maxConsecutiveLosses) : undefined,
    })
    setRiskSaved(true)
    setTimeout(() => setRiskSaved(false), 2000)
  }

  // Data export
  const exportData = () => {
    const journalRaw = localStorage.getItem('tradeinsight-journal') || '[]'
    let journalEntries: unknown[] = []
    try { journalEntries = JSON.parse(journalRaw) } catch { /* empty */ }

    const exportObj = {
      exported_at: new Date().toISOString(),
      version: '1.0',
      trades,
      accounts,
      account_transactions: accountTransactions,
      journal_entries: journalEntries,
    }
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tradeinsight_backup_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [showDeleteZone, setShowDeleteZone] = useState(false)

  // Admin: registration toggle
  const isAdmin = !!ADMIN_EMAIL && user?.email === ADMIN_EMAIL
  const [regOpen, setRegOpen] = useState<boolean | null>(null)
  const [regSaving, setRegSaving] = useState(false)
  const [regMsg, setRegMsg] = useState<string | null>(null)

  useEffect(() => {
    if (isAdmin) getRegistrationOpen().then(setRegOpen)
  }, [isAdmin])

  const toggleRegistration = async (open: boolean) => {
    setRegSaving(true)
    setRegMsg(null)
    const err = await setRegistrationOpen(open)
    setRegSaving(false)
    if (err) {
      setRegMsg('保存失败：' + err)
    } else {
      setRegOpen(open)
      setRegMsg(open ? '注册已开放' : '注册已关闭')
      setTimeout(() => setRegMsg(null), 3000)
    }
  }

  useEffect(() => {
    if (profile) {
      setForm({
        nickname: profile.nickname || '',
        phone: profile.phone || '',
        bio: profile.bio || '',
      })
    }
  }, [profile])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    const err = await updateProfile({
      nickname: form.nickname.slice(0, 30),
      phone: form.phone.slice(0, 20),
      bio: form.bio.slice(0, 200),
    })
    setSaving(false)
    setMsg(err ? { type: 'err', text: err } : { type: 'ok', text: '保存成功！' })
  }

  const handleAvatar = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) { setMsg({ type: 'err', text: '头像不能超过 2MB' }); return }
    if (!file.type.startsWith('image/')) { setMsg({ type: 'err', text: '请选择图片文件' }); return }
    setUploading(true)
    setMsg(null)
    const url = await uploadAvatar(file)
    setUploading(false)
    setMsg(url ? { type: 'ok', text: '头像更新成功！' } : { type: 'err', text: '头像上传失败，请检查 Supabase Storage 配置' })
  }

  const saveInitialCapital = (accountId: string) => {
    const val = parseFloat(capitalInput)
    if (!isNaN(val) && val >= 0) {
      updateAccount(accountId, { initial_capital: val })
    }
    setEditingCapital(null)
  }

  const addTx = () => {
    if (!txForm) return
    const amount = parseFloat(txForm.amount)
    if (isNaN(amount) || amount <= 0) return
    const tx: AccountTransaction = {
      id: generateId(),
      account_id: txForm.accountId,
      type: txForm.type,
      amount,
      date: txForm.date || new Date().toISOString().slice(0, 10),
      note: txForm.note,
    }
    addAccountTransaction(tx)
    setTxForm(null)
  }

  const avatarUrl = profile?.avatar_url
  const displayName = profile?.nickname || user?.email?.split('@')[0] || '未设置昵称'

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    background: '#22263a', border: '1px solid #2d3148',
    borderRadius: 8, color: '#e2e8f0', fontSize: 14,
    outline: 'none', boxSizing: 'border-box',
  }

  const smallInp: React.CSSProperties = {
    padding: '6px 10px', background: '#22263a', border: '1px solid #2d3148',
    borderRadius: 7, color: '#e2e8f0', fontSize: 13, outline: 'none',
  }

  // Compute capital stats per account
  const accountStats = accounts.map(acc => {
    const txs = accountTransactions.filter(t => t.account_id === acc.id)
    const totalDeposits = txs.filter(t => t.type === 'deposit').reduce((s, t) => s + t.amount, 0)
    const totalWithdrawals = txs.filter(t => t.type === 'withdrawal').reduce((s, t) => s + t.amount, 0)
    const totalCapital = (acc.initial_capital ?? 0) + totalDeposits - totalWithdrawals
    const realizedPnl = closedTrades.filter(t => t.account_id === acc.id).reduce((s, t) => s + t.net_pnl, 0)
    const unrealizedPnl = openPositions.filter(p => p.account_id === acc.id).reduce((s, p) => s + p.unrealized_pnl, 0)
    const totalPnl = realizedPnl + unrealizedPnl
    const returnRate = totalCapital > 0 ? (totalPnl / totalCapital) * 100 : null
    return { acc, txs, totalDeposits, totalWithdrawals, totalCapital, realizedPnl, unrealizedPnl, totalPnl, returnRate }
  })

  return (
    <div style={{ padding: 24, maxWidth: 700 }}>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#e2e8f0' }}>个人资料</h1>
          <p style={{ margin: '4px 0 0', color: '#8892a4', fontSize: 14 }}>管理你的账户信息</p>
        </div>
        <button onClick={signOut} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 8, border: '1px solid #2d3148',
          background: 'transparent', color: '#8892a4', cursor: 'pointer', fontSize: 13,
        }}>
          <LogOut size={14} /> 退出登录
        </button>
      </div>

      {/* Avatar section */}
      <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid #2d3148',
            }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>
                  {displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 26, height: 26, borderRadius: '50%',
                background: '#3b82f6', border: '2px solid #1a1d27',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: uploading ? 'default' : 'pointer',
              }}>
              <Camera size={13} color="#fff" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatar(f) }} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>{displayName}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, color: '#8892a4', fontSize: 13 }}>
              <Mail size={13} /> {user?.email}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, color: '#4a5268', fontSize: 12 }}>
              <Shield size={12} />
              {user?.email_confirmed_at ? '邮箱已验证' : '邮箱未验证'}
            </div>
          </div>
        </div>
        {uploading && (
          <div style={{ marginTop: 12, fontSize: 13, color: '#8892a4' }}>上传中...</div>
        )}
      </div>

      {/* Admin: Registration Control */}
      {isAdmin && (
        <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderTop: '2px solid #8b5cf6', borderRadius: 12, padding: 24, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#8b5cf620', border: '1px solid #8b5cf640', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={18} color="#a78bfa" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>注册开关</div>
                <div style={{ fontSize: 12, color: '#8892a4', marginTop: 2 }}>
                  {regOpen === null ? '加载中...' : regOpen ? '当前：开放注册，新用户可自行注册' : '当前：注册已关闭，新用户无法注册'}
                </div>
              </div>
            </div>

            {/* Toggle switch */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {regMsg && (
                <span style={{ fontSize: 12, color: regMsg.startsWith('保存失败') ? '#f87171' : '#4ade80' }}>
                  {regMsg}
                </span>
              )}
              <button
                disabled={regSaving || regOpen === null}
                onClick={() => toggleRegistration(!regOpen)}
                style={{
                  position: 'relative', width: 52, height: 28, borderRadius: 14,
                  border: 'none', cursor: regSaving ? 'default' : 'pointer',
                  background: regOpen ? '#22c55e' : '#4a5268',
                  transition: 'background 0.2s',
                  flexShrink: 0,
                }}
              >
                <span style={{
                  position: 'absolute', top: 3,
                  left: regOpen ? 27 : 3,
                  width: 22, height: 22, borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                }} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Capital Management */}
      <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderTop: '2px solid #f59e0b', borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 3, height: 16, background: '#f59e0b', borderRadius: 2 }} />
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>资金管理</h3>
        </div>

        {accountStats.map(({ acc, txs, totalCapital, realizedPnl, unrealizedPnl, totalPnl, returnRate }) => (
          <div key={acc.id} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #232740' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 14 }}>{acc.name}</div>
              {returnRate !== null && (
                <div style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                  background: returnRate >= 0 ? '#22c55e20' : '#ef444420',
                  color: returnRate >= 0 ? '#22c55e' : '#ef4444',
                  border: `1px solid ${returnRate >= 0 ? '#22c55e40' : '#ef444440'}`,
                }}>
                  回报率 {returnRate >= 0 ? '+' : ''}{returnRate.toFixed(2)}%
                </div>
              )}
            </div>

            {/* Capital stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
              {[
                { label: '初始资金', value: acc.initial_capital != null ? formatCurrency(acc.initial_capital) : '未设置' },
                { label: '净值', value: totalCapital > 0 ? formatCurrency(totalCapital + totalPnl) : '--' },
                { label: '已实现盈亏', value: formatCurrency(realizedPnl), color: realizedPnl >= 0 ? '#22c55e' : '#ef4444' },
                { label: '浮动盈亏', value: formatCurrency(unrealizedPnl), color: unrealizedPnl >= 0 ? '#22c55e' : '#ef4444' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: '#161924', borderRadius: 8, padding: '8px 12px' }}>
                  <div style={{ fontSize: 11, color: '#4a5268', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: color || '#e2e8f0' }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Edit initial capital */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <DollarSign size={13} color="#8892a4" />
              <span style={{ fontSize: 12, color: '#8892a4' }}>初始资金:</span>
              {editingCapital === acc.id ? (
                <>
                  <input
                    type="number" step="any" min="0" autoFocus
                    value={capitalInput}
                    onChange={(e) => setCapitalInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveInitialCapital(acc.id); if (e.key === 'Escape') setEditingCapital(null) }}
                    style={{ ...smallInp, width: 120 }}
                  />
                  <button onClick={() => saveInitialCapital(acc.id)} style={{
                    padding: '4px 12px', borderRadius: 6, border: 'none',
                    background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 12,
                  }}>保存</button>
                  <button onClick={() => setEditingCapital(null)} style={{
                    padding: '4px 10px', borderRadius: 6, border: '1px solid #2d3148',
                    background: 'transparent', color: '#8892a4', cursor: 'pointer', fontSize: 12,
                  }}>取消</button>
                </>
              ) : (
                <button onClick={() => { setCapitalInput(String(acc.initial_capital ?? '')); setEditingCapital(acc.id) }} style={{
                  padding: '3px 10px', borderRadius: 6, border: '1px solid #2d3148',
                  background: 'transparent', color: '#60a5fa', cursor: 'pointer', fontSize: 12,
                }}>
                  {acc.initial_capital != null ? formatCurrency(acc.initial_capital) + ' (修改)' : '设置初始资金'}
                </button>
              )}
            </div>

            {/* Transaction list */}
            {txs.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                {txs.map(tx => (
                  <div key={tx.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 0', borderBottom: '1px solid #1e2135', fontSize: 12,
                  }}>
                    <span style={{
                      padding: '1px 6px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                      background: tx.type === 'deposit' ? '#22c55e20' : '#f9731620',
                      color: tx.type === 'deposit' ? '#22c55e' : '#f97316',
                    }}>{tx.type === 'deposit' ? '入金' : '出金'}</span>
                    <span style={{ color: tx.type === 'deposit' ? '#22c55e' : '#f97316', fontWeight: 600 }}>
                      {tx.type === 'deposit' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </span>
                    <span style={{ color: '#4a5268' }}>{tx.date}</span>
                    {tx.note && <span style={{ color: '#6b7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.note}</span>}
                    <button onClick={() => deleteAccountTransaction(tx.id)} style={{
                      background: 'none', border: 'none', cursor: 'pointer', color: '#4a5268', padding: 2, marginLeft: 'auto',
                    }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add transaction form */}
            {txForm?.accountId === acc.id ? (
              <div style={{ background: '#161924', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['deposit', 'withdrawal'] as const).map(t => (
                    <button key={t} onClick={() => setTxForm(f => f ? { ...f, type: t } : f)} style={{
                      flex: 1, padding: '5px', borderRadius: 6,
                      border: `1px solid ${txForm.type === t ? (t === 'deposit' ? '#22c55e' : '#f97316') : '#2d3148'}`,
                      background: txForm.type === t ? (t === 'deposit' ? '#22c55e20' : '#f9731620') : 'transparent',
                      color: txForm.type === t ? (t === 'deposit' ? '#22c55e' : '#f97316') : '#8892a4',
                      cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    }}>
                      {t === 'deposit' ? '入金' : '出金'}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <input type="number" step="any" min="0" placeholder="金额" value={txForm.amount}
                    onChange={e => setTxForm(f => f ? { ...f, amount: e.target.value } : f)}
                    style={smallInp} />
                  <input type="date" value={txForm.date}
                    onChange={e => setTxForm(f => f ? { ...f, date: e.target.value } : f)}
                    style={{ ...smallInp, colorScheme: 'dark' }} />
                </div>
                <input placeholder="备注（可选）" value={txForm.note}
                  onChange={e => setTxForm(f => f ? { ...f, note: e.target.value } : f)}
                  style={{ ...smallInp, width: '100%', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={addTx} style={{
                    flex: 1, padding: '6px', borderRadius: 6, border: 'none',
                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                    color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  }}>添加</button>
                  <button onClick={() => setTxForm(null)} style={{
                    padding: '6px 12px', borderRadius: 6, border: '1px solid #2d3148',
                    background: 'transparent', color: '#8892a4', cursor: 'pointer', fontSize: 12,
                  }}>取消</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setTxForm({ accountId: acc.id, type: 'deposit', amount: '', date: new Date().toISOString().slice(0, 10), note: '' })} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 6, border: '1px dashed #2d3148',
                background: 'transparent', color: '#6b7280', cursor: 'pointer', fontSize: 12,
              }}>
                <Plus size={12} /> 添加入金/出金记录
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Risk Rules */}
      <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderTop: '2px solid #ef4444', borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 3, height: 16, background: '#ef4444', borderRadius: 2 }} />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>风控规则</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {riskSaved && <span style={{ fontSize: 12, color: '#22c55e' }}>已保存 ✓</span>}
            <button onClick={saveRiskRules} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 14px', borderRadius: 7, border: 'none',
              background: 'linear-gradient(135deg, #ef4444, #dc2626)',
              color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}>
              <Save size={12} /> 保存规则
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: '#8892a4', display: 'block', marginBottom: 4 }}>
              <AlertTriangle size={11} style={{ marginRight: 4, verticalAlign: 'middle', color: '#22c55e' }} />
              月度盈利目标 ($)
            </label>
            <input type="number" step="any" min="0"
              value={riskForm.monthlyTarget}
              onChange={e => setRiskForm(f => ({ ...f, monthlyTarget: e.target.value }))}
              placeholder="留空则不设置" style={smallInp} />
            <div style={{ fontSize: 11, color: '#4a5268', marginTop: 3 }}>达到目标时仪表盘显示提示</div>
          </div>

          <div>
            <label style={{ fontSize: 12, color: '#8892a4', display: 'block', marginBottom: 4 }}>
              <AlertTriangle size={11} style={{ marginRight: 4, verticalAlign: 'middle', color: '#ef4444' }} />
              单日最大亏损 ($)
            </label>
            <input type="number" step="any" min="0"
              value={riskForm.maxDailyLoss}
              onChange={e => setRiskForm(f => ({ ...f, maxDailyLoss: e.target.value }))}
              placeholder="留空则不设置" style={smallInp} />
            <div style={{ fontSize: 11, color: '#4a5268', marginTop: 3 }}>超出时仪表盘显示红色警告</div>
          </div>

          <div>
            <label style={{ fontSize: 12, color: '#8892a4', display: 'block', marginBottom: 4 }}>
              <AlertTriangle size={11} style={{ marginRight: 4, verticalAlign: 'middle', color: '#ef4444' }} />
              本周最大亏损 ($)
            </label>
            <input type="number" step="any" min="0"
              value={riskForm.maxWeeklyLoss}
              onChange={e => setRiskForm(f => ({ ...f, maxWeeklyLoss: e.target.value }))}
              placeholder="留空则不设置" style={smallInp} />
            <div style={{ fontSize: 11, color: '#4a5268', marginTop: 3 }}>超出时仪表盘显示周亏损警告</div>
          </div>

          <div>
            <label style={{ fontSize: 12, color: '#8892a4', display: 'block', marginBottom: 4 }}>
              <AlertTriangle size={11} style={{ marginRight: 4, verticalAlign: 'middle', color: '#f97316' }} />
              最大连续亏损笔数
            </label>
            <input type="number" step="1" min="1"
              value={riskForm.maxConsecutiveLosses}
              onChange={e => setRiskForm(f => ({ ...f, maxConsecutiveLosses: e.target.value }))}
              placeholder="例如 3" style={smallInp} />
            <div style={{ fontSize: 11, color: '#4a5268', marginTop: 3 }}>连续亏损达到此数时触发强制休息提示</div>
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ fontSize: 12, color: '#8892a4', display: 'block', marginBottom: 4 }}>
              <AlertTriangle size={11} style={{ marginRight: 4, verticalAlign: 'middle', color: '#f59e0b' }} />
              单笔最大风险比例 (% 账户净值)
            </label>
            <input type="number" step="any" min="0" max="100"
              value={riskForm.maxPositionRiskPct}
              onChange={e => setRiskForm(f => ({ ...f, maxPositionRiskPct: e.target.value }))}
              placeholder="例如 2 代表每笔最多亏 2% 资金" style={{ ...smallInp, width: '100%', boxSizing: 'border-box' as const }} />
          </div>
        </div>
      </div>

      {/* Data Export */}
      <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>数据备份导出</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              导出所有交易、账户、日志数据为 JSON 格式，可用于备份或迁移
            </div>
          </div>
          <button onClick={exportData} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8, border: '1px solid #2d3148',
            background: 'transparent', color: '#60a5fa', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            whiteSpace: 'nowrap', marginLeft: 16,
          }}>
            <Download size={14} /> 导出数据
          </button>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: '#4a5268' }}>
          共 {trades.length} 笔交易 · {accounts.length} 个账户 · {accountTransactions.length} 条资金记录
        </div>
      </div>

      {/* Danger Zone */}
      <div style={{ background: '#1a1d27', border: '1px solid #ef444430', borderTop: '2px solid #ef4444', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showDeleteZone ? 16 : 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#f87171' }}>危险操作</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>清空所有本地数据，操作不可撤销</div>
          </div>
          <button onClick={() => setShowDeleteZone(v => !v)} style={{
            padding: '6px 12px', borderRadius: 7, border: '1px solid #ef444440',
            background: 'transparent', color: '#f87171', cursor: 'pointer', fontSize: 12,
          }}>
            {showDeleteZone ? '收起' : '展开'}
          </button>
        </div>

        {showDeleteZone && (
          <div>
            <div style={{ background: '#ef444410', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13, color: '#f87171' }}>
              ⚠️ 此操作将清空浏览器中存储的所有交易记录、账户、日志数据。若已开启云同步，云端数据不受影响，重新登录后可恢复。
            </div>
            <div style={{ marginBottom: 8, fontSize: 13, color: '#8892a4' }}>
              输入 <span style={{ color: '#f87171', fontFamily: 'monospace' }}>DELETE</span> 确认操作：
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
                placeholder="输入 DELETE"
                style={{
                  flex: 1, padding: '8px 12px', background: '#22263a',
                  border: '1px solid #ef444440', borderRadius: 7,
                  color: '#e2e8f0', fontSize: 14, outline: 'none',
                }}
              />
              <button
                disabled={deleteConfirm !== 'DELETE'}
                onClick={() => {
                  if (deleteConfirm !== 'DELETE') return
                  clearUserData()
                  localStorage.removeItem('tradeinsight-journal')
                  setDeleteConfirm('')
                  setShowDeleteZone(false)
                }}
                style={{
                  padding: '8px 16px', borderRadius: 7, border: 'none',
                  background: deleteConfirm === 'DELETE' ? '#ef4444' : '#2d3148',
                  color: deleteConfirm === 'DELETE' ? '#fff' : '#4a5268',
                  cursor: deleteConfirm === 'DELETE' ? 'pointer' : 'not-allowed',
                  fontSize: 13, fontWeight: 600,
                }}>
                清空数据
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Profile form */}
      <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 12, padding: 24 }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 600, color: '#e2e8f0' }}>基本信息</h3>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: '#8892a4', display: 'block', marginBottom: 4 }}>
              <User size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />昵称
            </label>
            <input value={form.nickname} maxLength={30}
              onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
              placeholder="设置你的昵称" style={inp} />
            <div style={{ fontSize: 11, color: '#4a5268', marginTop: 3, textAlign: 'right' }}>
              {form.nickname.length}/30
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, color: '#8892a4', display: 'block', marginBottom: 4 }}>
              <Phone size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />手机号
            </label>
            <input value={form.phone} maxLength={20}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/[^0-9+\-() ]/g, '') }))}
              placeholder="+86 138 0000 0000" style={inp} />
          </div>

          <div>
            <label style={{ fontSize: 12, color: '#8892a4', display: 'block', marginBottom: 4 }}>
              <FileText size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />个人简介
            </label>
            <textarea value={form.bio} maxLength={200}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              placeholder="介绍一下自己的交易风格..."
              rows={3} style={{ ...inp, resize: 'vertical' }} />
            <div style={{ fontSize: 11, color: '#4a5268', marginTop: 3, textAlign: 'right' }}>
              {form.bio.length}/200
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, color: '#8892a4', display: 'block', marginBottom: 4 }}>
              <Mail size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />邮箱（不可修改）
            </label>
            <input value={user?.email || ''} disabled
              style={{ ...inp, color: '#4a5268', cursor: 'not-allowed' }} />
          </div>

          {msg && (
            <div style={{
              background: msg.type === 'ok' ? '#22c55e20' : '#ef444420',
              border: `1px solid ${msg.type === 'ok' ? '#22c55e40' : '#ef444440'}`,
              borderRadius: 8, padding: '8px 12px',
              color: msg.type === 'ok' ? '#4ade80' : '#f87171', fontSize: 13,
            }}>
              {msg.text}
            </div>
          )}

          <button type="submit" disabled={saving || loading} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px', borderRadius: 10, border: 'none',
            background: saving ? '#2d3148' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            color: '#fff', cursor: saving ? 'default' : 'pointer',
            fontSize: 14, fontWeight: 600, marginTop: 4,
          }}>
            <Save size={16} />
            {saving ? '保存中...' : '保存资料'}
          </button>
        </form>
      </div>
    </div>
  )
}
