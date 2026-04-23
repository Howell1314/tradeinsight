import { useMemo, useState } from 'react'
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
  MarketContext,
  MarketTrend,
  SymbolTrend,
  HotSectorEntry,
  HotStockEntry,
  PlanCandidate,
  PositionSizing,
  AssetSpecifics,
  EquitySpecifics,
  OptionSpecifics,
  CryptoSpecifics,
  OptionStrategy,
  CryptoInstrumentType,
  PlanConfidence,
} from '../../types/plan'
import {
  generatePlanId,
  generateCandidateId,
  generateHotSectorId,
  generateHotStockId,
  validatePlan,
} from '../../utils/validatePlan'
import { todayISO, addDaysISO } from '../../utils/planTime'
import { ArrowLeft, Plus, Trash2, Check } from 'lucide-react'

const STEPS = [
  '基础信息',
  '市场环境',
  '资产字段',
  '候选方案',
  '置信度·后手',
  '逻辑·风险',
  '预览提交',
]

type SizingType = 'absolute' | 'capital_pct' | 'risk_pct'

interface CandidateDraft {
  id: string
  name: string
  strategy_type: string
  entry_low: string
  entry_high: string
  planned_stop: string
  planned_targets: string          // 逗号分隔
  sizing_type: SizingType
  sizing_quantity: string
  sizing_percentage: string
  sizing_risk_percentage: string
  sizing_capital_reference: string
  pros: string
  cons: string
}

function emptyCandidate(name = '主方案'): CandidateDraft {
  return {
    id: generateCandidateId(),
    name,
    strategy_type: '',
    entry_low: '',
    entry_high: '',
    planned_stop: '',
    planned_targets: '',
    sizing_type: 'absolute',
    sizing_quantity: '',
    sizing_percentage: '',
    sizing_risk_percentage: '',
    sizing_capital_reference: '',
    pros: '',
    cons: '',
  }
}

interface EquityForm { sector: string; uses_margin: boolean; pdt_affected: boolean }
interface OptionForm {
  option_type: 'call' | 'put'
  option_strategy: OptionStrategy
  underlying_symbol: string
  strike_price: string
  expiration_date: string
  contract_multiplier: string
  implied_volatility: string
}
interface CryptoForm {
  instrument_type: CryptoInstrumentType
  exchange: string
  quote_currency: string
  leverage: string
  funding_rate_awareness: string
  expiration_date: string
  chain: string
}

export default function PlanCreateWizard({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { accounts, selectedAccount, userId, addPlan, openPlanDetail } = useTradeStore()

  const [step, setStep] = useState(0)

  // Step 1
  const [accountId, setAccountId] = useState(selectedAccount || accounts[0]?.id || 'default')
  const [assetClass, setAssetClass] = useState<PlanAssetClass>('equity')
  const [symbol, setSymbol] = useState('')
  const [direction, setDirection] = useState<PlanDirection>('long')
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>('steady_profit')
  const [fundAttribute, setFundAttribute] = useState<FundAttribute>('short_term_profit')
  const [effectiveFrom, setEffectiveFrom] = useState(() => todayISO())
  const [effectiveUntil, setEffectiveUntil] = useState(() => addDaysISO(7))

  // Step 2a
  const [mtShort, setMtShort] = useState<MarketTrend>('uncertain')
  const [mtMedium, setMtMedium] = useState<MarketTrend>('uncertain')
  const [marketNote, setMarketNote] = useState('')
  const [keyMacroEvents, setKeyMacroEvents] = useState('')

  // Step 2b
  const [themeNarrative, setThemeNarrative] = useState('')
  const [hotSectors, setHotSectors] = useState<HotSectorEntry[]>([])
  const [hotStocks, setHotStocks] = useState<HotStockEntry[]>([])

  // Step 2c
  const [trendLong, setTrendLong] = useState<SymbolTrend>('range')
  const [trendMedium, setTrendMedium] = useState<SymbolTrend>('range')
  const [trendShort, setTrendShort] = useState<SymbolTrend>('range')
  const [keyLevels, setKeyLevels] = useState('')
  const [fundamentalNote, setFundamentalNote] = useState('')
  const [daysToNextEarnings, setDaysToNextEarnings] = useState('')

  // Step 3
  const [equityForm, setEquityForm] = useState<EquityForm>({ sector: '', uses_margin: false, pdt_affected: false })
  const [optionForm, setOptionForm] = useState<OptionForm>({
    option_type: 'call', option_strategy: 'long_call', underlying_symbol: '',
    strike_price: '', expiration_date: '', contract_multiplier: '100', implied_volatility: '',
  })
  const [cryptoForm, setCryptoForm] = useState<CryptoForm>({
    instrument_type: 'spot', exchange: 'Binance', quote_currency: 'USDT',
    leverage: '', funding_rate_awareness: '', expiration_date: '', chain: '',
  })

  // Step 4
  const [candidates, setCandidates] = useState<CandidateDraft[]>([emptyCandidate()])
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>(() => candidates[0].id)
  const [decisionRationale, setDecisionRationale] = useState('')

  // Step 5
  const [score, setScore] = useState(3)
  const [confidenceReason, setConfidenceReason] = useState('')
  const [invalidationCondition, setInvalidationCondition] = useState('')
  const [fallbackTrigger, setFallbackTrigger] = useState('')
  const [fallbackAction, setFallbackAction] = useState('')

  // Step 6
  const [entryRationale, setEntryRationale] = useState('')
  const [riskNotes, setRiskNotes] = useState('')
  const [strategyTags, setStrategyTags] = useState('')

  const [errors, setErrors] = useState<string[]>([])

  // ────── 构造最终 TradePlan ──────
  const buildPlan = (): TradePlan => {
    const market_context: MarketContext = {
      market_trend_short: mtShort,
      market_trend_medium: mtMedium,
      market_note: marketNote || undefined,
      key_macro_events: keyMacroEvents || undefined,
      theme_narrative: themeNarrative || undefined,
      hot_sectors: hotSectors,
      hot_stocks: hotStocks,
      trend_long: trendLong,
      trend_medium: trendMedium,
      trend_short: trendShort,
      key_levels: keyLevels || undefined,
      fundamental_note: fundamentalNote || undefined,
      days_to_next_earnings: daysToNextEarnings ? Number(daysToNextEarnings) : undefined,
    }

    let asset_specifics: AssetSpecifics
    if (assetClass === 'equity') {
      const v: EquitySpecifics = {
        asset_class: 'equity',
        sector: equityForm.sector || undefined,
        uses_margin: equityForm.uses_margin,
        pdt_affected: equityForm.pdt_affected,
      }
      asset_specifics = v
    } else if (assetClass === 'option') {
      const v: OptionSpecifics = {
        asset_class: 'option',
        option_type: optionForm.option_type,
        option_strategy: optionForm.option_strategy,
        underlying_symbol: optionForm.underlying_symbol,
        strike_price: Number(optionForm.strike_price) || 0,
        expiration_date: optionForm.expiration_date,
        contract_multiplier: Number(optionForm.contract_multiplier) || 100,
        implied_volatility: optionForm.implied_volatility ? Number(optionForm.implied_volatility) : undefined,
      }
      asset_specifics = v
    } else {
      const v: CryptoSpecifics = {
        asset_class: 'crypto',
        instrument_type: cryptoForm.instrument_type,
        exchange: cryptoForm.exchange,
        quote_currency: cryptoForm.quote_currency,
        leverage: cryptoForm.leverage ? Number(cryptoForm.leverage) : undefined,
        funding_rate_awareness: cryptoForm.funding_rate_awareness || undefined,
        expiration_date: cryptoForm.expiration_date || undefined,
        chain: cryptoForm.chain || undefined,
      }
      asset_specifics = v
    }

    const candList: PlanCandidate[] = candidates.map((c) => {
      const entryLow = Number(c.entry_low) || 0
      const entryHigh = Number(c.entry_high) || entryLow
      const stop = Number(c.planned_stop) || 0
      const targets = c.planned_targets
        .split(/[,\s]+/).map((t) => Number(t)).filter((n) => Number.isFinite(n) && n > 0)
      const entryMid = (entryLow + entryHigh) / 2

      let sizing: PositionSizing
      if (c.sizing_type === 'absolute') {
        sizing = { type: 'absolute', quantity: Number(c.sizing_quantity) || 0 }
      } else if (c.sizing_type === 'capital_pct') {
        sizing = {
          type: 'capital_pct',
          percentage: Number(c.sizing_percentage) || 0,
          capital_reference: Number(c.sizing_capital_reference) || 0,
        }
      } else {
        sizing = {
          type: 'risk_pct',
          risk_percentage: Number(c.sizing_risk_percentage) || 0,
          capital_reference: Number(c.sizing_capital_reference) || 0,
        }
      }

      let qtyEstimate = 0
      if (sizing.type === 'absolute') qtyEstimate = sizing.quantity
      else if (sizing.type === 'capital_pct' && entryMid > 0) {
        qtyEstimate = (sizing.capital_reference * sizing.percentage / 100) / entryMid
      } else if (sizing.type === 'risk_pct' && Math.abs(entryMid - stop) > 0) {
        qtyEstimate = (sizing.capital_reference * sizing.risk_percentage / 100) / Math.abs(entryMid - stop)
      }

      const expectedMaxLoss = qtyEstimate * Math.abs(entryMid - stop)
      const firstTarget = targets[0]
      const expectedReturn = firstTarget ? qtyEstimate * Math.abs(firstTarget - entryMid) : undefined
      const rr = stop !== entryMid && firstTarget
        ? +(Math.abs(firstTarget - entryMid) / Math.abs(entryMid - stop)).toFixed(2)
        : undefined

      return {
        id: c.id,
        name: c.name,
        strategy_type: c.strategy_type,
        entry_low: entryLow,
        entry_high: entryHigh,
        planned_stop: stop,
        planned_targets: targets,
        position_sizing: sizing,
        expected_max_loss: +expectedMaxLoss.toFixed(2),
        expected_max_loss_pct: 0,
        expected_return_at_target: expectedReturn ? +expectedReturn.toFixed(2) : undefined,
        expected_rr_ratio: rr,
        pros: c.pros || undefined,
        cons: c.cons || undefined,
      }
    })

    const confidence: PlanConfidence = {
      mode: 'subjective',
      subjective_score: score,
      subjective_reason: confidenceReason,
      final_score: score * 20,
    }

    const plan: TradePlan = {
      id: generatePlanId(),
      user_id: userId || '',
      account_id: accountId,
      asset_class: assetClass,
      symbol: symbol.trim().toUpperCase(),
      direction,
      plan_mode: 'full',
      status: 'active',
      effective_from: effectiveFrom,
      effective_until: effectiveUntil,
      primary_goal: primaryGoal,
      market_context,
      asset_specifics,
      candidates: candList,
      selected_candidate_id: selectedCandidateId || candList[0]?.id,
      decision_rationale: decisionRationale || undefined,
      legs: [],
      confidence,
      invalidation_condition: invalidationCondition || undefined,
      fallback_plan: (fallbackTrigger && fallbackAction)
        ? { trigger: fallbackTrigger, action: fallbackAction }
        : undefined,
      entry_rationale: entryRationale,
      risk_notes: riskNotes || undefined,
      strategy_tags: strategyTags.split(/[,，\s]+/).filter(Boolean),
      fund_attribute: fundAttribute,
      timeline: [{
        id: generateCandidateId(),
        timestamp: new Date().toISOString(),
        event_type: 'created',
        content: '完整 Plan 创建',
      }],
      daily_entries: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    return plan
  }

  const handleSubmit = () => {
    const plan = buildPlan()
    const errs = validatePlan(plan)
    if (errs.length) {
      setErrors(errs.map((e) => e.message))
      return
    }
    addPlan(plan)
    openPlanDetail(plan.id)
    onDone()
  }

  // ────── 步骤间基础校验 ──────
  const canNext = useMemo(() => {
    if (step === 0) {
      return !!accountId && !!symbol.trim() && effectiveFrom <= effectiveUntil
    }
    if (step === 3) {
      if (!candidates.length) return false
      const hasSelected = candidates.some((c) => c.id === selectedCandidateId)
      return hasSelected && candidates.every((c) => c.name.trim() && c.entry_low && c.planned_stop && c.planned_targets)
    }
    if (step === 4) {
      return confidenceReason.trim().length >= 10 && (
        (!fallbackTrigger && !fallbackAction) || (fallbackTrigger && fallbackAction)
      )
    }
    if (step === 5) {
      return entryRationale.trim().length >= 20
    }
    return true
  }, [step, accountId, symbol, effectiveFrom, effectiveUntil, candidates, selectedCandidateId,
    confidenceReason, fallbackTrigger, fallbackAction, entryRationale])

  return (
    <div style={{ padding: 24, color: '#e5e7eb', maxWidth: 900, margin: '0 auto' }}>
      <button onClick={onCancel} style={backBtn}>
        <ArrowLeft size={16} /> 返回列表
      </button>

      <h2 style={{ fontSize: 20, margin: '12px 0 18px' }}>新建交易计划</h2>

      <Stepper step={step} />

      <div style={{ marginTop: 20 }}>
        {step === 0 && (
          <Step1Basic
            {...{ accounts, accountId, setAccountId, assetClass, setAssetClass,
              symbol, setSymbol, direction, setDirection, primaryGoal, setPrimaryGoal,
              fundAttribute, setFundAttribute, effectiveFrom, setEffectiveFrom,
              effectiveUntil, setEffectiveUntil }}
          />
        )}
        {step === 1 && (
          <Step2Market
            {...{ mtShort, setMtShort, mtMedium, setMtMedium, marketNote, setMarketNote,
              keyMacroEvents, setKeyMacroEvents, themeNarrative, setThemeNarrative,
              hotSectors, setHotSectors, hotStocks, setHotStocks,
              trendLong, setTrendLong, trendMedium, setTrendMedium, trendShort, setTrendShort,
              keyLevels, setKeyLevels, fundamentalNote, setFundamentalNote,
              daysToNextEarnings, setDaysToNextEarnings, assetClass }}
          />
        )}
        {step === 2 && (
          <Step3AssetSpecifics {...{ assetClass, equityForm, setEquityForm, optionForm, setOptionForm, cryptoForm, setCryptoForm }} />
        )}
        {step === 3 && (
          <Step4Candidates {...{ candidates, setCandidates, selectedCandidateId, setSelectedCandidateId, decisionRationale, setDecisionRationale }} />
        )}
        {step === 4 && (
          <Step5Confidence {...{ score, setScore, confidenceReason, setConfidenceReason,
            invalidationCondition, setInvalidationCondition,
            fallbackTrigger, setFallbackTrigger, fallbackAction, setFallbackAction }} />
        )}
        {step === 5 && (
          <Step6Logic {...{ entryRationale, setEntryRationale, riskNotes, setRiskNotes, strategyTags, setStrategyTags }} />
        )}
        {step === 6 && (
          <Step7Preview plan={buildPlan()} />
        )}
      </div>

      {errors.length > 0 && (
        <div style={errorBox}>
          {errors.map((m, i) => <div key={i}>• {m}</div>)}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          style={{ ...secondaryBtn, opacity: step === 0 ? 0.4 : 1 }}
        >
          上一步
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => canNext && setStep((s) => s + 1)}
            disabled={!canNext}
            style={{ ...primaryBtn, opacity: canNext ? 1 : 0.5 }}
          >
            下一步
          </button>
        ) : (
          <button onClick={handleSubmit} style={primaryBtn}>
            <Check size={14} style={{ marginRight: 4 }} /> 提交
          </button>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// Stepper
// ═══════════════════════════════════════════════════════

function Stepper({ step }: { step: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {STEPS.map((label, i) => (
        <div key={i} style={{
          flex: 1, minWidth: 100, padding: '6px 10px', borderRadius: 6, fontSize: 12, textAlign: 'center',
          background: i === step ? '#1e3a8a' : i < step ? '#1a1d29' : '#0f1117',
          color: i === step ? '#e5e7eb' : i < step ? '#93c5fd' : '#4b5563',
          border: `1px solid ${i === step ? '#3b82f6' : '#2d3148'}`,
        }}>
          {i + 1}. {label}
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// Step 1: 基础信息
// ═══════════════════════════════════════════════════════

function Step1Basic(props: {
  accounts: { id: string; name: string }[]
  accountId: string; setAccountId: (v: string) => void
  assetClass: PlanAssetClass; setAssetClass: (v: PlanAssetClass) => void
  symbol: string; setSymbol: (v: string) => void
  direction: PlanDirection; setDirection: (v: PlanDirection) => void
  primaryGoal: PrimaryGoal; setPrimaryGoal: (v: PrimaryGoal) => void
  fundAttribute: FundAttribute; setFundAttribute: (v: FundAttribute) => void
  effectiveFrom: string; setEffectiveFrom: (v: string) => void
  effectiveUntil: string; setEffectiveUntil: (v: string) => void
}) {
  const {
    accounts, accountId, setAccountId, assetClass, setAssetClass, symbol, setSymbol,
    direction, setDirection, primaryGoal, setPrimaryGoal, fundAttribute, setFundAttribute,
    effectiveFrom, setEffectiveFrom, effectiveUntil, setEffectiveUntil,
  } = props
  return (
    <Card>
      <Row>
        <Field label="账户" flex>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={input}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="资产类别" flex>
          <select value={assetClass} onChange={(e) => setAssetClass(e.target.value as PlanAssetClass)} style={input}>
            {(['equity', 'option', 'crypto'] as PlanAssetClass[]).map((a) =>
              <option key={a} value={a}>{PLAN_ASSET_LABELS[a]}</option>,
            )}
          </select>
        </Field>
      </Row>
      <Row>
        <Field label="标的代码" flex>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="AAPL / BTCUSDT" style={input} />
        </Field>
        <Field label="方向" flex>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['long', 'short'] as PlanDirection[]).map((d) => (
              <label key={d} style={radio(direction === d)}>
                <input type="radio" checked={direction === d} onChange={() => setDirection(d)} style={{ display: 'none' }} />
                {d === 'long' ? 'Long' : 'Short'}
              </label>
            ))}
          </div>
        </Field>
      </Row>
      <Row>
        <Field label="交易目标" flex>
          <select value={primaryGoal} onChange={(e) => setPrimaryGoal(e.target.value as PrimaryGoal)} style={input}>
            {(['avoid_risk', 'steady_profit', 'chase_big_gain'] as PrimaryGoal[]).map((g) =>
              <option key={g} value={g}>{PRIMARY_GOAL_LABELS[g]}</option>,
            )}
          </select>
        </Field>
        <Field label="资金属性" flex>
          <select value={fundAttribute} onChange={(e) => setFundAttribute(e.target.value as FundAttribute)} style={input}>
            {FUND_ATTRIBUTE_ORDER.map((f) => <option key={f} value={f}>{FUND_ATTRIBUTE_LABELS[f]}</option>)}
          </select>
        </Field>
      </Row>
      <Row>
        <Field label="生效起始日" flex>
          <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} style={input} />
        </Field>
        <Field label="生效截止日（默认 +7 天）" flex>
          <input type="date" value={effectiveUntil} onChange={(e) => setEffectiveUntil(e.target.value)} style={input} />
        </Field>
      </Row>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════
// Step 2: 市场环境
// ═══════════════════════════════════════════════════════

function Step2Market(props: {
  mtShort: MarketTrend; setMtShort: (v: MarketTrend) => void
  mtMedium: MarketTrend; setMtMedium: (v: MarketTrend) => void
  marketNote: string; setMarketNote: (v: string) => void
  keyMacroEvents: string; setKeyMacroEvents: (v: string) => void
  themeNarrative: string; setThemeNarrative: (v: string) => void
  hotSectors: HotSectorEntry[]; setHotSectors: (v: HotSectorEntry[]) => void
  hotStocks: HotStockEntry[]; setHotStocks: (v: HotStockEntry[]) => void
  trendLong: SymbolTrend; setTrendLong: (v: SymbolTrend) => void
  trendMedium: SymbolTrend; setTrendMedium: (v: SymbolTrend) => void
  trendShort: SymbolTrend; setTrendShort: (v: SymbolTrend) => void
  keyLevels: string; setKeyLevels: (v: string) => void
  fundamentalNote: string; setFundamentalNote: (v: string) => void
  daysToNextEarnings: string; setDaysToNextEarnings: (v: string) => void
  assetClass: PlanAssetClass
}) {
  const addSector = () => {
    if (props.hotSectors.length >= 5) return
    props.setHotSectors([...props.hotSectors, {
      id: generateHotSectorId(), name: '', strength: 'medium', direction: 'neutral',
    }])
  }
  const addStock = () => {
    if (props.hotStocks.length >= 10) return
    props.setHotStocks([...props.hotStocks, {
      id: generateHotStockId(), symbol: '', status: 'following',
    }])
  }

  return (
    <>
      <Card title="大盘判断">
        <Row>
          <Field label="短线趋势" flex>
            <select value={props.mtShort} onChange={(e) => props.setMtShort(e.target.value as MarketTrend)} style={input}>
              {(['bull', 'bear', 'range', 'uncertain'] as MarketTrend[]).map((t) =>
                <option key={t} value={t}>{TREND_LABEL[t]}</option>)}
            </select>
          </Field>
          <Field label="中线趋势" flex>
            <select value={props.mtMedium} onChange={(e) => props.setMtMedium(e.target.value as MarketTrend)} style={input}>
              {(['bull', 'bear', 'range', 'uncertain'] as MarketTrend[]).map((t) =>
                <option key={t} value={t}>{TREND_LABEL[t]}</option>)}
            </select>
          </Field>
        </Row>
        <Field label="大盘描述（可选）">
          <input value={props.marketNote} onChange={(e) => props.setMarketNote(e.target.value)} style={input} placeholder="震荡上行碰前高" />
        </Field>
        <Field label="宏观事件（可选）">
          <input value={props.keyMacroEvents} onChange={(e) => props.setKeyMacroEvents(e.target.value)} style={input} placeholder="FOMC / CPI / 财报季" />
        </Field>
      </Card>

      <Card title="主叙事 · 热点板块 · 热点个股">
        <Field label="主叙事（可选）">
          <input value={props.themeNarrative} onChange={(e) => props.setThemeNarrative(e.target.value)} style={input}
            placeholder="AI 算力 + 降息预期 + 地缘政治" />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>热点板块 ({props.hotSectors.length}/5)</div>
          {props.hotSectors.length < 5 && (
            <button onClick={addSector} style={tinyBtn}><Plus size={12} /> 添加板块</button>
          )}
        </div>
        {props.hotSectors.map((s, i) => (
          <SectorRow key={s.id} sector={s} onChange={(u) => {
            const next = [...props.hotSectors]; next[i] = { ...s, ...u }; props.setHotSectors(next)
          }} onRemove={() => props.setHotSectors(props.hotSectors.filter((_, idx) => idx !== i))} />
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>热点个股 ({props.hotStocks.length}/10)</div>
          {props.hotStocks.length < 10 && (
            <button onClick={addStock} style={tinyBtn}><Plus size={12} /> 添加个股</button>
          )}
        </div>
        {props.hotStocks.map((s, i) => (
          <StockRow key={s.id} stock={s} sectors={props.hotSectors} onChange={(u) => {
            const next = [...props.hotStocks]; next[i] = { ...s, ...u }; props.setHotStocks(next)
          }} onRemove={() => props.setHotStocks(props.hotStocks.filter((_, idx) => idx !== i))} />
        ))}
      </Card>

      <Card title="标的自身">
        <Row>
          <Field label="长线" flex><SymbolTrendSelect value={props.trendLong} onChange={props.setTrendLong} /></Field>
          <Field label="中线" flex><SymbolTrendSelect value={props.trendMedium} onChange={props.setTrendMedium} /></Field>
          <Field label="短线" flex><SymbolTrendSelect value={props.trendShort} onChange={props.setTrendShort} /></Field>
        </Row>
        <Field label="关键位置（可选）">
          <input value={props.keyLevels} onChange={(e) => props.setKeyLevels(e.target.value)} style={input}
            placeholder="60 日线 + 量价线 + 61.8" />
        </Field>
        <Field label="基本面描述（可选）">
          <input value={props.fundamentalNote} onChange={(e) => props.setFundamentalNote(e.target.value)} style={input} />
        </Field>
        {props.assetClass !== 'crypto' && (
          <Field label="距离下次财报（天）">
            <input type="number" value={props.daysToNextEarnings} onChange={(e) => props.setDaysToNextEarnings(e.target.value)} style={input} />
          </Field>
        )}
      </Card>
    </>
  )
}

function SectorRow({ sector, onChange, onRemove }: {
  sector: HotSectorEntry; onChange: (u: Partial<HotSectorEntry>) => void; onRemove: () => void
}) {
  return (
    <div style={{ marginTop: 10, padding: 10, background: '#10131d', border: '1px solid #2d3148', borderRadius: 8 }}>
      <Row>
        <Field label="板块名" flex>
          <input value={sector.name} onChange={(e) => onChange({ name: e.target.value })} style={input} placeholder="半导体 / AI" />
        </Field>
        <Field label="强度" flex>
          <select value={sector.strength} onChange={(e) => onChange({ strength: e.target.value as HotSectorEntry['strength'] })} style={input}>
            <option value="strong">强</option><option value="medium">中</option><option value="weak">弱</option>
          </select>
        </Field>
        <Field label="方向" flex>
          <select value={sector.direction} onChange={(e) => onChange({ direction: e.target.value as HotSectorEntry['direction'] })} style={input}>
            <option value="bullish">看多</option><option value="neutral">中性</option><option value="bearish">看空</option>
          </select>
        </Field>
      </Row>
      <Field label="领涨个股（逗号分隔）">
        <input
          value={(sector.related_symbols || []).join(', ')}
          onChange={(e) => onChange({ related_symbols: e.target.value.split(/[,，\s]+/).filter(Boolean) })}
          style={input}
          placeholder="NVDA, AMD, AVGO"
        />
      </Field>
      <Field label="备注">
        <input value={sector.notes || ''} onChange={(e) => onChange({ notes: e.target.value })} style={input} />
      </Field>
      <div style={{ textAlign: 'right' }}>
        <button onClick={onRemove} style={dangerBtn}><Trash2 size={12} /> 删除</button>
      </div>
    </div>
  )
}

function StockRow({ stock, sectors, onChange, onRemove }: {
  stock: HotStockEntry; sectors: HotSectorEntry[];
  onChange: (u: Partial<HotStockEntry>) => void; onRemove: () => void
}) {
  return (
    <div style={{ marginTop: 10, padding: 10, background: '#10131d', border: '1px solid #2d3148', borderRadius: 8 }}>
      <Row>
        <Field label="代码" flex>
          <input value={stock.symbol} onChange={(e) => onChange({ symbol: e.target.value })} style={input} placeholder="NVDA" />
        </Field>
        <Field label="所属板块" flex>
          <select value={stock.sector || ''} onChange={(e) => onChange({ sector: e.target.value || undefined })} style={input}>
            <option value="">(不选)</option>
            {sectors.filter((s) => s.name).map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="状态" flex>
          <select value={stock.status} onChange={(e) => onChange({ status: e.target.value as HotStockEntry['status'] })} style={input}>
            <option value="leading">领涨</option>
            <option value="following">跟随</option>
            <option value="laggard">滞涨</option>
            <option value="peripheral">边缘</option>
          </select>
        </Field>
      </Row>
      <Field label="主题">
        <input value={stock.theme || ''} onChange={(e) => onChange({ theme: e.target.value })} style={input}
          placeholder="AI 概念 / 财报超预期" />
      </Field>
      <Field label="备注">
        <input value={stock.notes || ''} onChange={(e) => onChange({ notes: e.target.value })} style={input} />
      </Field>
      <div style={{ textAlign: 'right' }}>
        <button onClick={onRemove} style={dangerBtn}><Trash2 size={12} /> 删除</button>
      </div>
    </div>
  )
}

function SymbolTrendSelect({ value, onChange }: { value: SymbolTrend; onChange: (v: SymbolTrend) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as SymbolTrend)} style={input}>
      <option value="up">↑ 上</option>
      <option value="down">↓ 下</option>
      <option value="range">→ 横盘</option>
    </select>
  )
}

// ═══════════════════════════════════════════════════════
// Step 3: 资产专属字段
// ═══════════════════════════════════════════════════════

function Step3AssetSpecifics({ assetClass, equityForm, setEquityForm, optionForm, setOptionForm, cryptoForm, setCryptoForm }: {
  assetClass: PlanAssetClass
  equityForm: EquityForm; setEquityForm: (v: EquityForm) => void
  optionForm: OptionForm; setOptionForm: (v: OptionForm) => void
  cryptoForm: CryptoForm; setCryptoForm: (v: CryptoForm) => void
}) {
  if (assetClass === 'equity') {
    return (
      <Card title="股票">
        <Field label="行业板块"><input value={equityForm.sector} onChange={(e) => setEquityForm({ ...equityForm, sector: e.target.value })} style={input} placeholder="Tech / Finance" /></Field>
        <label style={checkLabel}>
          <input type="checkbox" checked={equityForm.uses_margin} onChange={(e) => setEquityForm({ ...equityForm, uses_margin: e.target.checked })} /> 使用融资
        </label>
        <label style={checkLabel}>
          <input type="checkbox" checked={equityForm.pdt_affected} onChange={(e) => setEquityForm({ ...equityForm, pdt_affected: e.target.checked })} /> 受 PDT 规则限制
        </label>
      </Card>
    )
  }
  if (assetClass === 'option') {
    return (
      <Card title="期权">
        <Row>
          <Field label="类型" flex>
            <select value={optionForm.option_type} onChange={(e) => setOptionForm({ ...optionForm, option_type: e.target.value as 'call' | 'put' })} style={input}>
              <option value="call">Call</option><option value="put">Put</option>
            </select>
          </Field>
          <Field label="策略" flex>
            <select value={optionForm.option_strategy} onChange={(e) => setOptionForm({ ...optionForm, option_strategy: e.target.value as OptionStrategy })} style={input}>
              <option value="long_call">Long Call</option>
              <option value="long_put">Long Put</option>
              <option value="short_call">Short Call</option>
              <option value="short_put">Short Put</option>
              <option value="covered_call">Covered Call</option>
              <option value="protective_put">Protective Put</option>
              <option value="vertical_spread">Vertical Spread</option>
              <option value="other">Other</option>
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="标的代码" flex><input value={optionForm.underlying_symbol} onChange={(e) => setOptionForm({ ...optionForm, underlying_symbol: e.target.value })} style={input} /></Field>
          <Field label="行权价" flex><input type="number" value={optionForm.strike_price} onChange={(e) => setOptionForm({ ...optionForm, strike_price: e.target.value })} style={input} /></Field>
        </Row>
        <Row>
          <Field label="到期日" flex><input type="date" value={optionForm.expiration_date} onChange={(e) => setOptionForm({ ...optionForm, expiration_date: e.target.value })} style={input} /></Field>
          <Field label="合约乘数" flex><input type="number" value={optionForm.contract_multiplier} onChange={(e) => setOptionForm({ ...optionForm, contract_multiplier: e.target.value })} style={input} /></Field>
        </Row>
        <Field label="隐含波动率（可选）"><input type="number" value={optionForm.implied_volatility} onChange={(e) => setOptionForm({ ...optionForm, implied_volatility: e.target.value })} style={input} /></Field>
      </Card>
    )
  }
  return (
    <Card title="数字货币">
      <Row>
        <Field label="类型" flex>
          <select value={cryptoForm.instrument_type} onChange={(e) => setCryptoForm({ ...cryptoForm, instrument_type: e.target.value as CryptoInstrumentType })} style={input}>
            <option value="spot">现货</option>
            <option value="perpetual">永续合约</option>
            <option value="dated_futures">交割合约</option>
            <option value="margin">现货杠杆</option>
          </select>
        </Field>
        <Field label="交易所" flex>
          <select value={cryptoForm.exchange} onChange={(e) => setCryptoForm({ ...cryptoForm, exchange: e.target.value })} style={input}>
            {['Binance', 'OKX', 'Bybit', 'Gate', 'Coinbase', 'Other'].map((x) =>
              <option key={x} value={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="计价" flex>
          <select value={cryptoForm.quote_currency} onChange={(e) => setCryptoForm({ ...cryptoForm, quote_currency: e.target.value })} style={input}>
            {['USDT', 'USDC', 'USD', 'BTC', 'ETH'].map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </Field>
      </Row>
      {cryptoForm.instrument_type !== 'spot' && (
        <Field label="杠杆倍数">
          <input type="number" value={cryptoForm.leverage} onChange={(e) => setCryptoForm({ ...cryptoForm, leverage: e.target.value })} style={input} />
        </Field>
      )}
      {cryptoForm.instrument_type === 'perpetual' && (
        <Field label="资金费率观察（可选）">
          <input value={cryptoForm.funding_rate_awareness} onChange={(e) => setCryptoForm({ ...cryptoForm, funding_rate_awareness: e.target.value })} style={input}
            placeholder="正费率 0.01%，偏多占优" />
        </Field>
      )}
      {cryptoForm.instrument_type === 'dated_futures' && (
        <Field label="到期日">
          <input type="date" value={cryptoForm.expiration_date} onChange={(e) => setCryptoForm({ ...cryptoForm, expiration_date: e.target.value })} style={input} />
        </Field>
      )}
      <Field label="Chain（可选）">
        <input value={cryptoForm.chain} onChange={(e) => setCryptoForm({ ...cryptoForm, chain: e.target.value })} style={input}
          placeholder="Ethereum / Solana / BSC" />
      </Field>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════
// Step 4: 候选方案
// ═══════════════════════════════════════════════════════

function Step4Candidates({ candidates, setCandidates, selectedCandidateId, setSelectedCandidateId, decisionRationale, setDecisionRationale }: {
  candidates: CandidateDraft[]; setCandidates: (v: CandidateDraft[]) => void
  selectedCandidateId: string; setSelectedCandidateId: (v: string) => void
  decisionRationale: string; setDecisionRationale: (v: string) => void
}) {
  const addCandidate = () => {
    if (candidates.length >= 5) return
    const label = ['主方案', '方案 B', '方案 C', '方案 D', '方案 E'][candidates.length] || `方案 ${candidates.length + 1}`
    setCandidates([...candidates, emptyCandidate(label)])
  }
  const dup = (c: CandidateDraft) => {
    if (candidates.length >= 5) return
    setCandidates([...candidates, { ...c, id: generateCandidateId(), name: c.name + '·副本' }])
  }
  const remove = (id: string) => {
    const next = candidates.filter((c) => c.id !== id)
    setCandidates(next)
    if (selectedCandidateId === id && next.length) setSelectedCandidateId(next[0].id)
  }
  const update = (id: string, u: Partial<CandidateDraft>) => {
    setCandidates(candidates.map((c) => c.id === id ? { ...c, ...u } : c))
  }
  return (
    <Card title="候选方案（至少 1 个，最多 5 个）">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        {candidates.length < 5 && (
          <button onClick={addCandidate} style={tinyBtn}><Plus size={12} /> 添加方案</button>
        )}
      </div>
      {candidates.map((c) => (
        <div key={c.id} style={{
          marginBottom: 14, padding: 14,
          background: selectedCandidateId === c.id ? '#1e3a8a22' : '#10131d',
          border: `1px solid ${selectedCandidateId === c.id ? '#3b82f6' : '#2d3148'}`,
          borderRadius: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e5e7eb' }}>
              <input type="radio" checked={selectedCandidateId === c.id} onChange={() => setSelectedCandidateId(c.id)} />
              <input value={c.name} onChange={(e) => update(c.id, { name: e.target.value })}
                style={{ ...input, width: 200, padding: '4px 8px' }} />
              {selectedCandidateId === c.id && <span style={{ color: '#3b82f6', fontSize: 11 }}>✓ 定档</span>}
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => dup(c)} style={tinyBtn}>复制</button>
              {candidates.length > 1 && (
                <button onClick={() => remove(c.id)} style={dangerBtn}><Trash2 size={12} /></button>
              )}
            </div>
          </div>
          <Row>
            <Field label="策略类型" flex><input value={c.strategy_type} onChange={(e) => update(c.id, { strategy_type: e.target.value })} style={input} placeholder="正股+止损" /></Field>
          </Row>
          <Row>
            <Field label="入场下限" flex><input type="number" value={c.entry_low} onChange={(e) => update(c.id, { entry_low: e.target.value })} style={input} /></Field>
            <Field label="入场上限" flex><input type="number" value={c.entry_high} onChange={(e) => update(c.id, { entry_high: e.target.value })} style={input} /></Field>
            <Field label="止损价" flex><input type="number" value={c.planned_stop} onChange={(e) => update(c.id, { planned_stop: e.target.value })} style={input} /></Field>
          </Row>
          <Field label="目标价（逗号分隔，可多个）">
            <input value={c.planned_targets} onChange={(e) => update(c.id, { planned_targets: e.target.value })} style={input} placeholder="342, 355, 380" />
          </Field>
          <Row>
            <Field label="仓位方式" flex>
              <select value={c.sizing_type} onChange={(e) => update(c.id, { sizing_type: e.target.value as SizingType })} style={input}>
                <option value="absolute">数量</option>
                <option value="capital_pct">资金占比 %</option>
                <option value="risk_pct">风险占比 %</option>
              </select>
            </Field>
            {c.sizing_type === 'absolute' && (
              <Field label="数量" flex><input type="number" value={c.sizing_quantity} onChange={(e) => update(c.id, { sizing_quantity: e.target.value })} style={input} /></Field>
            )}
            {c.sizing_type === 'capital_pct' && (
              <>
                <Field label="占比 %" flex><input type="number" value={c.sizing_percentage} onChange={(e) => update(c.id, { sizing_percentage: e.target.value })} style={input} /></Field>
                <Field label="总资金" flex><input type="number" value={c.sizing_capital_reference} onChange={(e) => update(c.id, { sizing_capital_reference: e.target.value })} style={input} /></Field>
              </>
            )}
            {c.sizing_type === 'risk_pct' && (
              <>
                <Field label="风险 %" flex><input type="number" value={c.sizing_risk_percentage} onChange={(e) => update(c.id, { sizing_risk_percentage: e.target.value })} style={input} /></Field>
                <Field label="总资金" flex><input type="number" value={c.sizing_capital_reference} onChange={(e) => update(c.id, { sizing_capital_reference: e.target.value })} style={input} /></Field>
              </>
            )}
          </Row>
          <Row>
            <Field label="优点" flex><input value={c.pros} onChange={(e) => update(c.id, { pros: e.target.value })} style={input} /></Field>
            <Field label="缺点" flex><input value={c.cons} onChange={(e) => update(c.id, { cons: e.target.value })} style={input} /></Field>
          </Row>
        </div>
      ))}
      <Field label="定档理由">
        <textarea value={decisionRationale} onChange={(e) => setDecisionRationale(e.target.value)}
          rows={2} style={textarea} placeholder="为什么是这个方案（非必填但建议填写）" />
      </Field>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════
// Step 5: 置信度 & 后手
// ═══════════════════════════════════════════════════════

function Step5Confidence({ score, setScore, confidenceReason, setConfidenceReason,
  invalidationCondition, setInvalidationCondition, fallbackTrigger, setFallbackTrigger, fallbackAction, setFallbackAction }: {
  score: number; setScore: (v: number) => void
  confidenceReason: string; setConfidenceReason: (v: string) => void
  invalidationCondition: string; setInvalidationCondition: (v: string) => void
  fallbackTrigger: string; setFallbackTrigger: (v: string) => void
  fallbackAction: string; setFallbackAction: (v: string) => void
}) {
  return (
    <Card title="置信度 & 后手">
      <Field label={`置信度（${score}/5）`}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setScore(n)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: n <= score ? '#eab308' : '#4b5563', fontSize: 22 }}>★</button>
          ))}
        </div>
      </Field>
      <Field label="为什么是这个分数（≥10 字，必填）">
        <textarea rows={2} value={confidenceReason} onChange={(e) => setConfidenceReason(e.target.value)} style={textarea} />
      </Field>
      <Field label="失效条件（可选，纯文字）">
        <input value={invalidationCondition} onChange={(e) => setInvalidationCondition(e.target.value)} style={input}
          placeholder="若跌破 180 则计划失效" />
      </Field>
      <Row>
        <Field label="后手触发（可选，与下方同填或同不填）" flex>
          <input value={fallbackTrigger} onChange={(e) => setFallbackTrigger(e.target.value)} style={input} placeholder="跌破 180" />
        </Field>
        <Field label="后手动作" flex>
          <input value={fallbackAction} onChange={(e) => setFallbackAction(e.target.value)} style={input} placeholder="改用正股 + Put 保险" />
        </Field>
      </Row>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════
// Step 6: 逻辑 & 风险
// ═══════════════════════════════════════════════════════

function Step6Logic({ entryRationale, setEntryRationale, riskNotes, setRiskNotes, strategyTags, setStrategyTags }: {
  entryRationale: string; setEntryRationale: (v: string) => void
  riskNotes: string; setRiskNotes: (v: string) => void
  strategyTags: string; setStrategyTags: (v: string) => void
}) {
  return (
    <Card title="逻辑 · 风险">
      <Field label="入场逻辑（必填，≥20 字）">
        <textarea rows={4} value={entryRationale} onChange={(e) => setEntryRationale(e.target.value)} style={textarea}
          placeholder="入场触发条件、对应的技术或基本面依据、风险点" />
      </Field>
      <Field label="风险点（可选）">
        <textarea rows={3} value={riskNotes} onChange={(e) => setRiskNotes(e.target.value)} style={textarea} />
      </Field>
      <Field label="策略标签（逗号分隔）">
        <input value={strategyTags} onChange={(e) => setStrategyTags(e.target.value)} style={input} placeholder="breakout, earnings_play" />
      </Field>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════
// Step 7: 预览
// ═══════════════════════════════════════════════════════

function Step7Preview({ plan }: { plan: TradePlan }) {
  const primary = plan.candidates.find((c) => c.id === plan.selected_candidate_id)
  return (
    <Card title="预览">
      <KV label="标的">{plan.symbol} · {plan.direction === 'long' ? 'Long' : 'Short'} · {PLAN_ASSET_LABELS[plan.asset_class]}</KV>
      <KV label="有效期">{plan.effective_from} ~ {plan.effective_until}</KV>
      <KV label="交易目标">{PRIMARY_GOAL_LABELS[plan.primary_goal]} · 资金属性 {FUND_ATTRIBUTE_LABELS[plan.fund_attribute]}</KV>
      <KV label="置信度">★ {plan.confidence.subjective_score} / 5 — {plan.confidence.subjective_reason}</KV>
      {primary && <KV label="定档">
        {primary.name} · 入场 {primary.entry_low}-{primary.entry_high} · 止损 {primary.planned_stop} · 目标 {primary.planned_targets.join(', ')}
      </KV>}
      <KV label="候选数">{plan.candidates.length}</KV>
      <KV label="入场逻辑">{plan.entry_rationale}</KV>
      {plan.market_context.theme_narrative && <KV label="主叙事">{plan.market_context.theme_narrative}</KV>}
      {plan.market_context.hot_sectors.length > 0 && (
        <KV label="热点板块">
          {plan.market_context.hot_sectors.map((s) => `${s.name}(${s.strength}/${s.direction})`).join('、')}
        </KV>
      )}
      {plan.market_context.hot_stocks.length > 0 && (
        <KV label="热点个股">
          {plan.market_context.hot_stocks.map((s) => `${s.symbol}(${s.status})`).join('、')}
        </KV>
      )}
    </Card>
  )
}

// ═══════════════════════════════════════════════════════
// 公共小组件
// ═══════════════════════════════════════════════════════

const TREND_LABEL: Record<MarketTrend, string> = {
  bull: '多头', bear: '空头', range: '震荡', uncertain: '未定',
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16, padding: 16, background: '#1a1d29', border: '1px solid #2d3148', borderRadius: 10 }}>
      {title && <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#e5e7eb' }}>{title}</div>}
      {children}
    </div>
  )
}

function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
  return (
    <div style={{ marginBottom: 12, flex: flex ? 1 : undefined }}>
      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 12 }}>{children}</div>
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 13 }}>
      <div style={{ width: 100, color: '#9ca3af', flexShrink: 0 }}>{label}</div>
      <div style={{ color: '#e5e7eb', flex: 1, wordBreak: 'break-word' }}>{children}</div>
    </div>
  )
}

const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', background: '#10131d',
  border: '1px solid #2d3148', borderRadius: 8, color: '#e5e7eb', fontSize: 13,
  boxSizing: 'border-box',
}

const textarea: React.CSSProperties = { ...input, resize: 'vertical', fontFamily: 'inherit' }

const radio = (active: boolean): React.CSSProperties => ({
  flex: 1, textAlign: 'center', padding: '8px 12px', borderRadius: 8,
  border: `1px solid ${active ? '#3b82f6' : '#2d3148'}`,
  background: active ? '#1e3a8a33' : '#10131d',
  color: active ? '#93c5fd' : '#9ca3af', cursor: 'pointer', fontSize: 13, fontWeight: 500,
})

const backBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
  background: 'transparent', color: '#9ca3af', border: '1px solid #2d3148',
  borderRadius: 8, fontSize: 12, cursor: 'pointer',
}

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', padding: '8px 20px',
  background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8,
  fontSize: 13, cursor: 'pointer', fontWeight: 500,
}

const secondaryBtn: React.CSSProperties = {
  padding: '8px 20px', background: '#1a1d29', color: '#e5e7eb',
  border: '1px solid #2d3148', borderRadius: 8, fontSize: 13, cursor: 'pointer',
}

const tinyBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
  background: '#1a1d29', color: '#93c5fd', border: '1px solid #2d3148',
  borderRadius: 6, fontSize: 12, cursor: 'pointer',
}

const dangerBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
  background: 'transparent', color: '#ef4444', border: '1px solid #ef444466',
  borderRadius: 6, fontSize: 12, cursor: 'pointer',
}

const checkLabel: React.CSSProperties = {
  display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#e5e7eb', marginBottom: 10,
}

const errorBox: React.CSSProperties = {
  marginTop: 12, padding: 12, background: '#7f1d1d33', border: '1px solid #ef444455',
  borderRadius: 8, color: '#fca5a5', fontSize: 12, lineHeight: 1.8,
}
