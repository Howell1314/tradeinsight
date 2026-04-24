import type {
  TradePlan,
  PlanStatus,
  PlanAssetClass,
  PlanDirection,
  PlanMode,
  PrimaryGoal,
  FundAttribute,
  HotSectorEntry,
  HotStockEntry,
  PlanCandidate,
  AssetSpecifics,
  SentimentBucket,
  PriceStructureSignal,
  StrategyStructure,
  StrategyStructureType,
} from '../types/plan'

const VALID_STATUS: PlanStatus[] = [
  'draft', 'active', 'triggered', 'partial', 'closed', 'expired', 'cancelled', 'deleted',
]
const VALID_ASSET: PlanAssetClass[] = ['equity', 'option', 'crypto']
const VALID_DIRECTION: PlanDirection[] = ['long', 'short']
const VALID_MODE: PlanMode[] = ['full', 'quick']
const VALID_GOAL: PrimaryGoal[] = ['avoid_risk', 'steady_profit', 'chase_big_gain']
const VALID_FUND: FundAttribute[] = [
  'margin', 'principal', 'long_term_profit', 'extraordinary_profit',
  'medium_term_profit', 'short_term_profit', 'passive_profit',
  'secondary_profit', 'tertiary_profit', 'split_profit',
]
const VALID_SENTIMENT_BUCKET: SentimentBucket[] = [
  'extreme_fear', 'fear', 'neutral', 'greed', 'extreme_greed',
]
const VALID_SIGNAL_TYPE: PriceStructureSignal['signal_type'][] = [
  'resistance_break', 'support_hold', 'double_top', 'double_bottom', 'range_mid', 'other',
]
const VALID_SIGNAL_CONFIDENCE: PriceStructureSignal['confidence'][] = [
  'strong', 'medium', 'weak',
]
const VALID_STRATEGY_STRUCTURE_TYPE: StrategyStructureType[] = [
  'long_stock', 'long_call', 'long_put', 'short_put', 'short_call', 'covered_call',
  'protective_put', 'risk_reversal', 'vertical_spread_bull', 'vertical_spread_bear',
  'iron_condor', 'cfd_long', 'cfd_short', 'futures_long', 'futures_short', 'other',
]
const VALID_MATCH_SCORE: StrategyStructure['match_score'][] = [
  'high', 'medium', 'low',
]

const MAX_HOT_SECTORS = 5
const MAX_HOT_STOCKS = 10

export interface ValidationError {
  field: string
  message: string
}

/**
 * 结构化校验：返回错误数组（提交时用）
 */
export function validatePlan(plan: Partial<TradePlan>): ValidationError[] {
  const errors: ValidationError[] = []
  const isResonance = plan.confidence?.mode === 'resonance'

  if (!plan.id) errors.push({ field: 'id', message: 'id 缺失' })
  if (!plan.account_id) errors.push({ field: 'account_id', message: '账户必填' })
  if (!plan.symbol || !plan.symbol.trim()) errors.push({ field: 'symbol', message: '标的必填' })
  if (!plan.asset_class || !VALID_ASSET.includes(plan.asset_class)) {
    errors.push({ field: 'asset_class', message: '资产类别必须为 equity / option / crypto' })
  }
  if (!plan.direction || !VALID_DIRECTION.includes(plan.direction)) {
    errors.push({ field: 'direction', message: '方向必须为 long / short' })
  }
  if (!plan.plan_mode || !VALID_MODE.includes(plan.plan_mode)) {
    errors.push({ field: 'plan_mode', message: '创建模式必填' })
  }
  if (!plan.status || !VALID_STATUS.includes(plan.status)) {
    errors.push({ field: 'status', message: '状态非法' })
  }
  if (!plan.effective_from) errors.push({ field: 'effective_from', message: '生效起始日必填' })
  if (!plan.effective_until) errors.push({ field: 'effective_until', message: '生效截止日必填' })
  if (plan.effective_from && plan.effective_until && plan.effective_until < plan.effective_from) {
    errors.push({ field: 'effective_until', message: '截止日不能早于起始日' })
  }
  if (!plan.primary_goal || !VALID_GOAL.includes(plan.primary_goal)) {
    errors.push({ field: 'primary_goal', message: '交易目标必填' })
  }
  if (!plan.fund_attribute || !VALID_FUND.includes(plan.fund_attribute)) {
    errors.push({ field: 'fund_attribute', message: '资金属性必填' })
  }
  if (!plan.entry_rationale || plan.entry_rationale.trim().length < 20) {
    errors.push({ field: 'entry_rationale', message: '入场逻辑至少 20 字' })
  }

  // candidates
  if (!Array.isArray(plan.candidates) || plan.candidates.length < 1) {
    errors.push({ field: 'candidates', message: '至少需要 1 个候选方案' })
  } else {
    plan.candidates.forEach((c, i) => {
      if (!c.id) errors.push({ field: `candidates[${i}].id`, message: 'candidate.id 缺失' })
      if (!c.name?.trim()) errors.push({ field: `candidates[${i}].name`, message: `方案 ${i + 1} 名称必填` })
      if (!(c.entry_low > 0 && c.entry_high >= c.entry_low)) {
        errors.push({ field: `candidates[${i}].entry`, message: `方案 ${i + 1} 入场区间非法` })
      }
      if (!(c.planned_stop > 0)) {
        errors.push({ field: `candidates[${i}].planned_stop`, message: `方案 ${i + 1} 止损价必填` })
      }
      if (!Array.isArray(c.planned_targets) || c.planned_targets.length < 1) {
        errors.push({ field: `candidates[${i}].planned_targets`, message: `方案 ${i + 1} 至少填 1 个目标价` })
      }

      if (isResonance) {
        if (c.strategy_structure) {
          if (!VALID_STRATEGY_STRUCTURE_TYPE.includes(c.strategy_structure.structure_type)) {
            errors.push({
              field: `candidates[${i}].strategy_structure.structure_type`,
              message: `方案 ${i + 1} 工具组合类型非法`,
            })
          }
          if (!VALID_MATCH_SCORE.includes(c.strategy_structure.match_score)) {
            errors.push({
              field: `candidates[${i}].strategy_structure.match_score`,
              message: `方案 ${i + 1} 工具组合匹配度非法`,
            })
          }
        }
        if (c.sizing_rationale !== undefined && c.sizing_rationale.trim().length === 0) {
          errors.push({
            field: `candidates[${i}].sizing_rationale`,
            message: `方案 ${i + 1} 仓位判断说明不能为空`,
          })
        }
      }
    })
  }

  // asset_specifics 一致性
  if (plan.asset_specifics && plan.asset_class) {
    const as = plan.asset_specifics as AssetSpecifics
    if (as.asset_class !== plan.asset_class) {
      errors.push({
        field: 'asset_specifics',
        message: `资产专属字段类型 (${as.asset_class}) 与 plan.asset_class (${plan.asset_class}) 不一致`,
      })
    }
  }

  // market_context 热点上限
  const mc = plan.market_context
  if (mc) {
    if (Array.isArray(mc.hot_sectors) && mc.hot_sectors.length > MAX_HOT_SECTORS) {
      errors.push({ field: 'hot_sectors', message: `热点板块最多 ${MAX_HOT_SECTORS} 个` })
    }
    if (Array.isArray(mc.hot_stocks) && mc.hot_stocks.length > MAX_HOT_STOCKS) {
      errors.push({ field: 'hot_stocks', message: `热点个股最多 ${MAX_HOT_STOCKS} 个` })
    }

    if (isResonance) {
      if (!mc.market_sentiment) {
        errors.push({
          field: 'market_context.market_sentiment',
          message: '共振度模式下市场情绪必填',
        })
      } else {
        if (!mc.market_sentiment.bucket
          || !VALID_SENTIMENT_BUCKET.includes(mc.market_sentiment.bucket)) {
          errors.push({
            field: 'market_context.market_sentiment.bucket',
            message: '市场情绪桶值非法',
          })
        }
        if (mc.market_sentiment.raw_value !== undefined) {
          const rv = mc.market_sentiment.raw_value
          if (typeof rv !== 'number' || !Number.isFinite(rv) || rv < 0 || rv > 100) {
            errors.push({
              field: 'market_context.market_sentiment.raw_value',
              message: 'F&G 原始值需在 0-100',
            })
          }
        }
        if (mc.market_sentiment.percentile_2y !== undefined) {
          const p = mc.market_sentiment.percentile_2y
          if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1) {
            errors.push({
              field: 'market_context.market_sentiment.percentile_2y',
              message: '2 年分位需在 0-1',
            })
          }
        }
      }

      if (mc.price_structure) {
        if (!VALID_SIGNAL_TYPE.includes(mc.price_structure.signal_type)) {
          errors.push({
            field: 'market_context.price_structure.signal_type',
            message: '价格结构信号类型非法',
          })
        }
        if (!VALID_SIGNAL_CONFIDENCE.includes(mc.price_structure.confidence)) {
          errors.push({
            field: 'market_context.price_structure.confidence',
            message: '价格结构置信度非法',
          })
        }
        if (!mc.price_structure.observed_at
          || Number.isNaN(new Date(mc.price_structure.observed_at).getTime())) {
          errors.push({
            field: 'market_context.price_structure.observed_at',
            message: '价格结构观察时间无效',
          })
        }
      }
    }
  }

  // confidence 主观分 / 共振度模式
  const cf = plan.confidence
  if (!cf) {
    errors.push({ field: 'confidence', message: '置信度必填' })
  } else {
    if (cf.mode === 'subjective') {
      if (typeof cf.subjective_score !== 'number'
        || !(cf.subjective_score >= 1 && cf.subjective_score <= 5)) {
        errors.push({ field: 'confidence.subjective_score', message: '置信度 1-5' })
      }
    } else if (cf.mode === 'resonance') {
      const sf = (cf as { symbol_familiarity?: unknown }).symbol_familiarity
      if (sf === undefined || sf === null) {
        errors.push({
          field: 'confidence.symbol_familiarity',
          message: '共振度模式下标的熟悉度必填',
        })
      } else if (typeof sf !== 'number' || !Number.isInteger(sf) || sf < 1 || sf > 5) {
        errors.push({
          field: 'confidence.symbol_familiarity',
          message: '标的熟悉度必须是 1 到 5',
        })
      }
    }
    if (!cf.subjective_reason || cf.subjective_reason.trim().length < 10) {
      errors.push({ field: 'confidence.subjective_reason', message: '置信度理由至少 10 字' })
    }
  }

  return errors
}

/**
 * 布尔校验：用于 persist 恢复时过滤非法条目（容忍旧数据，只要结构大致合法即放行）
 */
export function isValidPlan(p: unknown): p is TradePlan {
  if (!p || typeof p !== 'object') return false
  const r = p as Record<string, unknown>
  return (
    typeof r.id === 'string' && r.id.length > 0 &&
    typeof r.account_id === 'string' &&
    typeof r.symbol === 'string' &&
    VALID_ASSET.includes(r.asset_class as PlanAssetClass) &&
    VALID_DIRECTION.includes(r.direction as PlanDirection) &&
    VALID_STATUS.includes(r.status as PlanStatus) &&
    Array.isArray(r.candidates) &&
    typeof r.entry_rationale === 'string' &&
    r.market_context !== null && typeof r.market_context === 'object' &&
    r.asset_specifics !== null && typeof r.asset_specifics === 'object'
  )
}

/**
 * 确定性 id 生成（避免 Math.random 引发 React key 漂移）
 */
export function generatePlanId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `plan_${Date.now()}_${Math.floor(Math.random() * 1e9).toString(36)}`
}

export function generateCandidateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `cand_${Date.now()}_${Math.floor(Math.random() * 1e9).toString(36)}`
}

export function generateHotSectorId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `hsec_${Date.now()}_${Math.floor(Math.random() * 1e9).toString(36)}`
}

export function generateHotStockId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `hstk_${Date.now()}_${Math.floor(Math.random() * 1e9).toString(36)}`
}

export type { HotSectorEntry, HotStockEntry, PlanCandidate }
