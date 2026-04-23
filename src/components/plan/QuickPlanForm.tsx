import { useState } from 'react'
import { useTradeStore } from '../../store/useTradeStore'
import {
  FUND_ATTRIBUTE_LABELS,
  FUND_ATTRIBUTE_ORDER,
  PLAN_ASSET_LABELS,
  PRIMARY_GOAL_LABELS,
} from '../../types/plan'
import type {
  TradePlan,
  PlanAssetClass,
  PlanDirection,
  PrimaryGoal,
  FundAttribute,
  AssetSpecifics,
  PlanCandidate,
  MarketContext,
  PlanConfidence,
} from '../../types/plan'
import {
  generatePlanId,
  generateCandidateId,
  validatePlan,
} from '../../utils/validatePlan'
import { ArrowLeft, Zap } from 'lucide-react'

export default function QuickPlanForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { accounts, selectedAccount, userId, addPlan, openPlanDetail } = useTradeStore()

  const [accountId, setAccountId] = useState(selectedAccount || accounts[0]?.id || 'default')
  const [assetClass, setAssetClass] = useState<PlanAssetClass>('equity')
  const [symbol, setSymbol] = useState('')
  const [direction, setDirection] = useState<PlanDirection>('long')
  const [entryPrice, setEntryPrice] = useState<string>('')
  const [stopPrice, setStopPrice] = useState<string>('')
  const [targetPrice, setTargetPrice] = useState<string>('')
  const [quantity, setQuantity] = useState<string>('')
  const [score, setScore] = useState(3)
  const [reason, setReason] = useState('')
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>('steady_profit')
  const [fundAttribute, setFundAttribute] = useState<FundAttribute>('short_term_profit')
  const [entryRationale, setEntryRationale] = useState('')
  const [marketNote, setMarketNote] = useState('')

  const [errors, setErrors] = useState<string[]>([])

  const handleSubmit = () => {
    const entry = Number(entryPrice)
    const stop = Number(stopPrice)
    const target = Number(targetPrice)
    const qty = Number(quantity)

    const assetSpecifics = buildQuickAssetSpecifics(assetClass)

    const candidate: PlanCandidate = {
      id: generateCandidateId(),
      name: '主方案',
      strategy_type: 'quick',
      entry_low: entry ? +(entry * 0.99).toFixed(4) : 0,
      entry_high: entry ? +(entry * 1.01).toFixed(4) : 0,
      planned_stop: stop,
      planned_targets: target ? [target] : [],
      position_sizing: { type: 'absolute', quantity: qty },
      expected_max_loss: qty && entry && stop ? Math.abs(entry - stop) * qty : 0,
      expected_max_loss_pct: 0,
      expected_return_at_target: qty && target && entry ? Math.abs(target - entry) * qty : undefined,
      expected_rr_ratio: entry && stop && target && entry !== stop
        ? +(Math.abs(target - entry) / Math.abs(entry - stop)).toFixed(2)
        : undefined,
    }

    const market_context: MarketContext = {
      market_trend_short: 'uncertain',
      market_trend_medium: 'uncertain',
      market_note: marketNote || undefined,
      hot_sectors: [],
      hot_stocks: [],
      trend_long: 'range',
      trend_medium: 'range',
      trend_short: 'range',
    }

    const confidence: PlanConfidence = {
      mode: 'subjective',
      subjective_score: score,
      subjective_reason: reason,
      final_score: score * 20,
    }

    const today = new Date().toISOString().slice(0, 10)
    const plan: TradePlan = {
      id: generatePlanId(),
      user_id: userId || '',
      account_id: accountId,
      asset_class: assetClass,
      symbol: symbol.trim().toUpperCase(),
      direction,
      plan_mode: 'quick',
      status: 'active',
      effective_from: today,
      effective_until: today,
      primary_goal: primaryGoal,
      market_context,
      asset_specifics: assetSpecifics,
      candidates: [candidate],
      selected_candidate_id: candidate.id,
      legs: [],
      confidence,
      entry_rationale: entryRationale,
      strategy_tags: [],
      fund_attribute: fundAttribute,
      timeline: [{
        id: generateCandidateId(),
        timestamp: new Date().toISOString(),
        event_type: 'created',
        content: '快速 Plan 创建',
      }],
      daily_entries: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const errs = validatePlan(plan)
    if (errs.length) {
      setErrors(errs.map((e) => e.message))
      return
    }
    addPlan(plan)
    openPlanDetail(plan.id)
    onDone()
  }

  return (
    <div style={{ padding: 24, color: '#e5e7eb', maxWidth: 640, margin: '0 auto' }}>
      <button onClick={onCancel} style={backBtn}>
        <ArrowLeft size={16} /> 返回列表
      </button>
      <h2 style={{ fontSize: 20, margin: '12px 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Zap size={18} style={{ color: '#eab308' }} /> 快速计划
      </h2>
      <div style={{ fontSize: 13, color: '#8892a4', marginBottom: 20 }}>
        30-60 秒录入，为盘中机会留一份决策痕迹。入场价会自动扩展 ±1% 区间。
      </div>

      <Row>
        <Field label="账户" flex>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={input}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="资产" flex>
          <select value={assetClass} onChange={(e) => setAssetClass(e.target.value as PlanAssetClass)} style={input}>
            {(['equity', 'option', 'crypto'] as PlanAssetClass[]).map((a) => (
              <option key={a} value={a}>{PLAN_ASSET_LABELS[a]}</option>
            ))}
          </select>
        </Field>
      </Row>

      <Row>
        <Field label="标的" flex>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="AAPL / BTCUSDT" style={input} />
        </Field>
        <Field label="方向" flex>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['long', 'short'] as PlanDirection[]).map((d) => (
              <label key={d} style={radio(direction === d)}>
                <input type="radio" name="dir" checked={direction === d} onChange={() => setDirection(d)} style={{ display: 'none' }} />
                {d === 'long' ? 'Long' : 'Short'}
              </label>
            ))}
          </div>
        </Field>
      </Row>

      <Row>
        <Field label="入场价" flex>
          <input type="number" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} style={input} />
        </Field>
        <Field label="止损价" flex>
          <input type="number" value={stopPrice} onChange={(e) => setStopPrice(e.target.value)} style={input} />
        </Field>
        <Field label="目标价" flex>
          <input type="number" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} style={input} />
        </Field>
      </Row>

      <Field label="数量">
        <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={input} />
      </Field>

      <Row>
        <Field label="交易目标" flex>
          <select value={primaryGoal} onChange={(e) => setPrimaryGoal(e.target.value as PrimaryGoal)} style={input}>
            {(['avoid_risk', 'steady_profit', 'chase_big_gain'] as PrimaryGoal[]).map((g) => (
              <option key={g} value={g}>{PRIMARY_GOAL_LABELS[g]}</option>
            ))}
          </select>
        </Field>
        <Field label="资金属性" flex>
          <select value={fundAttribute} onChange={(e) => setFundAttribute(e.target.value as FundAttribute)} style={input}>
            {FUND_ATTRIBUTE_ORDER.map((f) => (
              <option key={f} value={f}>{FUND_ATTRIBUTE_LABELS[f]}</option>
            ))}
          </select>
        </Field>
      </Row>

      <Field label={`置信度（${score} / 5）`}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setScore(n)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: n <= score ? '#eab308' : '#4b5563', fontSize: 22 }}>
              ★
            </button>
          ))}
        </div>
      </Field>

      <Field label="为什么是这个分数（≥10 字）">
        <textarea value={reason} onChange={(e) => setReason(e.target.value)}
          rows={2} style={textarea} placeholder="e.g. 突破颈线且成交量放大，但财报临近加一点保守" />
      </Field>

      <Field label="入场逻辑（≥20 字，必填）">
        <textarea value={entryRationale} onChange={(e) => setEntryRationale(e.target.value)}
          rows={3} style={textarea} placeholder="包含入场触发条件、对应的技术或基本面依据、风险点" />
      </Field>

      <Field label="一句话市场环境（可选）">
        <input value={marketNote} onChange={(e) => setMarketNote(e.target.value)} style={input}
          placeholder="震荡上行碰前高 / FOMC 前风险偏好下降" />
      </Field>

      {errors.length > 0 && (
        <div style={errorBox}>
          {errors.map((m, i) => <div key={i}>• {m}</div>)}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button onClick={onCancel} style={secondaryBtn}>取消</button>
        <button onClick={handleSubmit} style={primaryBtn}>提交</button>
      </div>
    </div>
  )
}

function buildQuickAssetSpecifics(asset: PlanAssetClass): AssetSpecifics {
  if (asset === 'equity') return { asset_class: 'equity', uses_margin: false }
  if (asset === 'option') return {
    asset_class: 'option', option_type: 'call', option_strategy: 'long_call',
    underlying_symbol: '', strike_price: 0, expiration_date: '', contract_multiplier: 100,
  }
  return { asset_class: 'crypto', instrument_type: 'spot', exchange: 'Binance', quote_currency: 'USDT' }
}

function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
  return (
    <div style={{ marginBottom: 14, flex: flex ? 1 : undefined }}>
      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 12 }}>{children}</div>
}

const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', background: '#1a1d29',
  border: '1px solid #2d3148', borderRadius: 8, color: '#e5e7eb', fontSize: 13,
  boxSizing: 'border-box',
}

const textarea: React.CSSProperties = { ...input, resize: 'vertical', fontFamily: 'inherit' }

const radio = (active: boolean): React.CSSProperties => ({
  flex: 1, textAlign: 'center', padding: '8px 12px', borderRadius: 8,
  border: `1px solid ${active ? '#3b82f6' : '#2d3148'}`,
  background: active ? '#1e3a8a33' : '#1a1d29',
  color: active ? '#93c5fd' : '#9ca3af', cursor: 'pointer', fontSize: 13, fontWeight: 500,
})

const backBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
  background: 'transparent', color: '#9ca3af', border: '1px solid #2d3148',
  borderRadius: 8, fontSize: 12, cursor: 'pointer',
}

const primaryBtn: React.CSSProperties = {
  padding: '8px 18px', background: '#3b82f6', color: '#fff',
  border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500,
}

const secondaryBtn: React.CSSProperties = {
  padding: '8px 18px', background: '#1a1d29', color: '#e5e7eb',
  border: '1px solid #2d3148', borderRadius: 8, fontSize: 13, cursor: 'pointer',
}

const errorBox: React.CSSProperties = {
  marginTop: 12, padding: 12, background: '#7f1d1d33', border: '1px solid #ef444455',
  borderRadius: 8, color: '#fca5a5', fontSize: 12, lineHeight: 1.8,
}
