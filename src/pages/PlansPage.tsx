import { useMemo, useState } from 'react'
import { daysUntil } from '../utils/planTime'
import { useTradeStore } from '../store/useTradeStore'
import {
  PLAN_STATUS_LABELS,
  PLAN_ASSET_LABELS,
  FUND_ATTRIBUTE_LABELS,
  PRIMARY_GOAL_LABELS,
} from '../types/plan'
import type { TradePlan, PlanStatus } from '../types/plan'
import { Plus, Zap, Target, ChevronRight, ChevronDown } from 'lucide-react'
import PlanCreateWizard from '../components/plan/PlanCreateWizard'
import QuickPlanForm from '../components/plan/QuickPlanForm'

const STATUS_GROUPS: { key: 'live' | 'finished' | 'draft' | 'deleted'; label: string; statuses: PlanStatus[] }[] = [
  { key: 'live',     label: '活跃中',   statuses: ['active', 'triggered', 'partial'] },
  { key: 'draft',    label: '草稿',     statuses: ['draft'] },
  { key: 'finished', label: '已完成',   statuses: ['closed', 'expired', 'cancelled'] },
  { key: 'deleted',  label: '已删除',   statuses: ['deleted'] },
]

const STATUS_COLORS: Record<PlanStatus, string> = {
  draft: '#6b7280',
  active: '#22c55e',
  triggered: '#3b82f6',
  partial: '#eab308',
  closed: '#8b5cf6',
  expired: '#f97316',
  cancelled: '#4b5563',
  deleted: '#7f1d1d',
}

type Mode = 'list' | 'create' | 'quick'

export default function PlansPage() {
  const { plans, accounts, openPlanDetail } = useTradeStore()
  const [mode, setMode] = useState<Mode>('list')
  const [accountFilter, setAccountFilter] = useState<string>('')
  const [showDeleted, setShowDeleted] = useState(false)

  const filtered = useMemo(() => {
    if (!accountFilter) return plans
    return plans.filter((p) => p.account_id === accountFilter)
  }, [plans, accountFilter])

  const byGroup = useMemo(() => {
    const map: Record<string, TradePlan[]> = {}
    STATUS_GROUPS.forEach((g) => {
      map[g.key] = filtered
        .filter((p) => g.statuses.includes(p.status))
        .sort((a, b) => {
          if (g.key === 'live') return a.effective_until.localeCompare(b.effective_until)
          return (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at)
        })
    })
    return map
  }, [filtered])

  if (mode === 'create') {
    return <PlanCreateWizard onDone={() => setMode('list')} onCancel={() => setMode('list')} />
  }
  if (mode === 'quick') {
    return <QuickPlanForm onDone={() => setMode('list')} onCancel={() => setMode('list')} />
  }

  return (
    <div style={{ padding: 24, color: '#e5e7eb', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Target size={20} /> 交易计划
        </h1>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="">全部账户</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button onClick={() => setMode('create')} style={primaryBtn}>
            <Plus size={16} /> 新建计划
          </button>
          <button onClick={() => setMode('quick')} style={secondaryBtn}>
            <Zap size={16} /> 快速计划
          </button>
        </div>
      </div>

      {plans.length === 0 && <EmptyState onCreate={() => setMode('create')} onQuick={() => setMode('quick')} />}

      {plans.length > 0 && STATUS_GROUPS.map((g) => {
        const items = byGroup[g.key]
        if (!items.length) return null
        const isCollapsible = g.key === 'deleted'
        const collapsed = isCollapsible && !showDeleted
        return (
          <section key={g.key} style={{ marginBottom: 28 }}>
            {isCollapsible ? (
              <button
                onClick={() => setShowDeleted((v) => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'transparent', border: 'none', padding: 0,
                  fontSize: 13, color: '#9ca3af', marginBottom: 10, cursor: 'pointer',
                }}
              >
                {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                {g.label} <span style={{ color: '#6b7280' }}>({items.length})</span>
              </button>
            ) : (
              <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 10 }}>
                {g.label} <span style={{ color: '#6b7280' }}>({items.length})</span>
              </div>
            )}
            {!collapsed && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {items.map((p) => (
                  <PlanCard key={p.id} plan={p} accountName={accounts.find((a) => a.id === p.account_id)?.name || p.account_id} onClick={() => openPlanDetail(p.id)} />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

function EmptyState({ onCreate, onQuick }: { onCreate: () => void; onQuick: () => void }) {
  return (
    <div style={{
      padding: 40, textAlign: 'center', background: '#1a1d29',
      border: '1px dashed #2d3148', borderRadius: 12, color: '#8892a4',
    }}>
      <Target size={32} style={{ color: '#4b5563', marginBottom: 12 }} />
      <div style={{ fontSize: 15, marginBottom: 6 }}>尚无交易计划</div>
      <div style={{ fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
        在下单前把决策沉淀为计划，避免被盘面情绪牵着走。<br />
        完整计划适合盘前周级复盘；快速计划适合盘中 30-60 秒录入。
      </div>
      <div style={{ display: 'inline-flex', gap: 10 }}>
        <button onClick={onCreate} style={primaryBtn}><Plus size={16} /> 新建计划</button>
        <button onClick={onQuick} style={secondaryBtn}><Zap size={16} /> 快速计划</button>
      </div>
    </div>
  )
}

function PlanCard({ plan, accountName, onClick }: { plan: TradePlan; accountName: string; onClick: () => void }) {
  const { candidates, selected_candidate_id, confidence } = plan
  const primary = candidates.find((c) => c.id === selected_candidate_id) || candidates[0]
  const score = confidence?.subjective_score ?? 0
  const stars = '★'.repeat(score) + '☆'.repeat(Math.max(0, 5 - score))
  const daysLeft = useMemo(() => daysUntil(plan.effective_until), [plan.effective_until])

  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left', background: '#1a1d29', border: '1px solid #2d3148',
        borderRadius: 12, padding: 14, cursor: 'pointer', color: '#e5e7eb',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#3f4458')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#2d3148')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
            {plan.symbol}{' '}
            <span style={{ color: plan.direction === 'long' ? '#22c55e' : '#f97316', fontSize: 12 }}>
              {plan.direction === 'long' ? '↗ Long' : '↘ Short'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>
            {PLAN_ASSET_LABELS[plan.asset_class]} · {accountName}
          </div>
        </div>
        <StatusBadge status={plan.status} />
      </div>

      <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.7 }}>
        <div>置信度 <span style={{ color: '#eab308' }}>{stars}</span></div>
        {primary && (
          <div>入场 {primary.entry_low}-{primary.entry_high} · 止损 {primary.planned_stop}</div>
        )}
        <div>目标 {PRIMARY_GOAL_LABELS[plan.primary_goal]} · {FUND_ATTRIBUTE_LABELS[plan.fund_attribute]}</div>
        {['active', 'draft'].includes(plan.status) && (
          <div style={{ color: daysLeft <= 1 ? '#f97316' : '#6b7280' }}>
            {daysLeft >= 0 ? `剩 ${daysLeft} 天` : '已过期'}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <ChevronRight size={16} style={{ color: '#6b7280' }} />
      </div>
    </button>
  )
}

function StatusBadge({ status }: { status: PlanStatus }) {
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 999,
      background: `${STATUS_COLORS[status]}22`, color: STATUS_COLORS[status],
      border: `1px solid ${STATUS_COLORS[status]}55`,
    }}>
      {PLAN_STATUS_LABELS[status]}
    </span>
  )
}

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
  background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8,
  fontSize: 13, cursor: 'pointer', fontWeight: 500,
}

const secondaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
  background: '#1a1d29', color: '#e5e7eb', border: '1px solid #2d3148', borderRadius: 8,
  fontSize: 13, cursor: 'pointer', fontWeight: 500,
}

const selectStyle: React.CSSProperties = {
  padding: '8px 10px', background: '#1a1d29', border: '1px solid #2d3148',
  borderRadius: 8, color: '#e5e7eb', fontSize: 13,
}
