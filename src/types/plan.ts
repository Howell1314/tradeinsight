import type { AssetClass } from './trade'

// ═══════════════════════════════════════════════════════
// 生命周期
// ═══════════════════════════════════════════════════════

export type PlanStatus =
  | 'draft'
  | 'active'
  | 'triggered'
  | 'partial'
  | 'closed'
  | 'expired'
  | 'cancelled'
  | 'deleted'

export type PlanAssetClass = Extract<AssetClass, 'equity' | 'option' | 'crypto'>

export type PlanDirection = 'long' | 'short'

export type PlanMode = 'full' | 'quick'

export type PrimaryGoal = 'avoid_risk' | 'steady_profit' | 'chase_big_gain'

// ═══════════════════════════════════════════════════════
// 市场环境（含热点）
// ═══════════════════════════════════════════════════════

export type MarketTrend = 'bull' | 'bear' | 'range' | 'uncertain'
export type SymbolTrend = 'up' | 'down' | 'range'

export interface HotSectorEntry {
  id: string
  name: string
  strength: 'strong' | 'medium' | 'weak'
  direction: 'bullish' | 'bearish' | 'neutral'
  related_symbols?: string[]
  notes?: string
}

export interface HotStockEntry {
  id: string
  symbol: string
  sector?: string
  theme?: string
  status: 'leading' | 'following' | 'laggard' | 'peripheral'
  notes?: string
}

export interface MarketContext {
  market_trend_short: MarketTrend
  market_trend_medium: MarketTrend
  market_note?: string

  theme_narrative?: string
  hot_sectors: HotSectorEntry[]
  hot_stocks: HotStockEntry[]

  trend_long: SymbolTrend
  trend_medium: SymbolTrend
  trend_short: SymbolTrend
  key_levels?: string
  fundamental_note?: string

  key_macro_events?: string
  days_to_next_earnings?: number
}

// ═══════════════════════════════════════════════════════
// 资产类别专属字段
// ═══════════════════════════════════════════════════════

export interface EquitySpecifics {
  asset_class: 'equity'
  sector?: string
  uses_margin: boolean
  pdt_affected?: boolean
}

export type OptionStrategy =
  | 'long_call'
  | 'long_put'
  | 'short_call'
  | 'short_put'
  | 'covered_call'
  | 'protective_put'
  | 'vertical_spread'
  | 'other'

export interface OptionSpecifics {
  asset_class: 'option'
  option_type: 'call' | 'put'
  option_strategy: OptionStrategy
  underlying_symbol: string
  strike_price: number
  expiration_date: string
  contract_multiplier: number
  implied_volatility?: number
  moneyness?: 'ITM' | 'ATM' | 'OTM'
}

export type CryptoInstrumentType = 'spot' | 'perpetual' | 'dated_futures' | 'margin'

export interface CryptoSpecifics {
  asset_class: 'crypto'
  instrument_type: CryptoInstrumentType
  exchange: string
  quote_currency: string
  leverage?: number
  funding_rate_awareness?: string
  expiration_date?: string
  chain?: string
}

export type AssetSpecifics = EquitySpecifics | OptionSpecifics | CryptoSpecifics

// ═══════════════════════════════════════════════════════
// 候选方案 & 仓位
// ═══════════════════════════════════════════════════════

export type PositionSizing =
  | { type: 'absolute'; quantity: number }
  | { type: 'capital_pct'; percentage: number; capital_reference: number }
  | { type: 'risk_pct'; risk_percentage: number; capital_reference: number }

export interface PlanCandidate {
  id: string
  name: string
  strategy_type: string

  entry_low: number
  entry_high: number

  planned_stop: number
  planned_targets: number[]

  position_sizing: PositionSizing

  expected_max_loss: number
  expected_max_loss_pct: number
  expected_return_at_target?: number
  expected_return_pct?: number
  expected_rr_ratio?: number

  pros?: string
  cons?: string
}

// ═══════════════════════════════════════════════════════
// 分批（Phase 1 不做 UI，但保留类型以匹配 JSONB schema）
// ═══════════════════════════════════════════════════════

export interface PlanLeg {
  id: string
  leg_type: 'entry' | 'exit'
  leg_order: number
  price: number
  price_low?: number
  price_high?: number
  quantity_ratio: number
  trigger_condition?: string
  status: 'pending' | 'filled' | 'skipped' | 'cancelled'
  filled_trade_ids: string[]
  filled_at?: string
  filled_price?: number
  skipped_reason?: string
}

// ═══════════════════════════════════════════════════════
// 置信度 & 后手
// ═══════════════════════════════════════════════════════

export interface PlanConfidence {
  mode: 'subjective'
  subjective_score: number
  subjective_reason: string
  final_score: number
}

export interface FallbackPlan {
  trigger: string
  action: string
}

// ═══════════════════════════════════════════════════════
// 时间线 & 日级细化（Phase 1 不做 UI，保留类型）
// ═══════════════════════════════════════════════════════

export interface PlanTimelineEvent {
  id: string
  timestamp: string
  event_type:
    | 'created'
    | 'revised'
    | 'note'
    | 'candidate_selected'
    | 'leg_filled'
    | 'leg_skipped'
    | 'status_changed'
    | 'cancelled'
  content: string
  related_version_id?: string
  related_leg_id?: string
  from_status?: PlanStatus
  to_status?: PlanStatus
}

export interface DailyPlanEntry {
  id: string
  date: string
  pre_market_note?: string
  intended_action?: string
  actual_action?: string
  discipline_rating?: number
}

// ═══════════════════════════════════════════════════════
// 资金属性（v2.4 B 档：仅标记）
// ═══════════════════════════════════════════════════════

export type FundAttribute =
  | 'margin'
  | 'principal'
  | 'long_term_profit'
  | 'extraordinary_profit'
  | 'medium_term_profit'
  | 'short_term_profit'
  | 'passive_profit'
  | 'secondary_profit'
  | 'tertiary_profit'
  | 'split_profit'

export const FUND_ATTRIBUTE_LABELS: Record<FundAttribute, string> = {
  margin: '融资',
  principal: '本金',
  long_term_profit: '长线利润',
  extraordinary_profit: '超常利润',
  medium_term_profit: '中线利润',
  short_term_profit: '短线利润',
  passive_profit: '被动利润',
  secondary_profit: '二级利润',
  tertiary_profit: '三级利润',
  split_profit: '分裂利润',
}

export const FUND_ATTRIBUTE_ORDER: FundAttribute[] = [
  'margin',
  'principal',
  'long_term_profit',
  'extraordinary_profit',
  'medium_term_profit',
  'short_term_profit',
  'passive_profit',
  'secondary_profit',
  'tertiary_profit',
  'split_profit',
]

// ═══════════════════════════════════════════════════════
// 主模型：TradePlan
// ═══════════════════════════════════════════════════════

export interface TradePlan {
  id: string
  user_id: string
  account_id: string

  asset_class: PlanAssetClass
  symbol: string
  direction: PlanDirection

  plan_mode: PlanMode

  status: PlanStatus
  effective_from: string
  effective_until: string
  closed_at?: string
  expired_note?: string
  cancelled_reason?: string

  primary_goal: PrimaryGoal

  market_context: MarketContext
  asset_specifics: AssetSpecifics

  candidates: PlanCandidate[]
  selected_candidate_id?: string
  decision_rationale?: string

  legs: PlanLeg[]

  confidence: PlanConfidence

  invalidation_condition?: string
  fallback_plan?: FallbackPlan

  entry_rationale: string
  risk_notes?: string

  strategy_tags: string[]

  fund_attribute: FundAttribute

  timeline: PlanTimelineEvent[]
  daily_entries: DailyPlanEntry[]

  created_at: string
  updated_at: string
}

// ═══════════════════════════════════════════════════════
// Trade 扩展（Phase 1 仅 plan_id/plan_candidate_id/off_plan_reason/off_plan_note）
// Checklist 推迟到 Phase 2
// ═══════════════════════════════════════════════════════

export type OffPlanReason =
  | 'opportunistic'
  | 'fomo'
  | 'revenge'
  | 'boredom'
  | 'herd'
  | 'other'

export const OFF_PLAN_REASON_LABELS: Record<OffPlanReason, string> = {
  opportunistic: '临场机会',
  fomo: 'FOMO（怕错过）',
  revenge: '报复性交易',
  boredom: '无聊/手痒',
  herd: '跟风',
  other: '其他',
}

// ═══════════════════════════════════════════════════════
// UI 辅助常量
// ═══════════════════════════════════════════════════════

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  draft: '草稿',
  active: '就绪',
  triggered: '已触发',
  partial: '分批执行',
  closed: '已平仓',
  expired: '已过期',
  cancelled: '已取消',
  deleted: '已删除',
}

export const PRIMARY_GOAL_LABELS: Record<PrimaryGoal, string> = {
  avoid_risk: '避险',
  steady_profit: '稳定盈利',
  chase_big_gain: '追逐大利润',
}

export const PLAN_ASSET_LABELS: Record<PlanAssetClass, string> = {
  equity: '股票',
  option: '期权',
  crypto: '数字货币',
}
