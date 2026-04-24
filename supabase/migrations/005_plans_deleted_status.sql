-- 005_plans_deleted_status.sql
-- v2.4 Phase 1 补丁：放宽 trade_plans.status CHECK 约束以允许 'deleted'
-- 软删除：用户删除的计划不再真实移除，而是保留在 'deleted' 状态以便恢复
--
-- 部署方式（与 004 一致，通过 Dashboard SQL Editor 手动执行）：
--   Supabase Dashboard → SQL Editor → New query → 贴入下方 SQL → Run

alter table public.trade_plans
  drop constraint if exists trade_plans_status_check;

alter table public.trade_plans
  add constraint trade_plans_status_check
  check (status in (
    'draft',
    'active',
    'triggered',
    'partial',
    'closed',
    'expired',
    'cancelled',
    'deleted'
  ));
