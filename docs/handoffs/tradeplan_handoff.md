# TradePlan 功能交接文档（v2.4 Phase 1.1，2026-04-24）

> 用途：向没有代码访问权限、只看过项目说明书的协作者交接 TradePlan 模块当前状态，
> 作为"5 层机会识别卡"融合讨论的事实基线。

## 1. 设计意图（先讲这个再看字段）

Plan 功能的核心目标是**把"下单前的决策过程"沉淀为可审查的对象**，避免被盘面牵着走。Plan 不是订单，它是"我为什么打算交易"的快照 + 多候选方案 + 置信度 + 后手方案。Trade（实盘记录）未来会挂靠到 Plan 上做偏离度分析，但 Phase 1 还没接通。

两种录入模式：**完整计划**（7 步向导，盘前用）、**快速计划**（单页表单，盘中用）。

## 2. TradePlan 主字段（`src/types/plan.ts`）

| 字段 | 类型 | 设计意图 |
|---|---|---|
| `id / user_id / account_id` | string | 账户多对一 |
| `asset_class` | `'equity'\|'option'\|'crypto'` | **只支持这三类**（trade 支持更多，Plan 有意缩窄） |
| `symbol / direction` | string / `'long'\|'short'` | — |
| `plan_mode` | `'full'\|'quick'` | 区分录入路径，便于后续差异化展示 |
| `status` | 8 种见下 | 生命周期核心 |
| `effective_from / effective_until` | date | 计划失效窗口，到期自动 → expired |
| `primary_goal` | `avoid_risk\|steady_profit\|chase_big_gain` | 交易目的，约束后续行为评判 |
| `market_context` | JSONB | 大盘趋势、**热点板块/个股**、标的趋势、关键位、宏观事件、距财报 |
| `asset_specifics` | 联合类型 | equity/option/crypto 三套专属字段（strike、IV、杠杆、资金费率等） |
| `candidates[]` | `PlanCandidate[]` | **多候选方案**：每个含入场区间、止损、多级目标、仓位计算（absolute/capital_pct/risk_pct）、预期 R:R、优缺点 |
| `selected_candidate_id` | string? | 定档方案 |
| `decision_rationale` | text? | 为什么选这个候选 |
| `legs[]` | `PlanLeg[]` | **Phase 2**：分批入场/出场（字段已预留，UI 未做） |
| `confidence` | `{subjective_score 1-5, reason, final_score}` | 主观置信度（客观置信度字段预留） |
| `invalidation_condition / fallback_plan` | text / `{trigger, action}` | 失效条件 + 后手 |
| `entry_rationale / risk_notes` | text | 入场逻辑（必填）+ 风险点 |
| `strategy_tags[]` | text[] | 与 Trade 策略标签打通 |
| `fund_attribute` | 10 种 | 资金属性（本金/各级利润等），独立于主分析维度 |
| `timeline[] / daily_entries[]` | JSONB | **Phase 2**：时间线事件、每日备注 |

## 3. 生命周期

```
[Wizard/QuickForm] ──addPlan──▶ active
                                  │
                                  ├─ effective_until 到期 ─── expirePlans() ──▶ expired
                                  ├─ 用户取消 ─── cancelPlan(reason) ──▶ cancelled
                                  ├─ 用户删除 ─── deletePlan() ──▶ deleted (软删)
                                  │                                    ├─ reactivatePlan ──▶ active
                                  │                                    └─ permanentDeletePlan ──▶ 真删
                                  └─ [Phase 2] 关联 Trade ─── triggered → partial → closed
```

**关键事实**：
- 当前向导/快速表单**都把 status 直接创建为 `'active'`**（不是 draft）。`draft` 状态目前**只**通过 `duplicatePlan` 产生。
- `triggered / partial / closed` 枚举已存在但**没有代码会写入**——要等 Phase 2 的 Plan-Trade 关联才会激活。
- `expirePlans()` 在 `App.tsx` 启动时扫描一次。
- 软删 `deleted` 是 2026-04-24 新加的（migration 005 放宽 CHECK 约束）。

## 4. Plan-Trade 关联（**关键**：DB 已就位，UI 为 0）

`trades` 表已扩展 6 列：`plan_id` / `plan_candidate_id` / `plan_leg_id` / `off_plan_reason` / `off_plan_note` / `checklist_compliance`。

**基数关系**（设计上）：一个 Plan → N 个 Trade。关联方式：

- Trade 持 `plan_id`（外键 → `trade_plans.id`，`on delete set null`）
- 选中某候选方案时存 `plan_candidate_id`（text，指向 `candidates[].id`）
- 多腿时存 `plan_leg_id`（text，指向 `legs[].id`）
- 未挂靠计划的 Trade 强制填 `off_plan_reason`（opportunistic/fomo/revenge/boredom/herd/other）

**多腿场景**：一个 leg 可被多个 Trade 填充（`PlanLeg.filled_trade_ids[]`），leg 本身记 `status: pending|filled|skipped|cancelled`。所有 leg 的 `quantity_ratio` 必须求和 = 1.0（validatePlan 已预留校验）。

## 5. 已实现 vs Phase 2 Backlog

**Phase 1.1 已完成**：
- ✅ 三张表 + trades 6 列扩展（migration 004/005，**手动 Dashboard 执行**，未登记 schema_migrations）
- ✅ 7 步完整向导 + 快速表单
- ✅ 列表页（按状态分组 + 已删除折叠）+ 详情页（只读）
- ✅ 取消 / 软删 / 彻底删 / 重激活 / 复用（→ draft）
- ✅ 云同步 `syncPlansFromCloud`（last-write-wins）+ 到期扫描

**Phase 2 待做**（按优先级）：
1. **Plan-Trade 关联 UI**（最高优先；`AddTradeModal` 加下拉，未挂靠强制填 off_plan_reason）
2. Legs 多腿执行 UI
3. Checklist 合规（`trades.checklist_compliance` JSONB）
4. 版本修订（`trade_plan_versions` 表，每次编辑需填 change_reason）
5. Timeline 事件 & 每日备注
6. 复盘（`plan_reviews` 表，plan_id 唯一）
7. Analytics 新增 Plan tab（命中率、off-plan 原因分布）

## 6. DB Schema 要点

**`trade_plans`**：大量 JSONB（market_context / asset_specifics / candidates / legs / confidence / fallback_plan / timeline / daily_entries），加 8 种 status CHECK、RLS `auth.uid() = user_id`、自动 `updated_at` 触发器。索引按 (user_id, status) / (user_id, symbol) / (user_id, account_id) / 部分索引(活跃 plan 的 effective_until)。

**`trade_plan_versions`**：`(plan_id, version_number)` 唯一；`snapshot` 存完整 JSONB；RLS 走 plan 的 user_id。Phase 2 启用。

**`plan_reviews`**：`plan_id` **唯一**（一个 Plan 一次复盘）；含 decision_quality 1-5、logic_validated、failure_categories、would_repeat 等结构化评价字段。Phase 2 启用。

## 7. UI 当前交互

**PlansPage（`/plans`）**：
- 顶栏：账户筛选 + 「新建计划」+「快速计划」
- 4 个分组卡片：**活跃中** (active/triggered/partial)、**草稿** (draft)、**已完成** (closed/expired/cancelled)、**已删除**（默认折叠）
- 卡片显示：symbol、方向、状态徽章、置信度星级、入场区间、止损、目标标签、资金属性、剩余天数

**PlanDetailPage（只读）**：
- 顶部：symbol + 方向 + 状态 + 按状态分化的按钮：
  - active/draft → 「取消计划」+「删除」
  - cancelled/expired/closed → 「复用计划」+「删除」
  - deleted → 「重新激活」+「复用」+「彻底删除」
- 内容区按 Card 分块：基础信息 / 市场环境（含热点） / 资产专属 / 定档方案 / 其他候选 / 入场逻辑 / 其他（定档理由、风险、失效条件、后手）
- **不支持编辑**——要改得靠 duplicate → 改草稿（Phase 2 才会加真正的修订）

---

## 给"5 层机会识别卡"融合的提示

从上面看，融合的最自然切入点有三个候选：
1. **前置到 MarketContext** — 把识别卡作为"热点/主叙事"的结构化子模块，Plan 创建时引用
2. **候选方案（Candidate）** — 把每一层识别作为单独 candidate 或 candidate 的元数据
3. **新增并列字段** — 在 TradePlan 上加 `opportunity_card` JSONB，独立于现有决策字段

字段重叠区要特别注意：`market_context.theme_narrative / hot_sectors / hot_stocks / trend_*`、`confidence`、`primary_goal`、`strategy_tags`——这些都可能与"5 层"概念冲突或重复。设计时先确认 5 层各是什么、哪层对应哪个现有字段。
