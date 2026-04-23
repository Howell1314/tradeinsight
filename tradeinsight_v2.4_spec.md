# TradeInsight v2.4 Spec — 交易计划 (Trade Plan) 功能

> 版本：**v2.4 Spec · rev.2**  
> 文档日期：2026-04-23  
> 前置版本：v2.3（2026-04-23）  
> 作者：Claude（基于与 Howell 的设计讨论）

## Spec 更新记录

| 修订 | 日期 | 变更 |
|------|------|------|
| rev.1 | 2026-04-23 | 初版 Spec，覆盖 Plan 核心功能（多方案 + 分批 + checklist + 版本 + 复盘）、资金属性标记（B 档）、资产类别 equity + option |
| rev.2 | 2026-04-23 | ① 资产类别扩展为 **equity + option + crypto**；② 移除 `CapitalTemperature` 温度映射（推迟到 v2.5）；③ `MarketContext` 新增**热点板块、热点个股、主叙事**字段；④ 新增附录 C "与 Claude Code 协作指南" |

---

## 0. 文档元信息

### 0.1 本版本 Scope

本版本在 TradeInsight 现有结构（v2.3）基础上，新增**完整的交易计划（Trade Plan）功能**，让系统从"交易流水账"升级为"决策闭环工具"。

**In scope（v2.4 必做）**：

- Plan 模型：完整 + 快速两种创建模式
- 多方案并列比较（Candidates）+ 定档机制
- 分批进出场（Legs）设计
- 市场环境判断，包含**大盘趋势 + 热点板块 + 热点个股 + 主叙事**四个维度
- 下单前 Checklist 强约束（中等等级）
- Plan 生命周期状态机 + 版本迭代 + 时间线
- 交易（Trade）关联 Plan 及计划外交易分类
- Plan 复盘（B+C 提醒方案）
- Analytics 新增"计划执行"标签
- 云端同步
- 资产类别动态字段：**equity、option、crypto** 三类
- **资金属性标记字段**（B 档范围：仅标记、不做强约束，为 v2.5 铺路）

**Out of scope（推迟到 v2.5 及以后）**：

- 资金属性温度映射（cold/warm/hot 分类）
- 资金属性强约束 / 策略匹配 / Playbook（策略模板）
- Account 风险等级 / 资金属性集合绑定
- 资金池余额自动追踪（10 种资金属性的自动转化）
- 阶段目标体系（第一到第五阶段的成长里程碑）
- 配对交易（一个 Plan 同时 long A / short B）
- etf / cfd / futures 的 Plan 专属字段
- Plan 导出为 PDF / 图片
- 条件清单（Checklist）式置信度自动打分
- AI 辅助复盘建议 / 周月复盘报告
- 自动价格监控 / 失效条件机器判断

### 0.2 术语表

| 术语 | 定义 |
|------|------|
| Plan | 交易计划，决策前的结构化规划文档 |
| Candidate | Plan 里的候选方案（一个 Plan 可以有多个并列方案） |
| 定档 | 从多个 Candidate 中选中一个作为最终执行方案 |
| Leg | 分批进场或出场的单个批次 |
| Checklist | 下单前的合规检查清单 |
| Off-Plan Trade | 计划外交易（没有关联到任何 Plan 的交易） |
| Fund Attribute | 资金属性（本金 / 短线利润 / 超常利润等 10 种之一） |
| Hot Sector | 热点板块（短期市场关注度高的行业或概念） |
| Hot Stock | 热点个股（短期强势或资金聚焦的标的） |
| Theme Narrative | 主叙事（当下市场的综合主题，如"AI + 降息预期"） |

---

## 1. 背景与目标

### 1.1 现状痛点

v2.3 的 Journal 功能已实现"事后日志"，但存在两个结构性缺陷：

1. **只有事后反思，没有事前决策结构**。真正有价值的思考（入场逻辑、失效条件、仓位计划）在交易的当下不被强制沉淀，几小时后就被"后见之明"污染。
2. **流水账式记录**。缺少决策质量的量化维度，用户难以通过数据发现自己的决策模式。

### 1.2 v2.4 设计目标

- 让**决策前**的思考过程结构化、可追溯、可复盘
- 让**决策中**的执行行为可约束、可审计（偏离计划有代价）
- 让**决策后**的复盘基于真实的 Plan vs Execution 对比，而非模糊记忆
- 通过多方案比较、版本迭代、时间线三种机制，让 Plan 本身就是决策训练

### 1.3 设计哲学

- **由大到小的决策漏斗**：大盘判断 → 热点板块/个股 → 具体标的，避免"只见树木不见森林"
- **强约束但可绕过**：Checklist 不合规时允许提交，但必须填偏离说明（保留审计痕迹）
- **本地优先**：Plan 数据遵循 v2.3 的存储约定（Zustand persist + Supabase 同步 + `.catch(console.error)`）
- **不做系统级自动化**：失效条件不做价格监控，Plan 过期不弹窗打扰——用户操作系统在前，系统被动配合

---

## 2. 核心概念与数据流

### 2.1 概念模型

```
Account（账户）
   └── TradePlan（计划，周级，默认有效 7 天）
           ├── MarketContext（市场环境判断，前置必填）
           │       ├── 大盘趋势（短线/中线）
           │       ├── HotSectors[]（热点板块）
           │       ├── HotStocks[]（热点个股）
           │       ├── theme_narrative（主叙事）
           │       └── 标的自身趋势（长/中/短）
           ├── AssetSpecifics（资产类别专属字段）
           │       ├── EquitySpecifics（股票）
           │       ├── OptionSpecifics（期权）
           │       └── CryptoSpecifics（数字货币）
           ├── Candidates[]（候选方案，≥1）
           │       ├── Candidate A（方案名 + 入场/止损/目标/仓位 + 量化指标）
           │       ├── Candidate B
           │       └── Candidate C
           ├── selected_candidate_id（定档，空 = 待评估）
           ├── Legs[]（分批计划，定档后可选细化，入场/出场各 ≤5）
           ├── Timeline[]（决策演进事件流）
           ├── DailyEntries[]（日级观察细化）
           ├── PlanVersions[]（修订历史快照）
           └── PlanReview（平仓后复盘，一对一）

Trade（原始交易）
   ├── plan_id?（关联的 Plan）
   ├── plan_leg_id?（关联的具体分批）
   ├── off_plan_reason?（计划外交易原因，未关联 Plan 时必填）
   └── checklist_compliance?（下单时的合规状态快照）
```

### 2.2 Plan 生命周期状态机

```
   ┌──────────┐
   │  draft   │ ← 用户还在编辑，未提交
   └─────┬────┘
         │ 提交（至少一个 candidate 定档）
         ▼
   ┌──────────┐
   │  active  │ ← 已就绪，等待触发入场
   └─────┬────┘
         │ 任一入场 leg 被关联 Trade（buy/short）
         ▼
   ┌──────────┐
   │triggered │ ← 已开始执行
   └─────┬────┘
         │ 部分出场但未平净（仍有持仓）
         ▼
   ┌──────────┐
   │ partial  │ ← 分批出场中
   └─────┬────┘
         │ 所有 legs 完成 / 净仓位 = 0
         ▼
   ┌──────────┐
   │  closed  │ ← 已平仓，等待复盘
   └──────────┘

   其他终止状态：
   ┌──────────┐   ┌───────────┐
   │ expired  │   │ cancelled │
   └──────────┘   └───────────┘
   （到期未执行）   （主动取消）
```

**状态转换规则：**

- `draft` → `active`：用户提交，必须已定档（selected_candidate_id 非空）
- `active` → `triggered`：任一入场 leg 被一笔实际 Trade 关联且状态变为 filled
- `triggered` → `partial`：任一出场 leg 被 fill 且仓位未清零
- `partial` / `triggered` → `closed`：关联 Trade 的 FIFO 撮合结果使该 symbol 在该 account 下净仓位 = 0，自动转为 closed
- `active` → `expired`：`effective_until < 今日` 且未转 triggered（打开 App 时被动扫描）
- `active` / `draft` → `cancelled`：用户主动取消

### 2.3 数据流

**创建时：**
```
用户 → Plan 创建页（完整 or 快速） → useTradeStore.addPlan()
     ↓
   localStorage（zustand persist）
     ↓
   .catch(console.error) 异步 upsert 到 Supabase trade_plans 表
```

**修订时：**
```
用户点击"修订" → 原 Plan 完整快照写入 plan_versions 表
              → Plan 主体更新
              → Timeline 追加一条 'revised' 事件
```

**关联交易时：**
```
AddTradeModal 打开 → 显示匹配的活跃 Plans
                  → 用户选 Plan + leg，或选"计划外交易 + 原因"
                  → Checklist 检查（中等强约束）
                  → 提交 Trade（带 plan_id / plan_leg_id / checklist_compliance）
                  → 如首次关联，Plan 自动从 active → triggered
                  → Leg status → filled
```

**复盘时：**
```
Plan 进入 closed → Journal 顶部红条"X 个 Plan 待复盘"
               → 24h 未复盘 → Plan 列表卡片显示红点
               → 用户点击进入复盘表单 → 创建 PlanReview
```

---

## 3. 数据模型

### 3.1 TypeScript 类型定义

放置位置：`src/types/plan.ts`（新增文件，独立于 `trade.ts`）。

```typescript
import type { AssetClass } from './trade'

// ═══════════════════════════════════════════════════════
// 主模型：TradePlan
// ═══════════════════════════════════════════════════════

export interface TradePlan {
  id: string
  user_id: string
  account_id: string

  // 基础分类
  asset_class: 'equity' | 'option' | 'crypto'   // v2.4 支持这三类
  symbol: string
  direction: 'long' | 'short'

  // 创建模式
  plan_mode: 'full' | 'quick'

  // 生命周期
  status: PlanStatus
  effective_from: string      // YYYY-MM-DD
  effective_until: string     // 默认 effective_from + 7 天
  closed_at?: string          // ISO 8601
  expired_note?: string       // 到期未执行的补充说明（可选）
  cancelled_reason?: string   // 主动取消的原因

  // 交易目标优先级（曦元模板启发）
  primary_goal: 'avoid_risk' | 'steady_profit' | 'chase_big_gain'

  // 市场环境（前置必填）
  market_context: MarketContext

  // 资产类别专属字段（运行时判别联合）
  asset_specifics: EquitySpecifics | OptionSpecifics | CryptoSpecifics

  // 多方案并列
  candidates: PlanCandidate[]
  selected_candidate_id?: string     // 定档的 candidate
  decision_rationale?: string        // 为什么选这个方案

  // 分批细化（定档后可选）
  legs: PlanLeg[]

  // 置信度
  confidence: PlanConfidence

  // 后手 & 失效
  invalidation_condition?: string    // 纯文字记录，不做机器判断
  fallback_plan?: FallbackPlan

  // 逻辑与风险
  entry_rationale: string            // 入场逻辑，≥20 字
  risk_notes?: string                // 风险点

  // 标签
  strategy_tags: string[]

  // 资金属性（v2.4 B 档：仅标记）
  fund_attribute: FundAttribute

  // 时间线 & 日级细化
  timeline: PlanTimelineEvent[]
  daily_entries: DailyPlanEntry[]

  // 元数据
  created_at: string
  updated_at: string
}

export type PlanStatus =
  | 'draft'
  | 'active'
  | 'triggered'
  | 'partial'
  | 'closed'
  | 'expired'
  | 'cancelled'

// ═══════════════════════════════════════════════════════
// 市场环境（含热点模块）
// ═══════════════════════════════════════════════════════

export interface MarketContext {
  // —— 大盘判断 ——
  market_trend_short: 'bull' | 'bear' | 'range' | 'uncertain'
  market_trend_medium: 'bull' | 'bear' | 'range' | 'uncertain'
  market_note?: string                  // "震荡上行碰前高"

  // —— 热点板块 / 热点个股 / 主叙事（rev.2 新增）——
  theme_narrative?: string              // "AI + 降息预期 + 地缘政治" 等综合叙事
  hot_sectors: HotSectorEntry[]         // 热点板块，≤5
  hot_stocks: HotStockEntry[]           // 热点个股，≤10

  // —— 标的本身 ——
  trend_long: 'up' | 'down' | 'range'
  trend_medium: 'up' | 'down' | 'range'
  trend_short: 'up' | 'down' | 'range'
  key_levels?: string                   // 关键位置评估（"60日线+量价线+61.8"）
  fundamental_note?: string

  // —— 事件风险 ——
  key_macro_events?: string             // "FOMC / CPI / 财报季"
  days_to_next_earnings?: number        // 距离下次财报的天数（equity/option 适用）
}

// 热点板块
export interface HotSectorEntry {
  id: string
  name: string                          // "半导体"、"AI"、"新能源"、"生物医药"
  strength: 'strong' | 'medium' | 'weak'        // 热度强度
  direction: 'bullish' | 'bearish' | 'neutral'  // 方向
  related_symbols?: string[]            // 领涨/相关个股，如 ["NVDA", "AMD"]
  notes?: string                        // "受 AI 芯片需求驱动"
}

// 热点个股
export interface HotStockEntry {
  id: string
  symbol: string
  sector?: string                       // 所属板块（可不填或选 hot_sectors 中的 name）
  theme?: string                        // 为什么热："AI 概念" / "财报超预期" / "政策利好"
  status: 'leading' | 'following' | 'laggard' | 'peripheral'
  // leading    = 领涨龙头
  // following  = 跟随上涨
  // laggard    = 滞涨（板块热但它没跟上）
  // peripheral = 边缘受益
  notes?: string
}

// ═══════════════════════════════════════════════════════
// 资产类别专属字段
// ═══════════════════════════════════════════════════════

export interface EquitySpecifics {
  asset_class: 'equity'
  sector?: string
  uses_margin: boolean                  // 是否使用融资
  pdt_affected?: boolean                // 是否受美股日内交易规则限制
}

export interface OptionSpecifics {
  asset_class: 'option'
  option_type: 'call' | 'put'
  option_strategy: OptionStrategy
  underlying_symbol: string             // 标的代码
  strike_price: number                  // 行权价
  expiration_date: string               // YYYY-MM-DD
  contract_multiplier: number           // 合约乘数，默认 100
  implied_volatility?: number           // 隐含波动率
  moneyness?: 'ITM' | 'ATM' | 'OTM'     // 价内/价平/价外，可自动算
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

export interface CryptoSpecifics {
  asset_class: 'crypto'
  instrument_type: 'spot' | 'perpetual' | 'dated_futures' | 'margin'
  // spot         = 现货
  // perpetual    = 永续合约（无到期日）
  // dated_futures = 交割合约（有到期日）
  // margin       = 现货杠杆

  exchange: string                      // 'Binance' | 'OKX' | 'Bybit' | 'Gate' | 'Coinbase' | 其他
  quote_currency: string                // 'USDT' | 'USDC' | 'USD' | 'BTC' 等

  // 衍生品特有
  leverage?: number                     // 杠杆倍数（perpetual / dated_futures / margin）
  funding_rate_awareness?: string       // "正向费率 0.01%，偏多占优 / 负费率，空头付费"

  // 到期相关（仅 dated_futures）
  expiration_date?: string              // YYYY-MM-DD

  // 可选元信息
  chain?: string                        // 'Ethereum' | 'Solana' | 'BSC'（on-chain/DEX 相关时填）
}

// ═══════════════════════════════════════════════════════
// 候选方案 & 仓位
// ═══════════════════════════════════════════════════════

export interface PlanCandidate {
  id: string
  name: string                          // "正股+止损"、"正股+保险"、"虚值Call方案"
  strategy_type: string                 // 自由文本分类

  // 入场区间
  entry_low: number
  entry_high: number

  // 止损 & 目标
  planned_stop: number
  planned_targets: number[]             // 可多目标

  // 仓位
  position_sizing: PositionSizing

  // 量化指标（前端自动计算，存下来便于复盘比较）
  expected_max_loss: number
  expected_max_loss_pct: number
  expected_return_at_target?: number
  expected_return_pct?: number
  expected_rr_ratio?: number            // 盈亏比

  // 主观评价
  pros?: string
  cons?: string
}

export type PositionSizing =
  | { type: 'absolute'; quantity: number }
  | { type: 'capital_pct'; percentage: number; capital_reference: number }
  | { type: 'risk_pct'; risk_percentage: number; capital_reference: number }

// ═══════════════════════════════════════════════════════
// 分批 legs
// ═══════════════════════════════════════════════════════

export interface PlanLeg {
  id: string
  leg_type: 'entry' | 'exit'
  leg_order: number                     // 从 1 开始，同类型内顺序

  // 价格（支持单点或区间）
  price: number
  price_low?: number
  price_high?: number

  // 分配
  quantity_ratio: number                // 占总仓位比例，0-1

  // 触发描述
  trigger_condition?: string            // "突破 183 后"、"回踩 178 加仓"

  // 执行状态
  status: 'pending' | 'filled' | 'skipped' | 'cancelled'
  filled_trade_ids: string[]
  filled_at?: string
  filled_price?: number                 // 实际成交均价（多笔 Trade 的加权均价）
  skipped_reason?: string
}

// 约束：
// - 入场 legs quantity_ratio 之和 = 1.0（±0.01 容差）
// - 出场 legs quantity_ratio 之和 = 1.0（±0.01 容差）
// - 入场、出场各最多 5 批

// ═══════════════════════════════════════════════════════
// 置信度
// ═══════════════════════════════════════════════════════

export interface PlanConfidence {
  mode: 'subjective'                    // v2.4 只支持主观，v2.5 新增 'checklist'
  subjective_score: number              // 1-5
  subjective_reason: string             // 必填，≥10 字："为什么是 4 分不是 3 分"
  final_score: number                   // 1-100，展示用，subjective_score × 20
}

// ═══════════════════════════════════════════════════════
// 后手
// ═══════════════════════════════════════════════════════

export interface FallbackPlan {
  trigger: string                       // "如果跌破 180"
  action: string                        // "改用正股+Put保险 / 减仓一半 / 暂停观察"
}

// ═══════════════════════════════════════════════════════
// 时间线 & 日级细化
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
  content: string                       // 用户填写或系统生成
  related_version_id?: string           // revised 事件链接到 plan_versions
  related_leg_id?: string               // leg_filled / leg_skipped 事件
  from_status?: PlanStatus
  to_status?: PlanStatus
}

export interface DailyPlanEntry {
  id: string
  date: string                          // YYYY-MM-DD
  pre_market_note?: string              // 盘前对这个 Plan 的具体观察
  intended_action?: string              // "今天只观察，不动" / "回踩 180 入场"
  actual_action?: string                // 收盘后填
  discipline_rating?: number            // 1-5，今日对 Plan 的执行度自评
}

// ═══════════════════════════════════════════════════════
// 版本快照
// ═══════════════════════════════════════════════════════

export interface TradePlanVersion {
  id: string
  plan_id: string
  version_number: number                // 1, 2, 3...
  change_reason: string                 // 必填，"大盘转弱下调目标"
  snapshot: TradePlan                   // 修订前的完整状态
  created_at: string
}

// ═══════════════════════════════════════════════════════
// 复盘
// ═══════════════════════════════════════════════════════

export interface PlanReview {
  id: string
  plan_id: string
  user_id: string

  // 执行偏差（系统自动计算，只读展示）
  execution_deviation: ExecutionDeviation

  // 主观复盘
  decision_quality: number              // 1-5，决策过程质量（和 PnL 解耦）
  logic_validated: 'yes' | 'no' | 'partially'
  biggest_deviation: string             // "这笔交易和计划最大的偏离"

  // 失败归因（双轨）
  failure_categories: FailureCategory[] // 结构化标签（可多选）
  failure_detail: string                // 自由文本，≥50 字

  would_repeat: 'yes' | 'no' | 'with_adjustment'
  adjustment_notes?: string

  lessons: string                       // 核心 lessons
  reviewed_at: string
}

export interface ExecutionDeviation {
  planned_entry_price: number           // 定档 candidate 的中值
  actual_entry_price: number            // 关联 Trade 的加权均价
  entry_price_diff_pct: number

  planned_stop_price: number
  actual_stop_or_exit_price: number
  stop_diff_pct: number

  planned_position_size: number
  actual_position_size: number
  size_diff_pct: number

  planned_r: number                     // 按定档 candidate 计算的 R
  actual_r?: number                     // 关联 ClosedTrade 的实际 R
  r_deviation?: number
}

export type FailureCategory =
  | 'technical_misread'      // 技术面误判
  | 'fundamental_change'     // 基本面变化
  | 'execution_issue'        // 执行问题（滑点、错价、漏单）
  | 'emotion_issue'          // 情绪问题
  | 'external_shock'         // 外部意外（黑天鹅、大盘暴跌）
  | 'plan_quality'           // 计划本身就有问题
  | 'other'

// ═══════════════════════════════════════════════════════
// Trade 表扩展（追加到 src/types/trade.ts 现有 Trade interface）
// ═══════════════════════════════════════════════════════

export interface TradeExtensions {
  plan_id?: string                      // 关联 Plan
  plan_candidate_id?: string            // 关联定档的 candidate
  plan_leg_id?: string                  // 关联具体 leg
  off_plan_reason?: OffPlanReason       // 计划外交易原因
  off_plan_note?: string                // "其他" 时的补充说明
  checklist_compliance?: ChecklistCompliance
}

export type OffPlanReason =
  | 'opportunistic'      // 临场机会（主动、理性）
  | 'fomo'               // FOMO（怕错过）
  | 'revenge'            // 报复性交易
  | 'boredom'            // 无聊/手痒
  | 'herd'               // 跟风（看别人/新闻驱动）
  | 'other'

export interface ChecklistCompliance {
  direction_match: boolean
  price_in_range: boolean
  stop_match: boolean
  size_within_limit: boolean
  all_passed: boolean                   // 四项全 true
  deviations: string[]                  // 未通过项的偏离说明
}

// ═══════════════════════════════════════════════════════
// 资金属性枚举（v2.4 B 档：仅标记，无温度映射）
// ═══════════════════════════════════════════════════════

export type FundAttribute =
  | 'margin'              // 0 融资
  | 'principal'           // 1 本金
  | 'long_term_profit'    // 2 长线利润
  | 'extraordinary_profit'// 3 超常利润
  | 'medium_term_profit'  // 4 中线利润
  | 'short_term_profit'   // 5 短线利润
  | 'passive_profit'      // 6 被动利润
  | 'secondary_profit'    // 7 二级利润
  | 'tertiary_profit'     // 8 三级利润
  | 'split_profit'        // 9 分裂利润

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

// 注：温度映射（CapitalTemperature: cold/warm/hot）推迟到 v2.5 讨论后加入
```

### 3.2 资产类别专属字段对照

| 字段 | equity | option | crypto | 说明 |
|------|:------:|:------:|:------:|------|
| sector | ✅ | — | — | 行业板块（Tech/Finance/...） |
| uses_margin | ✅ | — | — | 是否使用融资 |
| pdt_affected | ✅ | — | — | 美股日内交易规则 |
| option_type | — | ✅ | — | call / put |
| option_strategy | — | ✅ | — | 8 种策略分类 |
| underlying_symbol | — | ✅ | — | 标的代码 |
| strike_price | — | ✅ | — | 行权价 |
| expiration_date | — | ✅ | ⚠ | option 必填；crypto 仅 dated_futures 填 |
| contract_multiplier | — | ✅ | — | 合约乘数（默认 100） |
| implied_volatility | — | ✅ | — | 隐含波动率 |
| moneyness | — | ✅ | — | 自动计算 |
| instrument_type | — | — | ✅ | spot / perpetual / dated_futures / margin |
| exchange | — | — | ✅ | Binance / OKX / Bybit / Gate / Coinbase |
| quote_currency | — | — | ✅ | USDT / USDC / USD / BTC |
| leverage | — | — | ⚠ | 仅衍生品（非 spot）填 |
| funding_rate_awareness | — | — | ⚠ | 仅 perpetual 有意义 |
| chain | — | — | ⚠ | on-chain/DEX 相关时填 |

⚠ 表示条件性必填（由 instrument_type 决定）。

在 Plan 创建 UI 中，选完 asset_class 后动态切换对应字段组；crypto 还需要根据 instrument_type 进一步切换子字段。

---

## 4. Supabase Schema

### 4.1 建表 SQL

放置位置：`supabase/migrations/004_trade_plans.sql`。

```sql
-- ═══════════════════════════════════════════════════════
-- 1. 主表：trade_plans
-- ═══════════════════════════════════════════════════════

create table trade_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  account_id text not null,

  asset_class text not null check (asset_class in ('equity','option','crypto')),
  symbol text not null,
  direction text not null check (direction in ('long','short')),

  plan_mode text not null default 'full' check (plan_mode in ('full','quick')),

  status text not null default 'draft'
    check (status in ('draft','active','triggered','partial','closed','expired','cancelled')),
  effective_from date not null,
  effective_until date not null,
  closed_at timestamptz,
  expired_note text,
  cancelled_reason text,

  primary_goal text not null
    check (primary_goal in ('avoid_risk','steady_profit','chase_big_gain')),

  -- market_context 为 JSONB，包含大盘趋势 + 热点板块 + 热点个股 + 主叙事 + 标的趋势等
  market_context jsonb not null,
  -- asset_specifics 为 JSONB，按 asset_class 取不同结构
  asset_specifics jsonb not null,

  candidates jsonb not null default '[]'::jsonb,
  selected_candidate_id text,
  decision_rationale text,

  legs jsonb not null default '[]'::jsonb,

  confidence jsonb not null,

  invalidation_condition text,
  fallback_plan jsonb,

  entry_rationale text not null,
  risk_notes text,

  strategy_tags text[] default '{}',

  fund_attribute text not null
    check (fund_attribute in (
      'margin','principal','long_term_profit','extraordinary_profit',
      'medium_term_profit','short_term_profit','passive_profit',
      'secondary_profit','tertiary_profit','split_profit'
    )),

  timeline jsonb not null default '[]'::jsonb,
  daily_entries jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_trade_plans_user_status on trade_plans(user_id, status);
create index idx_trade_plans_user_symbol on trade_plans(user_id, symbol);
create index idx_trade_plans_effective on trade_plans(user_id, effective_until)
  where status in ('draft','active','triggered','partial');
create index idx_trade_plans_account on trade_plans(user_id, account_id);

-- RLS
alter table trade_plans enable row level security;
create policy "users manage own plans" on trade_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- updated_at 自动维护触发器
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_trade_plans_updated_at
  before update on trade_plans
  for each row execute function set_updated_at();

-- ═══════════════════════════════════════════════════════
-- 2. 版本快照表
-- ═══════════════════════════════════════════════════════

create table trade_plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references trade_plans on delete cascade,
  version_number int not null,
  change_reason text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (plan_id, version_number)
);

create index idx_plan_versions_plan on trade_plan_versions(plan_id);

alter table trade_plan_versions enable row level security;
create policy "users access own plan versions" on trade_plan_versions
  for all using (
    exists (select 1 from trade_plans p
            where p.id = trade_plan_versions.plan_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from trade_plans p
            where p.id = trade_plan_versions.plan_id and p.user_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════
-- 3. 复盘表
-- ═══════════════════════════════════════════════════════

create table plan_reviews (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null unique references trade_plans on delete cascade,
  user_id uuid not null references auth.users on delete cascade,

  execution_deviation jsonb not null,

  decision_quality int not null check (decision_quality between 1 and 5),
  logic_validated text not null check (logic_validated in ('yes','no','partially')),
  biggest_deviation text not null,

  failure_categories text[] default '{}',
  failure_detail text not null,

  would_repeat text not null check (would_repeat in ('yes','no','with_adjustment')),
  adjustment_notes text,

  lessons text not null,
  reviewed_at timestamptz not null default now()
);

create index idx_plan_reviews_user on plan_reviews(user_id);

alter table plan_reviews enable row level security;
create policy "users access own reviews" on plan_reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════
-- 4. Trade 表扩展
-- ═══════════════════════════════════════════════════════

alter table trades add column plan_id uuid references trade_plans on delete set null;
alter table trades add column plan_candidate_id text;
alter table trades add column plan_leg_id text;
alter table trades add column off_plan_reason text
  check (off_plan_reason in ('opportunistic','fomo','revenge','boredom','herd','other'));
alter table trades add column off_plan_note text;
alter table trades add column checklist_compliance jsonb;

create index idx_trades_plan on trades(plan_id) where plan_id is not null;
```

### 4.2 RLS 说明

所有新表继承 v2.3 的 RLS 约定：所有表通过 `auth.uid() = user_id` 绑定当前用户；`trade_plan_versions` 通过外键间接绑定。

### 4.3 迁移注意事项

- `trades` 表新增 5 个可空字段，对现有数据**无破坏性**影响（所有字段默认 NULL）
- 发布前需在本地环境跑一次 `npm run db:push` 验证迁移
- 迁移后不需要回填任何数据，历史 Trade 自然处于 `plan_id = NULL` 状态（相当于全部是"计划外交易"，但不强制用户回填原因）
- **market_context 和 asset_specifics 字段是 JSONB**，结构变更不需要改表，但前端类型和读写逻辑要同步更新

---

## 5. UI 设计

### 5.1 新增页面：Plans 列表页

**入口**：`useTradeStore.view = 'plans'`，侧边栏导航新增入口。

**布局**：三栏响应式（移动端堆叠）。

```
┌─ Plans 列表页 ──────────────────────────────────────────┐
│ [账户筛选 ▼]  [资产类别 ▼]  [+ 新建 Plan] [+ 快速 Plan] │
│                                                         │
│ ┌── 活跃中 (3) ──┐ ┌── 已完成 (12) ─┐ ┌── 草稿 (1) ──┐│
│ │  Plan 卡片      │ │  Plan 卡片      │ │  Plan 卡片   ││
│ │  Plan 卡片      │ │  Plan 卡片 🔴  │ │               ││
│ │  Plan 卡片      │ │  ...            │ │               ││
│ └─────────────────┘ └─────────────────┘ └───────────────┘│
└─────────────────────────────────────────────────────────┘
```

**Plan 卡片显示**：

- 第一行：标的 + 方向图标 + 状态徽章
- 第二行：置信度 5 星 + 入场区间 + 计划 R
- 第三行：有效期倒计时（active 状态）或已执行天数（triggered+）
- 第四行：已执行 legs / 总 legs 进度条
- 右上角红点：需要复盘的标记（closed 状态 + 无 PlanReview）
- 右上角橙点：已过期未补充原因（expired 状态 + 无 expired_note）

**排序**：

- 活跃中：按 `effective_until` 升序（最快到期的在前）
- 已完成：7 天内待复盘的置顶，其次按 `closed_at` 降序
- 草稿：按 `updated_at` 降序

### 5.2 Plan 创建流程

**入口有两个按钮**：

1. **"+ 新建 Plan"**：完整模式，多步向导，5-8 分钟完成
2. **"+ 快速 Plan"**：盘中模式，单页表单，30-60 秒完成

#### 5.2.1 快速 Plan 模式

**最小字段集**（全部在一个表单页，无向导）：

```
┌─ 快速 Plan ─────────────────────────────┐
│                                         │
│ 标的  [__________]  资产 [equity ▼]     │
│ 方向  ○ Long  ● Short                   │
│                                         │
│ 入场价 [______]  （系统自动扩 ±1% 区间）│
│ 止损价 [______]                         │
│ 目标价 [______]                         │
│                                         │
│ 仓位方式 [数量 ▼]  数量 [______]        │
│                                         │
│ 置信度 ★★★★☆                           │
│ 为什么？[______________________]（≥10字）│
│                                         │
│ 资金属性 [短线利润 ▼]                   │
│ 交易目标 [稳定盈利 ▼]                   │
│                                         │
│ 入场逻辑 [_____________________________] │
│         [_____________________________] │
│         （≥20 字，强制）                 │
│                                         │
│ [取消]            [保存为草稿] [提交]   │
└─────────────────────────────────────────┘
```

**快速模式的隐含行为**：

- 只创建一个 Candidate（自动命名"主方案"），无需用户手动管理多方案
- 无分批 legs（视为单批全入全出）
- `market_context` 用默认值（大盘趋势 `uncertain`、标的趋势 `range`、热点板块/个股为空数组）+ 底部一个可选"一句话市场环境"
- `effective_until` = 创建当天（快速 Plan 是为盘中机会设计的）
- 提交后可进入详情页继续升级为完整 Plan（追加 candidates、细化 legs、填充 market_context、补充热点信息）

#### 5.2.2 完整 Plan 模式

七步向导：

**Step 1 · 基本信息**
- 账户、资产类别（equity / option / crypto）、标的、方向
- 交易目标优先级（3 选 1）
- 资金属性（10 选 1）
- 有效期（默认 7 天，可改）

**Step 2 · 市场环境（大盘 + 热点 + 标的）**

本步骤分三个子区块，顺序对应"由大到小"的决策漏斗：

**2a · 大盘判断**
- 大盘短线趋势（bull / bear / range / uncertain）
- 大盘中线趋势（bull / bear / range / uncertain）
- 大盘描述（可选文本）
- 宏观事件（可选文本，如"FOMC / CPI / 财报季"）

**2b · 热点板块 & 热点个股（rev.2 新增）**

```
┌─ 主叙事（可选）─────────────────────────────┐
│ [AI 算力 + 降息预期 + 地缘政治_____________] │
│ 一句话描述当下市场的核心主题                 │
└─────────────────────────────────────────────┘

┌─ 热点板块 (0/5) ───────────────────────────┐
│ [+ 添加板块]                                │
│                                             │
│ ① 板块名 [半导体____]                       │
│   强度 [strong ▼]  方向 [bullish ▼]         │
│   领涨个股 [NVDA, AMD, AVGO___] （逗号分隔）│
│   备注 [受 AI 芯片需求驱动___]  [删除]     │
│                                             │
│ ② 板块名 [生物医药__]                       │
│   强度 [medium ▼]  方向 [neutral ▼]         │
│   ... [删除]                                │
│                                             │
│ 达到上限 5 个后 "+" 按钮隐藏                 │
└─────────────────────────────────────────────┘

┌─ 热点个股 (0/10) ──────────────────────────┐
│ [+ 添加个股]                                │
│                                             │
│ ① 代码 [NVDA_]                              │
│   所属板块 [半导体 ▼]（选现有 hot_sectors） │
│   主题 [AI 算力 + 财报超预期___]            │
│   状态 [leading ▼]                          │
│   备注 [____]  [删除]                      │
│                                             │
│ ② 代码 [AMD__]                              │
│   状态 [following ▼]                        │
│   ...                                       │
│                                             │
│ 达到上限 10 个后 "+" 按钮隐藏                │
└─────────────────────────────────────────────┘
```

UI 要点：
- 主叙事是单行可选文本（≤100 字建议），放最顶
- 板块的"领涨个股"字段是 tag 形式，逗号或回车分隔
- 个股的"所属板块"是下拉选择，选项来自当前 hot_sectors 列表（如果没有板块则显示"请先添加板块"提示）
- 板块和个股都可以留空（不填也能提交），但建议用户至少填写 1-2 个热点板块以强化大势判断

**2c · 标的自身**
- 长线趋势（up / down / range）
- 中线趋势（up / down / range）
- 短线趋势（up / down / range）
- 关键位置（可选文本）
- 基本面描述（可选）
- 距离下次财报天数（equity / option 显示；crypto 不显示）

**Step 3 · 资产专属字段**

根据 Step 1 的 asset_class 动态渲染：

**equity**：
- sector（可选文本）
- uses_margin（勾选）
- pdt_affected（勾选）

**option**：
- option_type（call / put）
- option_strategy（8 选 1）
- underlying_symbol（必填）
- strike_price、expiration_date（均必填）
- contract_multiplier（默认 100）
- implied_volatility（可选）
- moneyness（自动计算：比较 strike 与 underlying 当前价，展示为只读）

**crypto**：
- instrument_type（spot / perpetual / dated_futures / margin）
- exchange（下拉预设：Binance / OKX / Bybit / Gate / Coinbase / 其他）
- quote_currency（下拉预设：USDT / USDC / USD / BTC / 其他）
- 条件字段（根据 instrument_type 动态显示）：
  - 非 spot → leverage（必填）
  - perpetual → funding_rate_awareness（可选文本）
  - dated_futures → expiration_date（必填）
  - spot / margin / 其他 → 不显示 funding_rate / expiration_date
- chain（可选，用于 on-chain 或 DEX 场景）

**Step 4 · 候选方案**（核心）

```
┌─ 候选方案对比 ────────────────────────────────────────┐
│                                                       │
│               方案 A        方案 B        方案 C      │
│               正股+止损     正股+保险     +方案      │
│              ━━━━━━━━━━━   ━━━━━━━━━━━                │
│ 入场区间     300-305        300-305                    │
│ 止损         285.5          — (保险)                   │
│ 目标         342            342                        │
│ 仓位方式     风险占比 1%    风险占比 1%                │
│ 最大损失     97,500         75,000         (计算中)   │
│ 损失比例     -9.75%         -7.5%                      │
│ 目标收益     185,000        90,000                     │
│ 收益率       18.5%          9.0%                       │
│ 盈亏比       1.90           1.20                       │
│ 优点         [______]       [______]                   │
│ 缺点         [______]       [______]                   │
│                                                       │
│              ○ 定档 A       ● 定档 B                   │
│                                                       │
│ 定档理由（必填）：[________________________________]   │
└───────────────────────────────────────────────────────┘
```

关键交互：

- 每列有"复制为新方案"按钮，便于快速生成变体
- 量化指标（最大损失、收益率、盈亏比）根据输入实时计算
- 只有一列时仍显示对比表（单列），提示"可添加方案进行比较"
- 单选一个方案定档
- 未定档可以"保存为草稿"，定档后才能"提交"

**Step 5 · 置信度 & 后手**
- 置信度 1-5 星 + 理由（必填，≥10 字）
- 失效条件（可选文字）
- 后手方案 trigger + action（可选，二选一：要么不填，要么都填）

**Step 6 · 逻辑 & 风险**
- 入场逻辑（必填，≥20 字）
- 风险点（可选）
- 策略标签（复用现有 strategy_tags）

**Step 7 · 预览 & 提交**
- 整个 Plan 的只读预览
- 提交按钮

### 5.3 Plan 详情页

**路由**：`view = 'planDetail'` + `useTradeStore.currentPlanId`。

**布局**：

```
┌─ Plan 详情 ─────────────────────────────────────────────┐
│ [← 返回]                                                 │
│                                                          │
│ 🟢 Active  AAPL Long  置信度 ★★★★☆                    │
│ 有效期 2026-04-23 ~ 2026-04-30（剩 6 天）               │
│ 交易目标：稳定盈利  资金属性：短线利润                   │
│                      [修订] [取消] [...]                │
│                                                          │
│ ┌─ 市场环境 ─────────────────────────────────┐         │
│ │ [大盘]                                       │         │
│ │ 短线：震荡上行  中线：多头                   │         │
│ │                                              │         │
│ │ [主叙事]                                     │         │
│ │ "AI 算力 + 降息预期"                         │         │
│ │                                              │         │
│ │ [热点板块 2]                                 │         │
│ │ · 半导体 strong↑  NVDA, AMD, AVGO           │         │
│ │ · 生物医药 medium→                           │         │
│ │                                              │         │
│ │ [热点个股 3]                                 │         │
│ │ · NVDA 领涨 AI 算力+财报超预期              │         │
│ │ · AMD  跟随                                  │         │
│ │ · MSFT 边缘 云业务受益                      │         │
│ │                                              │         │
│ │ [标的自身]                                   │         │
│ │ 趋势：长 ↑ 中 ↑ 短 ↓                        │         │
│ │ 关键位：60日线+量价线+61.8                   │         │
│ │ 距离财报：31 天                              │         │
│ └─────────────────────────────────────────────┘         │
│                                                          │
│ ┌─ 定档方案：正股+止损 ──────────────────────┐         │
│ │ 入场 300-305 │ 止损 285.5 │ 目标 342       │         │
│ │ 最大损失 97,500（-9.75%）│ 收益率 18.5%    │         │
│ │ [查看其他候选方案（1）]                      │         │
│ └─────────────────────────────────────────────┘         │
│                                                          │
│ ┌─ 分批计划 ─────────────────────────────────┐         │
│ │ [入场批次]                                    │         │
│ │ ① 首批 302.0 50% 突破确认    [等待]          │         │
│ │ ② 加仓 297.0 30% 回踩        [等待]          │         │
│ │ ③ 加仓 292.0 20% 深度回踩    [等待]          │         │
│ │ [+ 添加入场批次]                              │         │
│ │                                              │         │
│ │ [出场批次]                                    │         │
│ │ ① 减仓 325.0 30% 首目标      [等待]          │         │
│ │ ② 减仓 335.0 40% 次目标      [等待]          │         │
│ │ ③ 追踪 R=3  30% 追踪止损     [等待]          │         │
│ │ [+ 添加出场批次]                              │         │
│ └─────────────────────────────────────────────┘         │
│                                                          │
│ ┌─ 关联交易 (0) ─────────────────────────────┐         │
│ │ （尚未有实际交易）                            │         │
│ └─────────────────────────────────────────────┘         │
│                                                          │
│ ┌─ 决策演进时间线 ──────────────────────────┐         │
│ │ 📅 今天 14:32  创建 Plan                    │         │
│ │ [+ 添加笔记]                                 │         │
│ └─────────────────────────────────────────────┘         │
│                                                          │
│ ┌─ 日级细化 ─────────────────────────────────┐         │
│ │ 📅 04-23 今日盘前： [______]                 │         │
│ │ 📅 04-24 待填写     [填写]                   │         │
│ │ ...                                          │         │
│ └─────────────────────────────────────────────┘         │
│                                                          │
│ ┌─ 其他 ─────────────────────────────────────┐         │
│ │ 入场逻辑、风险点、失效条件、后手、版本历史  │         │
│ └─────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────┘
```

关键交互：

- 顶部状态徽章颜色：draft 灰 / active 绿 / triggered 蓝 / partial 黄 / closed 紫 / expired 橙 / cancelled 灰
- `expired` 状态时顶部显示提示条："该 Plan 已过期未执行 [补充未执行原因]"（可选填）
- `closed` 状态时顶部显示提示条："该 Plan 已平仓 [立即复盘]"（引导但不强制）
- 24h 未复盘的 closed Plan 在提示条上显示红点
- 市场环境区块默认展开，可折叠；热点板块/个股为空时隐藏对应子块

### 5.4 多方案对比 UI

见 Step 4 的示意。关键设计原则：

- **横向表格对比**，每列一个方案，每行一个维度
- 量化指标行（最大损失、收益率、盈亏比）实时计算，绿色表示相对最优，红色表示相对最差
- "定档"用 radio button，单选
- 未定档的候选方案在 Plan 详情页折叠显示，点击展开可查看

### 5.5 分批 Legs UI

```
┌─ 入场批次 ──────────────────────────────────────────┐
│ [+] 添加入场批次                                     │
│                                                      │
│ ① 首批  [302.0] × 50%  [突破确认后____]  [等待]     │
│                                                      │
│ ② 加仓  [297.0] × 30%  [回踩 297 加仓__] [等待]     │
│                                                      │
│ ③ 加仓  [292.0] × 20%  [深度回踩_______] [等待]     │
│                                                      │
│ 入场比例合计：100% ✓                                 │
└──────────────────────────────────────────────────────┘

┌─ 出场批次 ──────────────────────────────────────────┐
│ 类似结构，需保证合计 100%                            │
└──────────────────────────────────────────────────────┘
```

约束与交互：

- 入场 legs 比例合计必须 = 100%（实时校验，错误时显示红字 "当前合计 X%，需调整"）
- 出场 legs 同理
- 入场、出场各最多 5 批，达上限隐藏 "+" 按钮
- 已 `filled` / `skipped` / `cancelled` 的 leg 不可编辑，只能查看
- 非 `pending` 状态的 leg 显示实际成交信息（价格、时间、关联 trade 链接）

### 5.6 下单前 Checklist（强约束核心）

**触发点**：`AddTradeModal` 提交按钮点击前，弹出 Checklist 步骤。

**Step 1 — 关联 Plan**

```
┌─ Step 1 / 2：这笔交易属于哪个 Plan？ ──────────────┐
│                                                    │
│ 自动匹配的活跃 Plans（按 symbol 匹配置顶）：       │
│                                                    │
│ ● AAPL Long · 300-305 · 首批待执行 · 截止 04-30   │
│ ○ AAPL Short · 250-255 · 已过期                    │
│ ○ 其他活跃 Plan（5）...                            │
│                                                    │
│ ── 或者 ──                                         │
│ ○ 计划外交易                                       │
│   原因：[临场机会 ▼]                               │
│   说明：[_____________________]                    │
│                                                    │
│                            [下一步 →]              │
└────────────────────────────────────────────────────┘
```

选中 Plan 后，进一步选择 leg（从 Plan 的 pending legs 里选）。

**Step 2 — Checklist**

```
┌─ Step 2 / 2：合规检查 ─────────────────────────────┐
│                                                    │
│ ☑ 方向与 Plan 一致（long）                         │
│ ☑ 当前价 303.2 在计划入场区间 [300, 305] 内        │
│ ☑ 止损 285.5 与 Plan 计划止损 285.5 一致            │
│ ☐ 仓位 600 股 超过 leg 计划 500 股 (120%)          │
│                                                    │
│ ⚠ 有 1 项偏离：                                    │
│ 偏离说明（必填，≥10 字）：                         │
│ [__________________________________________________]│
│ [__________________________________________________]│
│                                                    │
│                    [← 返回]  [确认提交]            │
└────────────────────────────────────────────────────┘
```

**中等强约束规则**：

- 4 项全 ☑ → 直接可提交
- 任一项 ☐ → "偏离说明"字段必填，≥10 字
- 不阻断提交，但偏离状态写入 Trade 的 `checklist_compliance` 字段
- Trade 列表上偏离执行的记录显示橙色标记

**自动填充**：

- 选中 leg 后，方向、止损价、计划仓位、入场价区间都从 Plan + candidate + leg 自动读取
- 实时对比用户在 `AddTradeModal` 上的实际输入

### 5.7 版本迭代 UI

Plan 详情页右上角 `[修订]` 按钮。点击后弹窗：

```
┌─ 修订 Plan ─────────────────────────────────────────┐
│                                                     │
│ 修订原因（必填）：                                  │
│ [大盘转弱，下调目标价____________________]          │
│                                                     │
│ 允许修订的字段：                                    │
│ ☑ candidates（入场、止损、目标、仓位）              │
│ ☑ legs（分批计划）                                  │
│ ☐ market_context（大盘/热点/标的判断）              │
│ ☐ primary_goal                                      │
│ ☐ confidence                                        │
│ ☐ invalidation_condition / fallback_plan            │
│ ☐ effective_until（延期）                           │
│                                                     │
│ [取消]                         [进入修订模式]       │
└─────────────────────────────────────────────────────┘
```

进入修订模式后，UI 类似创建向导但只显示勾选的字段组。提交时：

1. 写入 `trade_plan_versions` 表（完整快照 + change_reason）
2. 更新主 Plan 字段
3. `timeline` 追加 `revised` 事件

**限制：**

- 已 `closed` / `expired` / `cancelled` 的 Plan 不可修订
- `direction` / `symbol` / `account_id` / `asset_class` 永远不可修订（这些变了就是新 Plan）

### 5.8 时间线

Plan 详情页中段，倒序显示：

- **系统自动事件**（不可编辑）：
  - 创建、状态变更、candidate 定档、leg filled/skipped、修订、取消
- **用户笔记**（可编辑/删除）：
  - 用户点击"+ 添加笔记"，弹输入框，提交后追加到 timeline

每条事件显示：时间戳、图标、内容。修订事件点击可展开查看前后对比。

### 5.9 复盘表单

**入口**：Plan 详情页顶部"立即复盘"按钮（closed 状态且无 PlanReview 时显示），或 Journal 页顶部红条。

**表单结构**：

```
┌─ 复盘 · AAPL Long ──────────────────────────────────┐
│                                                     │
│ ━━━ 执行偏差（自动生成） ━━━━━━━━━━━━━━━━━        │
│                                                     │
│            计划          实际        偏离           │
│ 入场价    302.5         308.74      +2.06%          │
│ 止损价    285.5         288.5       +1.05%          │
│ 仓位      5000 股       5000 股     0%              │
│ R 倍数    2.0           1.65        -17.5%          │
│                                                     │
│ ━━━ 决策质量评估 ━━━━━━━━━━━━━━━━━━━━━━━           │
│                                                     │
│ 决策过程质量 ★★★★☆ (1-5，和盈亏解耦)               │
│                                                     │
│ 核心逻辑是否验证？                                  │
│ ● 完全验证  ○ 未验证  ○ 部分验证                   │
│                                                     │
│ 这笔交易和计划的最大偏离在哪？                      │
│ [__________________________________________________]│
│                                                     │
│ ━━━ 失败归因（双轨） ━━━━━━━━━━━━━━━━━━━━━━        │
│                                                     │
│ 归因标签（可多选）：                                │
│ ☐ 技术面误判  ☐ 基本面变化   ☐ 执行问题            │
│ ☐ 情绪问题    ☐ 外部意外     ☐ 计划本身有问题       │
│ ☐ 其他                                              │
│                                                     │
│ 详细说明（≥50 字）：                                │
│ [__________________________________________________]│
│ [__________________________________________________]│
│ [__________________________________________________]│
│                                                     │
│ ━━━ 重复判断 ━━━━━━━━━━━━━━━━━━━━━━━━━━━           │
│                                                     │
│ 同样的 setup 你还会按这个计划做吗？                 │
│ ● 是  ○ 否  ○ 会但要调整                           │
│                                                     │
│ （选"会但要调整"时）调整内容：                      │
│ [________________________________________________]  │
│                                                     │
│ 核心 lessons：                                      │
│ [________________________________________________]  │
│ [________________________________________________]  │
│                                                     │
│                          [保存为草稿] [提交复盘]    │
└─────────────────────────────────────────────────────┘
```

**提醒机制（B + C 方案）**：

- **B（日终提示）**：Journal 页顶部 sticky 红条，显示"今日有 X 个 Plan 待复盘"（closed_at 是当天且无 review），点击跳转。可关闭红条（仅当天有效）。
- **C（24h 后再提醒）**：Plan 进入 closed 后 24h 仍无 review，Plans 列表和 Journal 顶部均显示红点。

**"执行偏差"的自动计算逻辑**：

```typescript
// 伪代码
const planned = plan.candidates.find(c => c.id === plan.selected_candidate_id)!
const relatedTrades = trades.filter(t => t.plan_id === plan.id)

// 入场：第一笔开仓 Trade 的价格 vs 定档 candidate 的中值
const entryTrades = relatedTrades.filter(t => isEntryDirection(t, plan.direction))
const actualEntry = weightedAvg(entryTrades, 'price', 'quantity')
const plannedEntry = (planned.entry_low + planned.entry_high) / 2

// 止损/出场：最后一笔平仓 Trade 的价格 vs 定档止损价
const exitTrades = relatedTrades.filter(t => isExitDirection(t, plan.direction))
const actualExit = weightedAvg(exitTrades, 'price', 'quantity')
const plannedStop = planned.planned_stop

// R 倍数：通过 closedTrades 查该 plan_id 关联的所有 ClosedTrade，取 actual_r 加权均值
```

---

## 6. 与现有系统的集成

### 6.1 useTradeStore 扩展

新增 state：

```typescript
interface TradeStore {
  // 现有字段 ...

  // v2.4 新增
  plans: TradePlan[]
  planVersions: TradePlanVersion[]
  planReviews: PlanReview[]
  currentPlanId: string | null       // 详情页当前查看的 Plan
}
```

新增 actions：

```typescript
// Plan CRUD
addPlan(plan: Omit<TradePlan, 'id' | 'created_at' | 'updated_at' | 'timeline'>): string
updatePlan(id: string, updates: Partial<TradePlan>): void
deletePlan(id: string): void
cancelPlan(id: string, reason: string): void
expirePlans(): void                 // 被动扫描，app 启动时调用一次

// 版本迭代
revisePlan(id: string, changes: Partial<TradePlan>, changeReason: string): void

// Legs
addLeg(planId: string, leg: Omit<PlanLeg, 'id'>): void
updateLeg(planId: string, legId: string, updates: Partial<PlanLeg>): void
deleteLeg(planId: string, legId: string): void
fillLeg(planId: string, legId: string, tradeId: string): void
skipLeg(planId: string, legId: string, reason: string): void

// Candidates
addCandidate(planId: string, candidate: Omit<PlanCandidate, 'id'>): void
updateCandidate(planId: string, candidateId: string, updates: Partial<PlanCandidate>): void
deleteCandidate(planId: string, candidateId: string): void
selectCandidate(planId: string, candidateId: string, rationale: string): void

// Timeline & Daily
addPlanNote(planId: string, content: string): void
deletePlanNote(planId: string, eventId: string): void
upsertDailyEntry(planId: string, entry: DailyPlanEntry): void

// 热点板块 / 个股（便捷方法，直接操作 market_context）
addHotSector(planId: string, sector: Omit<HotSectorEntry, 'id'>): void
updateHotSector(planId: string, sectorId: string, updates: Partial<HotSectorEntry>): void
removeHotSector(planId: string, sectorId: string): void
addHotStock(planId: string, stock: Omit<HotStockEntry, 'id'>): void
updateHotStock(planId: string, stockId: string, updates: Partial<HotStockEntry>): void
removeHotStock(planId: string, stockId: string): void

// 复盘
reviewPlan(planId: string, review: Omit<PlanReview, 'id' | 'plan_id' | 'user_id' | 'execution_deviation' | 'reviewed_at'>): void
// execution_deviation 由 store 自动计算

// 云同步
syncPlansFromCloud(userId: string): Promise<void>
```

**注意事项（承接 v2.3）**：

- 所有 action 遵循 v2.3 的 `.catch(console.error)` 约定
- Plan 的 id 采用确定性生成规则：`plan_<timestamp>_<random6>`；HotSectorEntry / HotStockEntry 的 id 同理：`hsec_<...>` / `hstk_<...>`
- 在 `derive()` 中新增 `planMetrics` 派生数据：合规率、Plan 命中率、平均执行偏差等（作为 Analytics 数据源）
- 新增 persist partialize：plans / planVersions / planReviews 需持久化；currentPlanId 不持久化

### 6.2 App.tsx 路由和同步

**路由扩展**：

```typescript
const pages = {
  // ...
  plans: <PlansPage />,
  planDetail: <PlanDetailPage />,
}
```

**同步 useEffect**（承接 v2.3 的 `initialized` 守卫）：

```typescript
useEffect(() => {
  if (!initialized) return
  if (user) {
    Promise.all([
      syncFromCloud(user.id),
      syncJournal(user.id),
      syncPlansFromCloud(user.id),    // ← v2.4 新增
    ]).catch(console.error)
  } else {
    clearUserData()
    clearJournal()
    clearPlans()                      // ← v2.4 新增
  }
}, [user?.id, initialized])
```

**启动时被动扫描过期 Plan**：

```typescript
useEffect(() => {
  if (initialized) {
    useTradeStore.getState().expirePlans()  // 把到期的 active 转 expired
  }
}, [initialized])
```

### 6.3 syncTrades.ts 扩展

新增模块或扩展现有文件：`src/lib/syncPlans.ts`（推荐独立，保持职责清晰）。

函数清单：

```typescript
// Plans
loadCloudPlans(userId: string): Promise<TradePlan[]>
upsertPlan(userId: string, plan: TradePlan): Promise<void>
deleteCloudPlan(userId: string, planId: string): Promise<void>

// Versions
loadCloudPlanVersions(userId: string, planIds: string[]): Promise<TradePlanVersion[]>
upsertPlanVersion(userId: string, version: TradePlanVersion): Promise<void>

// Reviews
loadCloudPlanReviews(userId: string): Promise<PlanReview[]>
upsertPlanReview(userId: string, review: PlanReview): Promise<void>
deleteCloudPlanReview(userId: string, reviewId: string): Promise<void>
```

合并策略继承 v2.3：`last-write-wins` by `updated_at`；versions 和 reviews 按 id 做 union（它们是一次性写入，很少更新）。

### 6.4 Analytics 新增"计划执行"标签

在 Analytics 的 5 个现有标签后新增第 6 个：**计划执行**。

子视图：

**① 合规率概览**
- KPI 卡片：合规交易占比、Plan 命中率（active → triggered 比例）、平均决策质量
- 时间序列曲线：按周的合规率变化

**② 合规 vs 偏离对比**

柱状图 / 表格：

|  | 合规交易 | 偏离交易 | 计划外交易 |
|---|---|---|---|
| 笔数 | 23 | 8 | 12 |
| 胜率 | 65% | 45% | 38% |
| 平均 R | 1.2 | 0.7 | 0.4 |
| 总 PnL | +$4,500 | +$800 | -$1,200 |
| 期望值 | +$195 | +$100 | -$100 |

这是最核心的洞察图，直接回答"守纪律到底值不值"。

**③ 置信度 vs 实际 R 散点图**

每个 Plan 一个点，x 轴是 `confidence.final_score`，y 轴是 `actual_r`。用于验证"你的主观信心是 edge 还是 noise"。

**④ 计划外交易原因分布**

饼图 + 每类原因的合计 PnL。用户能直接看到"今年因为 FOMO 亏了多少"。

**⑤ 决策质量 vs PnL 散点**

x 轴是 `decision_quality`，y 轴是 `net_pnl`。用于验证"好决策 ≠ 好结果"—— **最理想的分布是 y 轴正相关但有足够散点**（好决策平均赚，但单笔仍有波动）。

**⑥ 资金属性分层 PnL**（v2.4 B 档也能做）

按 `fund_attribute` 分组统计：每种资金属性的交易笔数、胜率、总 PnL、期望值。虽然没做强约束，但数据本身有价值。

**⑦ 热点板块命中率**（rev.2 新增）

从所有 Plan 的 `market_context.hot_sectors` 聚合：

- 每个板块名出现次数 × 平均该板块下交易的 PnL
- 回答"我识别的哪些热点板块实际赚到钱了"

这是 v2.4 独有、其他工具没有的分析维度——**验证用户对热点的识别能力**。

---

## 7. 关键架构约束（承接 v2.3）

### 7.1 v2.3 遗留约束（继续遵守）

- **Zustand persist 与 auth 初始化顺序**：Plan 相关的清理 side effect 同样要 `if (!initialized) return`
- **异步写入错误必须显式捕获**：禁止 `void upsertPlan(...)`，必须 `.catch(console.error)`
- **ID 必须稳定**：Plan / Candidate / Leg / TimelineEvent / HotSectorEntry / HotStockEntry 的 ID 全部确定性生成
- **单行查询使用 `maybeSingle()`**：查询 PlanReview（一对一 Plan）时遵守

### 7.2 v2.4 新增约束

**A · 候选方案比例强约束**
入场 legs 和出场 legs 的 `quantity_ratio` 合计必须 = 1.0（±0.01 容差）。UI 层校验 + store action 层二次校验。

**B · Plan 与 Trade 的引用完整性**
- 删除 Plan 时，不级联删除关联 Trade（Supabase `on delete set null`），但要在前端 store 同步清空关联 Trade 的 `plan_id` / `plan_leg_id` / `plan_candidate_id` 字段
- Plan 删除前应提示用户"该 Plan 关联了 X 笔交易，删除后交易会变为计划外交易"

**C · Plan 修订的不可变字段**
以下字段一旦创建永不修订：`id`、`account_id`、`asset_class`、`symbol`、`direction`、`created_at`、`plan_mode`。修订这些的诉求应通过"取消旧 Plan + 新建 Plan"实现。

**D · 状态转换的单向性**
除了 `draft ↔ active`（用户手动），其他状态转换都是单向的。特别是 `triggered`、`partial`、`closed` 一旦进入不可回退（避免数据不一致）。

**E · Candidates 数组的最小元素数**
- 创建时 `candidates.length >= 1`
- 只能删除未定档的 candidate；定档的 candidate 不能删除（想换方案要走修订流程）

**F · 复盘表单的执行偏差是只读派生数据**
`execution_deviation` 字段由前端根据关联 Trade 实时计算后提交，不由用户填写。存进数据库是为了快照（后续 Trade 被删除不影响历史复盘）。

**G · 热点数组的数量上限**（rev.2 新增）
- `market_context.hot_sectors.length <= 5`
- `market_context.hot_stocks.length <= 10`
UI 层到达上限时隐藏 "+" 按钮；store action 层二次校验。

**H · Asset Specifics 的判别联合必须一致**（rev.2 新增）
`asset_specifics.asset_class` 必须等于 `trade_plan.asset_class`。前端在 asset_class 切换时要清空 asset_specifics 并重新初始化。

---

## 8. 验收标准

### 8.1 功能验收

- [ ] 快速 Plan 可在 60 秒内完成创建，最少必填字段正确
- [ ] 完整 Plan 七步向导全部跑通，包括市场环境（大盘+热点+标的）、资产专属字段（三类）、多候选方案、定档、置信度、后手、预览
- [ ] 市场环境 Step 2 能正确添加/编辑/删除热点板块（≤5）和热点个股（≤10）
- [ ] 主叙事字段保存和展示正确
- [ ] equity / option / crypto 三类资产的专属字段正确动态切换
- [ ] crypto 的 instrument_type 切换时，leverage / funding_rate / expiration_date 正确条件显示
- [ ] 多方案横向对比表量化指标实时计算正确，定档 radio 正常工作
- [ ] 分批 legs 入场合计 / 出场合计 = 100% 校验，超上限（5）时 "+" 按钮隐藏
- [ ] AddTradeModal 集成 Plan 选择 + Checklist，4 项合规检查逻辑正确
- [ ] 计划外交易原因 6 选 1，"其他" 需要补充文本
- [ ] 版本修订：原快照写入 plan_versions，timeline 追加 revised 事件
- [ ] Timeline 支持用户笔记的增删
- [ ] Daily Entries 按日期排序显示
- [ ] 复盘表单：执行偏差自动计算、决策质量 1-5、失败归因双轨（多选标签 + ≥50 字文本）
- [ ] B 方案提醒（Journal 顶部红条）+ C 方案提醒（24h 后 Plans 列表红点）
- [ ] Plan 过期自动转 expired（打开 App 时扫描）
- [ ] Analytics "计划执行"标签的 7 个子视图都能展示数据

### 8.2 数据同步验收

- [ ] 登录时 `syncPlansFromCloud` 正确合并本地 + 云端，`updated_at` last-write-wins
- [ ] 所有写入操作的 `.catch(console.error)` 都在位
- [ ] 退出登录时 Plans / PlanVersions / PlanReviews 正确清空
- [ ] auth 未就绪时不触发 clearPlans（承接 v2.3 修复）
- [ ] RLS 策略正确，不同用户间数据完全隔离

### 8.3 性能验收

- [ ] Plans 列表（100 个 Plan）首次渲染 < 300ms
- [ ] Plan 详情页打开 < 200ms
- [ ] 合规检查计算 < 50ms（Checklist 步骤不感知延迟）
- [ ] `derive()` 缓存对 plan 数据有效（未变动时不重算）

### 8.4 交互验收

- [ ] 所有强制字段校验有清晰错误提示
- [ ] 字符数限制（入场逻辑 ≥20、失败详情 ≥50、修订理由 ≥1）在前端实时提示
- [ ] 快速 Plan 提交后可一键升级到完整 Plan 继续编辑
- [ ] 移动端（< 768px）响应式正常

---

## 9. 实施分 Phase

### Phase 1 · Plan 核心 MVP（约 1 周）

**范围**：

- 数据模型 + Supabase 迁移 + RLS
- useTradeStore 扩展（addPlan / updatePlan / deletePlan / cancelPlan）
- syncPlans.ts（基础 CRUD 云同步）
- Plans 列表页（不含复盘提醒）
- 完整 Plan 创建向导（含多方案 + 定档 + 市场环境 + 热点模块 + 三类资产专属字段）
- 快速 Plan 单页表单
- Plan 详情页（只读展示 + 取消功能）
- App.tsx 路由接入 + 同步 useEffect 扩展

**不含**：分批 legs、Checklist、版本迭代、时间线笔记、日级细化、复盘、Analytics 新标签。

**验收**：能创建、编辑、取消 Plan；登录同步正常；基础浏览可用；三类资产字段切换正确。

### Phase 2 · 执行闭环（约 1 周）

**范围**：

- 分批 legs UI + 校验 + CRUD
- AddTradeModal 集成：Plan/leg 选择 + Checklist 双步骤
- Trade 表扩展字段的读写
- 计划外交易原因分类
- 状态机完整实现（active → triggered → partial → closed 自动转换）
- Plan 过期扫描
- 版本迭代（修订流程 + plan_versions 表写入）
- Timeline 自动事件 + 用户笔记增删
- Daily Entries

**验收**：从 Plan → 实际 Trade 的完整执行链路通畅；合规/偏离正确记录；修订历史可追溯。

### Phase 3 · 复盘与分析（约 3-5 天）

**范围**：

- 复盘表单 + execution_deviation 自动计算
- 复盘提醒 B（Journal 红条）+ C（24h 后红点）
- Analytics "计划执行" 标签 7 个子视图（含热点板块命中率）
- Plans 列表红点标记
- expired 状态的 "补充未执行原因" 入口

**验收**：Plan closed 后能走完复盘流程；Analytics 数据准确；提醒机制不打扰但有效。

### Phase 4 · 打磨与细节（约 2-3 天）

**范围**：

- 移动端响应式打磨
- 错误边界和空态设计
- 文档更新（README + 项目说明书升级到 v2.4）
- 端到端验收测试

---

## 10. v2.5 规划预告

v2.4 上线后，v2.5 将重点深化**资金架构与策略体系**，预计包含：

- **资金属性温度映射（CapitalTemperature）**：cold / warm / hot 三级温度分类，基于资金属性衍生，用于风险等级展示
- **Playbook（策略模板）**：用户可沉淀自己的交易策略，每个策略包含专属字段、入场条件清单、允许的资金属性
- **置信度 checklist 模式**：基于 Playbook 的条件清单自动计算客观置信度，与主观分结合
- **Account 风险升级**：Account 增加 `risk_tier`、`allowed_fund_attributes`、`max_leverage` 字段
- **资金属性强约束（C 档）**：Plan 创建时资金属性 × 策略类型匹配检查，不匹配触发"中等强约束"警告
- **资金分层视角 Analytics**：资金属性分层 PnL、利润流转桑基图、资金温度风险暴露
- **阶段目标体系**：第一到第五阶段的成长里程碑页面（可选）
- **Plan 导出 PDF / 图片**：便于分享和打印存档

v2.6 及以后（排期未定）可能包括：资金池余额自动追踪（D 档）、配对交易 Plan、etf/cfd/futures 专属字段、AI 辅助复盘等。

---

## 11. 开发者检查清单

开发启动前：

- [ ] 已阅读 v2.3 项目说明书的 §8 "关键架构约束（Do's & Don'ts）"
- [ ] 了解 Zustand persist 和 auth 初始化的顺序陷阱
- [ ] 了解 `.catch(console.error)` 错误处理约定
- [ ] 确认本地开发环境 Supabase CLI 可用

Phase 1 开始前：

- [ ] 在 Supabase 本地实例跑一次 `004_trade_plans.sql`，确认建表成功、RLS 生效
- [ ] 创建 `src/types/plan.ts`，粘贴类型定义，`npm run typecheck` 通过

Phase 2 开始前：

- [ ] Phase 1 已通过 UAT，Plan 基础 CRUD 稳定
- [ ] 确认 `AddTradeModal` 的重构方案（是在现有组件上扩展还是新开一个 `AddTradeModalV2`）

Phase 3 开始前：

- [ ] Phase 2 的状态机转换经过至少一周自测验证
- [ ] Analytics 现有代码的数据源（derive 缓存）熟悉度足够

Phase 4 结束前：

- [ ] 项目说明书升级到 v2.4，补充新模块文档
- [ ] v2.4 版本历史追加一条，描述关键变更
- [ ] 在开发环境 + Cloudflare Pages 预览环境双验证

---

## 附录 A · 关键流程时序图

### A.1 创建 Plan → 关联 Trade → 自动转 triggered

```
User                 UI                    Store                 Supabase
 │                    │                     │                     │
 ├─ 创建 Plan ───────▶│                     │                     │
 │                    ├─ addPlan() ────────▶│                     │
 │                    │                     ├─ upsertPlan() ─────▶│
 │                    │                     │  .catch(console.err)│
 │◀─ Plan active ─────┤                     │                     │
 │                    │                     │                     │
 ├─ 录入 Trade ──────▶│                     │                     │
 │                    ├─ 显示匹配 Plans ────│                     │
 │◀ 选 Plan + leg ────┤                     │                     │
 │                    ├─ 显示 Checklist ────│                     │
 │◀ 通过 / 偏离说明 ──┤                     │                     │
 │                    ├─ addTrade() ───────▶│                     │
 │                    │                     ├─ fillLeg() ─────────│
 │                    │                     ├─ 自动状态转换 ──────│
 │                    │                     │  active→triggered   │
 │                    │                     ├─ upsertTrade() ────▶│
 │                    │                     ├─ upsertPlan() ─────▶│
 │◀─ Plan triggered ──┤                     │                     │
```

### A.2 修订 Plan

```
User              UI                  Store                 Supabase
 │                 │                   │                     │
 ├─ 点击修订 ─────▶│                   │                     │
 │◀ 填修订理由 ────┤                   │                     │
 │                 ├─ revisePlan() ───▶│                     │
 │                 │                   ├─ 原状态写入快照 ────│
 │                 │                   ├─ upsertPlanVersion─▶│
 │                 │                   ├─ 更新主 Plan ───────│
 │                 │                   ├─ timeline 追加 ─────│
 │                 │                   ├─ upsertPlan() ─────▶│
 │◀─ 修订完成 ─────┤                   │                     │
```

### A.3 Plan 平仓 → 复盘提醒

```
User             UI                  Store                 Supabase
 │                │                   │                     │
 ├─ 最后一笔平仓 ▶│                   │                     │
 │                ├─ addTrade() ─────▶│                     │
 │                │                   ├─ fillLeg()          │
 │                │                   ├─ 检测净仓位 = 0     │
 │                │                   ├─ status → closed    │
 │                │                   ├─ closed_at = now()  │
 │                │                   ├─ upsertPlan() ─────▶│
 │                │                   │                     │
 │ ⏰ 进入 Journal │                   │                     │
 │                ├─ 读 plans 找待复盘│                     │
 │                │  (closed 无 review)                     │
 │◀ 红条提示 ─────┤                   │                     │
 │                │                   │                     │
 ├─ 24h 后 ──────▶│                   │                     │
 │                ├─ Plans 列表红点 ──│                     │
```

---

## 附录 B · 开发 FAQ

**Q1：快速 Plan 和完整 Plan 在数据库是同一张表吗？**
A：是。`plan_mode` 字段区分。快速 Plan 的许多字段（market_context 的热点数组、多 candidates）使用简化默认值，允许后续升级为完整模式（只是补齐字段，不改表）。

**Q2：一笔 Trade 能关联多个 Plan 吗？**
A：不能，`plan_id` 是单值。如果一个 Trade 在概念上同时满足两个 Plan（少见），用户需要选择最主要的一个。

**Q3：Plan 删除 vs 取消的区别？**
A：取消（cancelled）保留 Plan 记录用于统计和复盘；删除（delete）是硬删除，不保留。推荐 UI 只显示"取消"按钮，"删除"放在高级菜单里警示后使用。

**Q4：Plan 关联的 Trade 被删除怎么办？**
A：Trade 删除时，前端 store 不需要同步调整 Plan（leg 的 filled_trade_ids 可以保留失效引用，展示时做过滤）。但 Plan 的状态机要重新评估（可能从 closed 回到 triggered/partial）—— Phase 2 实现时要小心这个边界。推荐策略：Trade 软删除后，Plan 状态不回退，但提示用户 "该 Plan 关联的 X 笔交易已删除，建议修订或取消"。

**Q5：为什么 candidates 存为 JSONB 而不是独立表？**
A：Candidates 生命周期和 Plan 完全绑定，不会跨 Plan 引用，不需要独立查询。JSONB 简化了 ORM 和同步逻辑。Legs、Timeline、DailyEntries 同理。仅 plan_versions 和 plan_reviews 独立成表（因为一对多且查询模式不同）。

**Q6：Plan 的资金属性（fund_attribute）v2.4 只做标记，怎么防止用户不填？**
A：在 Plan 创建 UI 中设为必填字段（下拉选择默认未选），提交时前端校验。Supabase 也用 NOT NULL + CHECK 约束兜底。

**Q7：多账户场景下，Plan 列表默认显示哪个账户？**
A：跟随 `selectedAccount`。筛选器提供 "全部" / "当前账户" / "指定账户"。和现有 Trades / Positions 页面保持一致。

**Q8：热点板块和热点个股的关系如何处理？**（rev.2 新增）
A：设计上松耦合。`hot_stocks[].sector` 字段是可选文本，可以是 `hot_sectors[].name` 之一（UI 做下拉联动），也可以是用户自由填写的其他板块名。存储上不做外键约束，保留数据灵活性。

**Q9：创建 Plan 时必须填热点板块/个股吗？**（rev.2 新增）
A：不强制。`hot_sectors` 和 `hot_stocks` 默认为空数组。但 UI 会在 Step 2 引导用户至少填写 1 个热点板块，以强化"由大到小"的决策漏斗思维。快速 Plan 模式允许全部留空。

**Q10：crypto 的 instrument_type 选 spot 后还需要填 leverage 吗？**（rev.2 新增）
A：不需要。Spot 模式下 leverage / funding_rate_awareness / expiration_date 都不显示、不填。前端切换时要清空这些字段以免残留脏数据。

---

## 附录 C · 与 Claude Code 协作指南

本 Spec 为配合 Claude Code / Cursor 等 AI 辅助编程工具使用而设计。建议的协作流程如下。

### C.1 首次启动：Spec 加载 Prompt

将本 Spec 整个文件丢给 Claude Code 作为上下文，然后使用以下启动 prompt：

```
你将基于 TradeInsight v2.4 Spec (rev.2) 为我实现交易计划功能。

请先完成以下任务：
1. 读完整份 Spec，特别关注 §2 数据流、§3 类型定义、§7 架构约束
2. 读项目现有代码（特别是 src/store/useTradeStore.ts、src/App.tsx、src/lib/syncTrades.ts）
3. 给我一个 Phase 1 的详细任务拆解，格式是有序 todo list（10-15 条）
4. 先不要开始写代码，等我确认任务拆解后再开始

注意：
- 严格遵守 v2.3 已有的架构约束（Zustand persist + auth initialized 守卫、.catch(console.error)）
- 所有新增的 TypeScript 类型放到 src/types/plan.ts
- 所有云同步函数放到 src/lib/syncPlans.ts（新文件）
- 优先保证 typecheck 通过，再考虑功能完整性
```

### C.2 逐 Phase 执行

每个 Phase 开始前用一条单独的 prompt：

```
现在开始 Phase [1/2/3/4]。
请按照 Spec §9 的 Phase [N] 范围，列出这一阶段要完成的所有文件改动（新建/修改），
然后我们逐文件推进。每完成一个文件要让我 review 后再进下一个。
```

### C.3 验收触发 Prompt

Phase 结束前：

```
Phase [N] 的代码已基本完成。
请对照 Spec §8 "验收标准" 的对应项，逐条检查是否达标。
对于未达标的项，给出原因和补救方案。
然后运行 npm run typecheck + npm run build 确认无错误。
```

### C.4 给 Claude Code 的额外约束

建议把以下内容作为 system prompt 追加给 Claude Code：

```
在本项目中，你必须：

1. 绝不在未询问的情况下修改 v2.3 已有的核心代码结构（useTradeStore 的 derive 缓存、syncTrades 的错误处理、App.tsx 的 initialized 守卫）
2. 所有新增的 Zustand 状态变更必须触发 persist 同步
3. 所有新增的云同步写入必须用 .catch(console.error)，不能用 void
4. 所有 ID 生成使用确定性规则（时间戳 + 短随机串），不要用 crypto.randomUUID 或 Math.random 的不稳定组合
5. 使用 maybeSingle() 而不是 single() 进行可能为空的单行查询
6. 任何涉及 Zustand persist 的清理副作用，都必须先判断 useAuthStore.initialized === true

以上是承接 v2.3 的硬性约束，不得违反。
```

### C.5 与 Spec 的偏差处理

如果 Claude Code 在实施中发现 Spec 的某处有歧义或不合理，**不要让它自行决定**。让它：

1. 明确指出是哪一节的哪一点
2. 提出 2-3 个可选方案及各自的取舍
3. 等 Howell 做决定后再继续

这是防止 AI 工具在大型 Spec 下"合理化"偏离的重要机制。

### C.6 文档回写

每个 Phase 完成后，让 Claude Code 更新项目根目录的 `项目说明书.md`（v2.3 基础上追加 v2.4 内容），保持文档和代码同步。v2.4 完成时，版本历史追加一条 v2.4 条目，描述关键变更。

---

*文档结束。本 spec 作为 TradeInsight v2.4 开发的 single source of truth。后续如有设计变更，请更新本文档并在 §"Spec 更新记录" 中追加新修订条目。*
