import { useMemo, useState } from 'react'
import { useTradeStore } from '../store/useTradeStore'
import { daysUntil } from '../utils/planTime'
import {
  PLAN_STATUS_LABELS,
  PLAN_ASSET_LABELS,
  FUND_ATTRIBUTE_LABELS,
  PRIMARY_GOAL_LABELS,
} from '../types/plan'
import type { PlanStatus, PlanCandidate, AssetSpecifics } from '../types/plan'
import { ArrowLeft, XCircle, Trash2, RefreshCw, Copy } from 'lucide-react'

const STATUS_COLORS: Record<PlanStatus, string> = {
  draft: '#6b7280', active: '#22c55e', triggered: '#3b82f6',
  partial: '#eab308', closed: '#8b5cf6', expired: '#f97316',
  cancelled: '#4b5563', deleted: '#7f1d1d',
}

export default function PlanDetailPage() {
  const {
    plans, currentPlanId, setView, accounts,
    cancelPlan, deletePlan, permanentDeletePlan, reactivatePlan, duplicatePlan, openPlanDetail,
  } = useTradeStore()
  const plan = plans.find((p) => p.id === currentPlanId)
  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  if (!plan) {
    return (
      <div style={{ padding: 24, color: '#e5e7eb' }}>
        <button onClick={() => setView('plans')} style={backBtn}><ArrowLeft size={16} /> 返回列表</button>
        <div style={{ marginTop: 20, color: '#8892a4' }}>计划不存在或已被删除。</div>
      </div>
    )
  }

  const primary = plan.candidates.find((c) => c.id === plan.selected_candidate_id) || plan.candidates[0]
  const accountName = accounts.find((a) => a.id === plan.account_id)?.name || plan.account_id
  const daysLeft = useMemo(() => daysUntil(plan.effective_until), [plan.effective_until])
  const canCancel = ['draft', 'active'].includes(plan.status)
  const isDeleted = plan.status === 'deleted'
  const canReuse = ['cancelled', 'expired', 'closed'].includes(plan.status)

  const handleCancel = () => {
    if (!cancelReason.trim()) return
    cancelPlan(plan.id, cancelReason.trim())
    setShowCancel(false)
  }

  const handleSoftDelete = () => {
    deletePlan(plan.id)
    setView('plans')
  }

  const handlePermanentDelete = () => {
    if (!confirm(`彻底删除计划 ${plan.symbol}？此操作不可恢复。`)) return
    permanentDeletePlan(plan.id)
    setView('plans')
  }

  const handleReactivate = () => {
    reactivatePlan(plan.id)
  }

  const handleDuplicate = () => {
    const newId = duplicatePlan(plan.id)
    if (newId) openPlanDetail(newId)
  }

  return (
    <div style={{ padding: 24, color: '#e5e7eb', maxWidth: 900, margin: '0 auto' }}>
      <button onClick={() => setView('plans')} style={backBtn}><ArrowLeft size={16} /> 返回列表</button>

      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 22, fontWeight: 600, marginBottom: 4 }}>
            <span>{plan.symbol}</span>
            <span style={{ color: plan.direction === 'long' ? '#22c55e' : '#f97316', fontSize: 14 }}>
              {plan.direction === 'long' ? '↗ Long' : '↘ Short'}
            </span>
            <StatusBadge status={plan.status} />
          </div>
          <div style={{ fontSize: 12, color: '#8892a4' }}>
            {PLAN_ASSET_LABELS[plan.asset_class]} · {accountName} · {plan.plan_mode === 'quick' ? '快速计划' : '完整计划'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canCancel && (
            <button onClick={() => setShowCancel(true)} style={secondaryBtn}>
              <XCircle size={14} /> 取消计划
            </button>
          )}
          {canReuse && (
            <button onClick={handleDuplicate} style={primaryBtn} title="基于此计划创建一份新草稿">
              <Copy size={14} /> 复用计划
            </button>
          )}
          {isDeleted ? (
            <>
              <button onClick={handleReactivate} style={secondaryBtn} title="从已删除恢复到就绪状态">
                <RefreshCw size={14} /> 重新激活
              </button>
              <button onClick={handleDuplicate} style={secondaryBtn} title="基于此计划创建一份新草稿">
                <Copy size={14} /> 复用计划
              </button>
              <button onClick={handlePermanentDelete} style={dangerBtn} title="从云端和本地彻底移除">
                <Trash2 size={14} /> 彻底删除
              </button>
            </>
          ) : (
            <button onClick={handleSoftDelete} style={dangerBtn} title="移入已删除（可在已删除列表恢复）">
              <Trash2 size={14} /> 删除
            </button>
          )}
        </div>
      </div>

      {showCancel && (
        <Card title="取消计划">
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>请填写取消原因（必填）：</div>
          <textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} style={textarea}
            placeholder="标的基本面变化 / 情绪入场不合规 / 计划有缺陷" />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button onClick={() => setShowCancel(false)} style={secondaryBtn}>放弃</button>
            <button onClick={handleCancel} disabled={!cancelReason.trim()} style={{ ...primaryBtn, opacity: cancelReason.trim() ? 1 : 0.5 }}>
              确认取消
            </button>
          </div>
        </Card>
      )}

      <Card>
        <KV label="有效期">
          {plan.effective_from} ~ {plan.effective_until}
          {['active', 'draft'].includes(plan.status) && (
            <span style={{ marginLeft: 8, color: daysLeft <= 1 ? '#f97316' : '#6b7280', fontSize: 12 }}>
              {daysLeft >= 0 ? `剩 ${daysLeft} 天` : '已过期'}
            </span>
          )}
        </KV>
        <KV label="交易目标">{PRIMARY_GOAL_LABELS[plan.primary_goal]}</KV>
        <KV label="资金属性">{FUND_ATTRIBUTE_LABELS[plan.fund_attribute]}</KV>
        <KV label="置信度">
          <span style={{ color: '#eab308' }}>{'★'.repeat(plan.confidence.subjective_score)}{'☆'.repeat(5 - plan.confidence.subjective_score)}</span>
          <span style={{ marginLeft: 8, color: '#9ca3af', fontSize: 12 }}>{plan.confidence.subjective_reason}</span>
        </KV>
        {plan.strategy_tags.length > 0 && (
          <KV label="策略标签">
            {plan.strategy_tags.map((t) => (
              <span key={t} style={tagStyle}>{t}</span>
            ))}
          </KV>
        )}
        {plan.cancelled_reason && <KV label="取消原因">{plan.cancelled_reason}</KV>}
      </Card>

      <Card title="市场环境">
        <KV label="大盘">
          短线 {TREND_LABEL[plan.market_context.market_trend_short]} · 中线 {TREND_LABEL[plan.market_context.market_trend_medium]}
          {plan.market_context.market_note && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{plan.market_context.market_note}</div>}
        </KV>
        {plan.market_context.theme_narrative && <KV label="主叙事">{plan.market_context.theme_narrative}</KV>}
        {plan.market_context.hot_sectors.length > 0 && (
          <KV label={`热点板块 (${plan.market_context.hot_sectors.length})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {plan.market_context.hot_sectors.map((s) => (
                <div key={s.id} style={{ fontSize: 13 }}>
                  <strong>{s.name}</strong> <span style={{ color: '#9ca3af' }}>({s.strength}/{s.direction})</span>
                  {s.related_symbols?.length ? <span style={{ color: '#8892a4' }}> — {s.related_symbols.join(', ')}</span> : null}
                  {s.notes && <div style={{ color: '#6b7280', fontSize: 12 }}>{s.notes}</div>}
                </div>
              ))}
            </div>
          </KV>
        )}
        {plan.market_context.hot_stocks.length > 0 && (
          <KV label={`热点个股 (${plan.market_context.hot_stocks.length})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {plan.market_context.hot_stocks.map((s) => (
                <div key={s.id} style={{ fontSize: 13 }}>
                  <strong>{s.symbol}</strong> <span style={{ color: '#9ca3af' }}>{s.status}</span>
                  {s.sector && <span style={{ color: '#8892a4' }}> · {s.sector}</span>}
                  {s.theme && <span style={{ color: '#6b7280' }}> — {s.theme}</span>}
                </div>
              ))}
            </div>
          </KV>
        )}
        <KV label="标的趋势">
          长 {SYMBOL_TREND_ICON[plan.market_context.trend_long]} · 中 {SYMBOL_TREND_ICON[plan.market_context.trend_medium]} · 短 {SYMBOL_TREND_ICON[plan.market_context.trend_short]}
        </KV>
        {plan.market_context.key_levels && <KV label="关键位">{plan.market_context.key_levels}</KV>}
        {plan.market_context.fundamental_note && <KV label="基本面">{plan.market_context.fundamental_note}</KV>}
        {typeof plan.market_context.days_to_next_earnings === 'number' && (
          <KV label="距下次财报">{plan.market_context.days_to_next_earnings} 天</KV>
        )}
        {plan.market_context.key_macro_events && <KV label="宏观事件">{plan.market_context.key_macro_events}</KV>}
      </Card>

      <Card title="资产专属字段">
        <AssetSpecificsView specifics={plan.asset_specifics} />
      </Card>

      {primary && (
        <Card title={`定档方案：${primary.name}`}>
          <CandidateView candidate={primary} />
        </Card>
      )}

      {plan.candidates.length > 1 && (
        <Card title={`其他候选方案（${plan.candidates.length - 1}）`}>
          {plan.candidates.filter((c) => c.id !== plan.selected_candidate_id).map((c) => (
            <div key={c.id} style={{ marginBottom: 12, padding: 10, background: '#10131d', borderRadius: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{c.name}</div>
              <CandidateView candidate={c} />
            </div>
          ))}
        </Card>
      )}

      <Card title="入场逻辑">
        <div style={{ fontSize: 13, color: '#e5e7eb', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
          {plan.entry_rationale}
        </div>
      </Card>

      {(plan.risk_notes || plan.invalidation_condition || plan.fallback_plan || plan.decision_rationale) && (
        <Card title="其他">
          {plan.decision_rationale && <KV label="定档理由">{plan.decision_rationale}</KV>}
          {plan.risk_notes && <KV label="风险点">{plan.risk_notes}</KV>}
          {plan.invalidation_condition && <KV label="失效条件">{plan.invalidation_condition}</KV>}
          {plan.fallback_plan && (
            <KV label="后手">
              触发：{plan.fallback_plan.trigger} → 动作：{plan.fallback_plan.action}
            </KV>
          )}
        </Card>
      )}
    </div>
  )
}

function CandidateView({ candidate }: { candidate: PlanCandidate }) {
  const sizingLabel = candidate.position_sizing.type === 'absolute'
    ? `${candidate.position_sizing.quantity} 单位`
    : candidate.position_sizing.type === 'capital_pct'
      ? `资金 ${candidate.position_sizing.percentage}% (基准 ${candidate.position_sizing.capital_reference})`
      : `风险 ${candidate.position_sizing.risk_percentage}% (基准 ${candidate.position_sizing.capital_reference})`
  return (
    <>
      <KV label="入场区间">{candidate.entry_low} ~ {candidate.entry_high}</KV>
      <KV label="止损">{candidate.planned_stop}</KV>
      <KV label="目标">{candidate.planned_targets.join(' / ')}</KV>
      <KV label="仓位">{sizingLabel}</KV>
      <KV label="预期最大亏损">{candidate.expected_max_loss}</KV>
      {candidate.expected_return_at_target !== undefined && <KV label="预期目标收益">{candidate.expected_return_at_target}</KV>}
      {candidate.expected_rr_ratio !== undefined && <KV label="盈亏比">{candidate.expected_rr_ratio}</KV>}
      {candidate.pros && <KV label="优点">{candidate.pros}</KV>}
      {candidate.cons && <KV label="缺点">{candidate.cons}</KV>}
    </>
  )
}

function AssetSpecificsView({ specifics }: { specifics: AssetSpecifics }) {
  if (specifics.asset_class === 'equity') {
    return (
      <>
        {specifics.sector && <KV label="板块">{specifics.sector}</KV>}
        <KV label="融资">{specifics.uses_margin ? '是' : '否'}</KV>
        {typeof specifics.pdt_affected === 'boolean' && <KV label="PDT 限制">{specifics.pdt_affected ? '是' : '否'}</KV>}
      </>
    )
  }
  if (specifics.asset_class === 'option') {
    return (
      <>
        <KV label="类型">{specifics.option_type.toUpperCase()}</KV>
        <KV label="策略">{specifics.option_strategy}</KV>
        <KV label="标的">{specifics.underlying_symbol}</KV>
        <KV label="行权价">{specifics.strike_price}</KV>
        <KV label="到期日">{specifics.expiration_date}</KV>
        <KV label="乘数">{specifics.contract_multiplier}</KV>
        {specifics.implied_volatility !== undefined && <KV label="IV">{specifics.implied_volatility}</KV>}
      </>
    )
  }
  return (
    <>
      <KV label="类型">{specifics.instrument_type}</KV>
      <KV label="交易所">{specifics.exchange}</KV>
      <KV label="计价">{specifics.quote_currency}</KV>
      {specifics.leverage !== undefined && <KV label="杠杆">{specifics.leverage}x</KV>}
      {specifics.funding_rate_awareness && <KV label="资金费率">{specifics.funding_rate_awareness}</KV>}
      {specifics.expiration_date && <KV label="到期">{specifics.expiration_date}</KV>}
      {specifics.chain && <KV label="Chain">{specifics.chain}</KV>}
    </>
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

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16, padding: 16, background: '#1a1d29', border: '1px solid #2d3148', borderRadius: 10 }}>
      {title && <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{title}</div>}
      {children}
    </div>
  )
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 13 }}>
      <div style={{ width: 110, color: '#9ca3af', flexShrink: 0 }}>{label}</div>
      <div style={{ color: '#e5e7eb', flex: 1, wordBreak: 'break-word' }}>{children}</div>
    </div>
  )
}

const TREND_LABEL: Record<string, string> = { bull: '多头', bear: '空头', range: '震荡', uncertain: '未定' }
const SYMBOL_TREND_ICON: Record<string, string> = { up: '↑', down: '↓', range: '→' }

const backBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
  background: 'transparent', color: '#9ca3af', border: '1px solid #2d3148',
  borderRadius: 8, fontSize: 12, cursor: 'pointer',
}

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 14px',
  background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8,
  fontSize: 12, cursor: 'pointer', fontWeight: 500,
}

const secondaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 14px',
  background: '#1a1d29', color: '#e5e7eb', border: '1px solid #2d3148', borderRadius: 8,
  fontSize: 12, cursor: 'pointer',
}

const dangerBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 14px',
  background: 'transparent', color: '#ef4444', border: '1px solid #ef444466',
  borderRadius: 8, fontSize: 12, cursor: 'pointer',
}

const tagStyle: React.CSSProperties = {
  display: 'inline-block', padding: '2px 8px', background: '#1e3a8a33', color: '#93c5fd',
  borderRadius: 999, fontSize: 11, marginRight: 4,
}

const textarea: React.CSSProperties = {
  width: '100%', padding: '8px 10px', background: '#10131d',
  border: '1px solid #2d3148', borderRadius: 8, color: '#e5e7eb', fontSize: 13,
  resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
}
