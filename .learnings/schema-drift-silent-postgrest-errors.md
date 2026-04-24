---
title: Schema/代码 drift + PostgREST 错误被 .catch 吞掉，导致 13 天的静默数据丢失
date: 2026-04-24
tags: [supabase, postgrest, schema, silent-failure, debugging, data-loss]
severity: critical  # 长期静默数据丢失
---

## Problem

TradeInsight 2026-04-11 到 2026-04-24 之间，所有从前端发到 Supabase `trades` 表的 upsert **全部 400 失败**，用户毫不知情，以为数据进了云端。症状表现为"刷新/登出后数据丢失"，误导了一轮又一轮的 race-condition 排查。

真正的病灶有两段叠加：

1. **Schema drift**：`1f3d48c feat: Sprint 1-4` 在 `syncTrades.ts` 里加了 `updated_at: trade.updated_at ?? now` 到 upsert payload，但**没有对应的 migration** 在 `public.trades` 上加 `updated_at` 列。PostgREST 直接 400：`{code: 'PGRST204', message: "Could not find the 'updated_at' column of 'trades' in the schema cache"}`

2. **Silent error**：`syncTrades.ts` 所有 upsert/delete 函数只写 `await supabase.from(...).upsert(...)`，**不检查返回的 `{ error }`**。Supabase SDK 不 throw——Promise 正常 resolve，`.catch(console.error)` 永不触发。调用方`.catch(...)` + `void` 看似安全实则完全看不到失败。

## Symptom

用户报告："昨天平仓了，今天刷新又回来了"。误诊路径：
- 起初怀疑 FIFO 匹配 bug → 没问题
- 怀疑本地 persist 丢失 → 没问题
- 怀疑 `syncFromCloud` merge 把本地独有的 trade 吃掉 → 加了 retro-push，问题依旧
- 怀疑 signOut race（`.catch(console.error)` 吞 JWT 失效后的 401）→ 加了 `pendingSync` flush，问题依旧
- **最后：把 `upsertTrade` 改成 `if (error) throw error`，DevTools Console 立刻弹出 PGRST204**

整个排查链耗了几十分钟，本来 30 秒就能定位——只要第一天错误能被看到。

## Root Cause

两个独立问题的合谋：

### (1) `supabase-js` 默认不 throw

`supabase.from(...).upsert(...)` 返回 `PromiseLike<{ data, error }>`。HTTP 失败时，`error` 字段被填充，但 **Promise 本身 resolve**。`await` 不会 throw。如果代码写成：

```ts
await supabase.from('trades').upsert({...})  // ← 永远不会 throw
```

那失败和成功对调用方来说**完全无法区分**。这是 Supabase SDK 历史遗留设计，和 node-postgres / Prisma / Drizzle 等"出错即 throw"的库直觉相反。

### (2) Migration 未入仓但代码先行

修代码改 upsert payload 是几秒钟的事，写对应的 `alter table add column` migration 需要仔细想，加上项目里 `supabase db push` 要交互式密码（见 `v24_migration_manual_applied` 记忆），开发者容易忘。

## Fix

### 立即修复

1. SQL Editor 里跑 `supabase/migrations/006_trades_updated_at.sql` 补列 + 触发器
2. `if (error) throw error` 写到 `syncTrades.ts` 每一个 upsert/delete 里（对齐 `syncPlans.ts` 的写法）
3. 所有调用方的 `.catch(console.error)` 才真正有意义

### 长期预防

- **规范**：新写任何 `supabase.from(X).{upsert,insert,update,delete}(...)`，必须 `const { error } = await ...; if (error) throw error`。裸 `await supabase.from(...).upsert(...)` 是 bug 的形状，PR 里应该被拒。
- **CI 检查**：可以写一个 ESLint 规则或 grep check，禁止 `await supabase.from` 后面不紧跟 `const { error }`。
- **Schema guard**：修改 `syncTrades.ts` 的 payload 字段前，先搜 `public.trades` 的所有 migration，确认字段真的存在；不存在就一起写一个 `00X_xxx.sql`。
- **观察性**：加一条部署烟测——登录后执行一次空 upsert（或一次 `select count(*)`）来验证 schema 契约，失败就在 UI 顶部显示红条。

## Future Signal

遇到以下任一信号，立刻怀疑这个模式：

- 用户报"数据保存不住"、"刷新就丢"、"换设备就没"，但本地 UI 明明显示成功
- Zustand persist + 云同步的代码里出现 `await supabase.from(...).upsert(...)` 后面**不检查 error**
- 同类问题已经修过多层（race、persist 顺序、retro-push）但症状不消

**先做的事**：在 `upsertX` 里塞 `if (error) throw error`，让失败暴露。不先暴露 → 后面所有修复都是在猜。

## Related Files

- `supabase/migrations/006_trades_updated_at.sql`（新）
- `src/lib/syncTrades.ts`（所有 upsert/delete 已加 error throw）
- `src/lib/syncPlans.ts`（原本就写对了，参照它）
- 对比 commits：`1f3d48c`（引入 bug）、`9be3e13`（暴露错误）、`0b1af03`（补 migration）

## Related Memories

- `v24_migration_manual_applied.md` — 004/005 也是手动执行；006 同理
- `signout_flush_pending_sync.md` — 之前怀疑是这个路径，现在确认是次要问题。flush 机制保留作为防御
