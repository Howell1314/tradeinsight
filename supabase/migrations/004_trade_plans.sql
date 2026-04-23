-- ============================================================
-- TradeInsight v2.4 — Trade Plan 功能
-- 新增 trade_plans / trade_plan_versions / plan_reviews 三张表
-- 并扩展 trades 表关联 Plan 的字段
-- ============================================================
-- Phase 1（当前）实际使用：trade_plans + trades 扩展
-- Phase 2 启用：trade_plan_versions（版本修订）+ plan_reviews（复盘）
-- 一次性建表避免后续再改 schema
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. 主表：trade_plans
-- ─────────────────────────────────────────────

create table if not exists public.trade_plans (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users on delete cascade,
  account_id                text not null,

  asset_class               text not null
                            check (asset_class in ('equity','option','crypto')),
  symbol                    text not null,
  direction                 text not null check (direction in ('long','short')),

  plan_mode                 text not null default 'full'
                            check (plan_mode in ('full','quick')),

  status                    text not null default 'draft'
                            check (status in ('draft','active','triggered','partial','closed','expired','cancelled')),
  effective_from            date not null,
  effective_until           date not null,
  closed_at                 timestamptz,
  expired_note              text,
  cancelled_reason          text,

  primary_goal              text not null
                            check (primary_goal in ('avoid_risk','steady_profit','chase_big_gain')),

  market_context            jsonb not null,
  asset_specifics           jsonb not null,

  candidates                jsonb not null default '[]'::jsonb,
  selected_candidate_id     text,
  decision_rationale        text,

  legs                      jsonb not null default '[]'::jsonb,

  confidence                jsonb not null,

  invalidation_condition    text,
  fallback_plan             jsonb,

  entry_rationale           text not null,
  risk_notes                text,

  strategy_tags             text[] default '{}',

  fund_attribute            text not null
                            check (fund_attribute in (
                              'margin','principal','long_term_profit','extraordinary_profit',
                              'medium_term_profit','short_term_profit','passive_profit',
                              'secondary_profit','tertiary_profit','split_profit'
                            )),

  timeline                  jsonb not null default '[]'::jsonb,
  daily_entries             jsonb not null default '[]'::jsonb,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists idx_trade_plans_user_status
  on public.trade_plans(user_id, status);
create index if not exists idx_trade_plans_user_symbol
  on public.trade_plans(user_id, symbol);
create index if not exists idx_trade_plans_effective
  on public.trade_plans(user_id, effective_until)
  where status in ('draft','active','triggered','partial');
create index if not exists idx_trade_plans_account
  on public.trade_plans(user_id, account_id);

alter table public.trade_plans enable row level security;

drop policy if exists "users manage own plans" on public.trade_plans;
create policy "users manage own plans" on public.trade_plans
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_trade_plans_updated_at on public.trade_plans;
create trigger trg_trade_plans_updated_at
  before update on public.trade_plans
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────
-- 2. 版本快照表（Phase 2 启用）
-- ─────────────────────────────────────────────

create table if not exists public.trade_plan_versions (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references public.trade_plans on delete cascade,
  version_number int  not null,
  change_reason  text not null,
  snapshot       jsonb not null,
  created_at     timestamptz not null default now(),
  unique (plan_id, version_number)
);

create index if not exists idx_plan_versions_plan
  on public.trade_plan_versions(plan_id);

alter table public.trade_plan_versions enable row level security;

drop policy if exists "users access own plan versions" on public.trade_plan_versions;
create policy "users access own plan versions" on public.trade_plan_versions
  for all using (
    exists (select 1 from public.trade_plans p
            where p.id = trade_plan_versions.plan_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.trade_plans p
            where p.id = trade_plan_versions.plan_id and p.user_id = auth.uid())
  );

-- ─────────────────────────────────────────────
-- 3. 复盘表（Phase 2 启用）
-- ─────────────────────────────────────────────

create table if not exists public.plan_reviews (
  id                    uuid primary key default gen_random_uuid(),
  plan_id               uuid not null unique references public.trade_plans on delete cascade,
  user_id               uuid not null references auth.users on delete cascade,

  execution_deviation   jsonb not null,

  decision_quality      int  not null check (decision_quality between 1 and 5),
  logic_validated       text not null check (logic_validated in ('yes','no','partially')),
  biggest_deviation     text not null,

  failure_categories    text[] default '{}',
  failure_detail        text not null,

  would_repeat          text not null check (would_repeat in ('yes','no','with_adjustment')),
  adjustment_notes      text,

  lessons               text not null,
  reviewed_at           timestamptz not null default now()
);

create index if not exists idx_plan_reviews_user
  on public.plan_reviews(user_id);

alter table public.plan_reviews enable row level security;

drop policy if exists "users access own reviews" on public.plan_reviews;
create policy "users access own reviews" on public.plan_reviews
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- 4. trades 表扩展（Phase 1 启用 plan_id / plan_candidate_id / off_plan_reason / off_plan_note）
--    plan_leg_id 和 checklist_compliance 在 Phase 2 启用，但字段一起加
-- ─────────────────────────────────────────────

alter table public.trades
  add column if not exists plan_id              uuid references public.trade_plans on delete set null,
  add column if not exists plan_candidate_id    text,
  add column if not exists plan_leg_id          text,
  add column if not exists off_plan_reason      text
    check (off_plan_reason in ('opportunistic','fomo','revenge','boredom','herd','other')),
  add column if not exists off_plan_note        text,
  add column if not exists checklist_compliance jsonb;

create index if not exists idx_trades_plan
  on public.trades(plan_id) where plan_id is not null;
