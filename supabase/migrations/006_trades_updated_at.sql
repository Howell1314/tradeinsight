-- Add `updated_at` column to public.trades (and public.user_accounts / public.account_transactions
-- if they lack it too), fixing a long-standing schema/code drift introduced in commit 1f3d48c
-- (2026-04-11) where syncTrades.ts started sending `updated_at` in the upsert payload without
-- a corresponding ALTER TABLE. PostgREST rejected every write with PGRST204 ("Could not find
-- the 'updated_at' column of 'trades' in the schema cache"), but the error was swallowed by
-- .catch(console.error) until 2026-04-24 when error propagation was hardened.
--
-- Safe to re-run (idempotent). Backfills existing rows with created_at so last-write-wins
-- merge logic in syncFromCloud keeps working. Also attaches the touch_updated_at trigger
-- (defined in 001_init.sql) so future UPDATEs auto-stamp.

-- -------- trades --------
alter table public.trades
  add column if not exists updated_at timestamptz not null default now();

update public.trades
  set updated_at = coalesce(created_at, now())
  where updated_at is null;

drop trigger if exists trg_trades_updated on public.trades;
create trigger trg_trades_updated
  before update on public.trades
  for each row execute function public.touch_updated_at();

-- -------- user_accounts (defensive — same code path uses upsertAccount) --------
alter table public.user_accounts
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_user_accounts_updated on public.user_accounts;
create trigger trg_user_accounts_updated
  before update on public.user_accounts
  for each row execute function public.touch_updated_at();

-- -------- account_transactions --------
alter table public.account_transactions
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_account_transactions_updated on public.account_transactions;
create trigger trg_account_transactions_updated
  before update on public.account_transactions
  for each row execute function public.touch_updated_at();

-- Force PostgREST to refresh its schema cache immediately; otherwise the next write can
-- still 400 for up to ~10 seconds while the cache rebuilds on its own.
notify pgrst, 'reload schema';
