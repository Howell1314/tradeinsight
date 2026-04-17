-- ============================================================
-- tradeinsight 初始 schema
-- ============================================================
-- 设计目标：
-- 1. ohlc_bars 做"服务端 cache"，避免前端每次都打外部 API
-- 2. backtest_trades 提供 realtime 订阅（前端用 postgres_changes）
-- 3. RLS 默认关门，后台 Edge Function 用 service_role 绕过
-- 注意：backtest_trades 是图表/回测层的交易 marker，与
--       trades 表（真实成交日志）完全独立，不同 schema。
-- ============================================================

create extension if not exists "pgcrypto";

-- -------- symbols --------
create table if not exists public.symbols (
  code        text primary key,
  name        text        not null,
  exchange    text        not null,
  asset_type  text        not null check (asset_type in ('crypto','stock','forex','futures')),
  tick_size   numeric     not null default 0.01,
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);

-- -------- ohlc_bars (cache) --------
create table if not exists public.ohlc_bars (
  symbol_code text       not null references public.symbols(code) on delete cascade,
  timeframe   text       not null,
  ts          bigint     not null,              -- Unix seconds
  o           numeric    not null,
  h           numeric    not null,
  l           numeric    not null,
  c           numeric    not null,
  v           numeric    not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (symbol_code, timeframe, ts)
);

create index if not exists idx_ohlc_sym_tf_ts_desc
  on public.ohlc_bars (symbol_code, timeframe, ts desc);

-- -------- strategies --------
create table if not exists public.strategies (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  params      jsonb not null default '{}'::jsonb,
  definition  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_strategies_user on public.strategies(user_id);

-- -------- backtest_runs --------
create table if not exists public.backtest_runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  strategy_id   uuid references public.strategies(id) on delete cascade,
  symbol_code   text references public.symbols(code),
  timeframe     text not null,
  start_ts      bigint not null,
  end_ts        bigint not null,
  status        text   not null default 'queued' check (status in ('queued','running','done','failed')),
  metrics       jsonb,
  equity_curve  jsonb,
  error         text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index if not exists idx_backtest_user on public.backtest_runs(user_id, created_at desc);

-- -------- backtest_trades（图表/回测层 trade markers，≠ 真实成交 trades 表）--------
create table if not exists public.backtest_trades (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  backtest_id   uuid references public.backtest_runs(id) on delete cascade,
  strategy_id   uuid references public.strategies(id) on delete set null,
  symbol_code   text not null references public.symbols(code),
  side          text not null check (side in ('long','short')),
  status        text not null check (status in ('open','closed','canceled')),
  entry_ts      bigint not null,      -- 毫秒
  entry_price   numeric not null,
  exit_ts       bigint,
  exit_price    numeric,
  qty           numeric not null default 1,
  pnl           numeric,
  pnl_pct       numeric,
  note          text,
  tags          text[] default '{}',
  created_at    timestamptz not null default now()
);
create index if not exists idx_backtest_trades_symbol_entry on public.backtest_trades(symbol_code, entry_ts);
create index if not exists idx_backtest_trades_user on public.backtest_trades(user_id, entry_ts desc);
create index if not exists idx_backtest_trades_backtest on public.backtest_trades(backtest_id);

-- -------- RLS --------
alter table public.symbols         enable row level security;
alter table public.ohlc_bars       enable row level security;
alter table public.strategies      enable row level security;
alter table public.backtest_runs   enable row level security;
alter table public.backtest_trades enable row level security;

drop policy if exists "symbols_read" on public.symbols;
create policy "symbols_read"
  on public.symbols for select
  using (true);

drop policy if exists "ohlc_read" on public.ohlc_bars;
create policy "ohlc_read"
  on public.ohlc_bars for select
  using (true);

drop policy if exists "strategies_rw_own" on public.strategies;
create policy "strategies_rw_own"
  on public.strategies for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "backtest_rw_own" on public.backtest_runs;
create policy "backtest_rw_own"
  on public.backtest_runs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "backtest_trades_rw_own" on public.backtest_trades;
create policy "backtest_trades_rw_own"
  on public.backtest_trades for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -------- 实时订阅（幂等写法）--------
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'backtest_trades'
  ) then
    alter publication supabase_realtime add table public.backtest_trades;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'backtest_runs'
  ) then
    alter publication supabase_realtime add table public.backtest_runs;
  end if;
end $$;

-- -------- updated_at 触发器 --------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_strategies_updated on public.strategies;
create trigger trg_strategies_updated
  before update on public.strategies
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_ohlc_updated on public.ohlc_bars;
create trigger trg_ohlc_updated
  before update on public.ohlc_bars
  for each row execute function public.touch_updated_at();

-- -------- seed --------
insert into public.symbols (code, name, exchange, asset_type, tick_size) values
  ('BTCUSDT', 'Bitcoin / USDT',  'BINANCE', 'crypto', 0.01),
  ('ETHUSDT', 'Ethereum / USDT', 'BINANCE', 'crypto', 0.01),
  ('SOLUSDT', 'Solana / USDT',   'BINANCE', 'crypto', 0.001)
on conflict (code) do nothing;
