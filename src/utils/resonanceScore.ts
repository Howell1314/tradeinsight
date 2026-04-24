import type {
  TradePlan,
  PlanCandidate,
  PositionSizing,
  ResonanceBreakdown,
  SentimentBucket,
  FundAttribute,
} from '../types/plan'
import { FUND_ATTRIBUTE_LABELS } from '../types/plan'

// v2.4 Phase 2.1：资金档位集合（规则 a 和规则 c 复用）
const PRINCIPAL_SUBSET = new Set<FundAttribute>([
  'principal',
  'secondary_profit',
])
const PROFIT_SUBSET = new Set<FundAttribute>([
  'long_term_profit',
  'medium_term_profit',
  'short_term_profit',
])
const CORE_SET = new Set<FundAttribute>([
  'principal',
  'secondary_profit',
  'long_term_profit',
  'medium_term_profit',
  'short_term_profit',
])

export interface FundAttributeFitResult {
  level: 'ok' | 'info' | 'warn'
  messages: string[]
}

export function computeResonanceScore(plan: TradePlan): ResonanceBreakdown | null {
  const { confidence, market_context: mc, candidates, selected_candidate_id } = plan

  if (confidence.mode !== 'resonance') return null
  if (confidence.symbol_familiarity == null) return null

  const blockers: string[] = []

  const ps = mc.price_structure
  const price_structure: 0 | 1 =
    ps != null
    && ps.signal_type !== 'range_mid'
    && ps.signal_type !== 'other'
    && (ps.confidence === 'strong' || ps.confidence === 'medium')
      ? 1
      : 0
  if (price_structure === 0) {
    blockers.push('价格结构信号未达标或未填写')
  }

  const bucket = mc.market_sentiment?.bucket
  const sentiment: 0 | 1 =
    bucket === 'extreme_fear' || bucket === 'extreme_greed' ? 1 : 0
  if (sentiment === 0) {
    blockers.push('情绪未处于极值区（仅 extreme_fear / extreme_greed 算达标）')
  }

  const sf = confidence.symbol_familiarity
  const familiarity: 0 | 1 = sf >= 4 ? 1 : 0
  if (familiarity === 0) {
    blockers.push(`标的熟悉度不足 4（当前 ${sf}）`)
  }

  const candidate = selectCandidate(candidates, selected_candidate_id)

  const strategy_fit: 0 | 1 = candidateHasStrategyFit(candidate) ? 1 : 0
  if (strategy_fit === 0) {
    blockers.push('工具组合未填写或与场景匹配度不足')
  }

  const sizing_fit: 0 | 1 = candidateHasSizingFit(candidate) ? 1 : 0
  if (sizing_fit === 0) {
    blockers.push('仓位方案字段或仓位判断说明未填完整')
  }

  const total = (price_structure + sentiment + familiarity + strategy_fit + sizing_fit) as ResonanceBreakdown['total']

  return {
    price_structure,
    sentiment,
    familiarity,
    strategy_fit,
    sizing_fit,
    total,
    blockers,
    computed_at: new Date().toISOString(),
  }
}

export function classifyFearGreedBucket(value: number): SentimentBucket {
  if (!Number.isFinite(value)) return 'neutral'
  const v = Math.max(0, Math.min(100, value))
  if (v < 25) return 'extreme_fear'
  if (v < 45) return 'fear'
  if (v < 56) return 'neutral'
  if (v < 76) return 'greed'
  return 'extreme_greed'
}

export function evaluateFundAttributeFit(
  plan: TradePlan,
  selectedFundAttribute: FundAttribute,
): FundAttributeFitResult {
  const messages: string[] = []

  const sf = plan.confidence.symbol_familiarity
  if (sf != null && sf < 4 && CORE_SET.has(selectedFundAttribute)) {
    messages.push(
      `熟悉度不足 4（当前 ${sf}）配合主力档位（${FUND_ATTRIBUTE_LABELS[selectedFundAttribute]}）；`
      + '哲学建议改用探险家级资金（超常 / 分裂利润）小仓测试',
    )
  }

  const bd = plan.confidence.resonance_breakdown
  if (bd && bd.total < 4) {
    messages.push(
      `共振度仅 ${bd.total} 层达标（不足 4），哲学建议保持侦察态；`
      + '可先保存为 draft，条件成熟后再激活',
    )
  } else if (bd && (bd.total === 4 || bd.total === 5)) {
    const candidate = selectCandidate(plan.candidates, plan.selected_candidate_id)
    const sizing = candidate?.position_sizing
    if (sizing?.type === 'capital_pct') {
      const pct = sizing.percentage
      if (PRINCIPAL_SUBSET.has(selectedFundAttribute)) {
        if (bd.total === 5 && pct > 50) {
          messages.push(
            `共振度 5 + 本金 / 二级利润档位，仓位 ${pct}%；超过建议上限 50%（基准约 33%）`,
          )
        } else if (bd.total === 4 && pct > 25) {
          messages.push(
            `共振度 4 + 本金 / 二级利润档位，仓位 ${pct}%；超过建议上限 25%（基准约 17%）`,
          )
        }
      } else if (PROFIT_SUBSET.has(selectedFundAttribute)) {
        if (bd.total === 5 && pct > 70) {
          messages.push(
            `共振度 5 + 主力利润档位，仓位 ${pct}%；超过建议上限 70%`,
          )
        } else if (bd.total === 4 && pct > 40) {
          messages.push(
            `共振度 4 + 主力利润档位，仓位 ${pct}%；超过建议上限 40%`,
          )
        }
      }
    }
  }

  return {
    level: messages.length > 0 ? 'warn' : 'ok',
    messages,
  }
}

export function shouldAutoDraft(plan: TradePlan): boolean {
  const bd = computeResonanceScore(plan)
  if (bd == null) return false
  return bd.total < 4
}

function selectCandidate(
  candidates: PlanCandidate[],
  selectedId?: string,
): PlanCandidate | null {
  if (candidates.length === 0) return null
  if (selectedId) {
    const found = candidates.find((c) => c.id === selectedId)
    if (found) return found
  }
  return candidates[0]
}

function candidateHasStrategyFit(c: PlanCandidate | null): boolean {
  if (!c?.strategy_structure) return false
  const { structure_type, match_score } = c.strategy_structure
  if (structure_type === 'other') return false
  if (match_score === 'low') return false
  return true
}

function candidateHasSizingFit(c: PlanCandidate | null): boolean {
  if (!c) return false
  if (!isPositionSizingComplete(c.position_sizing)) return false
  if (!c.sizing_rationale || c.sizing_rationale.trim().length === 0) return false
  return true
}

function isPositionSizingComplete(ps: PositionSizing): boolean {
  const isPositiveFinite = (n: number | undefined): n is number =>
    typeof n === 'number' && Number.isFinite(n) && n > 0
  switch (ps.type) {
    case 'absolute':
      return isPositiveFinite(ps.quantity)
    case 'capital_pct':
      return isPositiveFinite(ps.percentage) && isPositiveFinite(ps.capital_reference)
    case 'risk_pct':
      return isPositiveFinite(ps.risk_percentage) && isPositiveFinite(ps.capital_reference)
  }
}
