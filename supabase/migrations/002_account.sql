-- ============================================================
-- TradeInsight P1 — 新增两张表
-- 在 Supabase Dashboard > SQL Editor 中执行
-- ============================================================

-- 1. 出入金记录表
create table if not exists account_transactions (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  account_id  text not null,
  type        text not null check (type in ('deposit', 'withdrawal')),
  amount      numeric not null,
  date        text not null,
  note        text not null default '',
  created_at  timestamptz not null default now()
);

-- 按用户查询索引
create index if not exists idx_account_transactions_user
  on account_transactions(user_id);

-- RLS
alter table account_transactions enable row level security;

create policy "Users manage own transactions"
  on account_transactions
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================

-- 2. 用户设置表（存放风控规则等 JSON 配置，每人一行）
create table if not exists user_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  risk_rules  jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

-- RLS
alter table user_settings enable row level security;

create policy "Users manage own settings"
  on user_settings
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
