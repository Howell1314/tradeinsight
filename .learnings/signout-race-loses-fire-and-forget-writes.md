---
title: signOut 竞争吃掉 fire-and-forget 云写入，导致最后一笔编辑永久丢失
date: 2026-04-24
tags: [supabase, auth, sync, race-condition, data-loss]
severity: critical  # 可复现的用户数据丢失
---

## Problem

Zustand store 里的云端写入是 fire-and-forget：

```ts
// useTradeStore.addTrade（修复前）
if (s.userId) upsertTrade(s.userId, stamped).catch((e) => console.error(...))
```

当用户执行"**编辑 → 立即登出 → 刷新 → 重登**"的操作序列，刚刚的编辑会永久消失——本地和云端都查不到。

## Symptom

2026-04-24 用户复现：
1. 平仓一笔 AAPL 期权，持仓列表立刻显示 1 个持仓 5 笔已结算 ✓
2. 右上角点"退出账户"
3. 浏览器刷新 + 重新登录
4. 回到 2 个持仓 4 笔已结算——**平仓那笔卖出记录在云端、本地都没了**

"交易记录"页面过滤 AAPL 只剩原始的 60 张买入 + 40 张卖出，新的 20 张平仓消失。

## Root Cause

精确的时序竞争：

1. `addTrade` 同步更新 local state（Zustand persist 把新状态写入 localStorage）
2. `addTrade` 触发 `upsertTrade(...).catch(console.error)` —— **不 await，Promise 挂在事件循环里**
3. 用户点登出 → `useAuthStore.signOut()` 立即执行：
   ```ts
   await supabase.auth.signOut()     // ← 服务端 invalidate session
   set({ user: null, ... })
   ```
4. in-flight 的 upsert 此时才到达 Supabase → JWT 已失效 → RLS 返回 401/403
5. `.catch(console.error)` 静默吞掉错误
6. React 捕获 `user: null`，App.tsx useEffect 触发 `clearUserData()` → 本地 trades 清空 → persist 写空到 localStorage
7. 结果：本地空 + 云端从未收到新记录 → 重登后只能看到云端的历史数据

### 为什么 v2.3 的 "Zustand persist + auth 初始化顺序" 约束救不了这条路径

v2.3 修的是"auth 未 init 时误触发 clearUserData 覆写 localStorage"；那是 **页面刷新时的初始化顺序** 问题。这次是 **已登录状态下正常登出的 race**，`initialized=true` 已经成立，`clearUserData` 被调用本身是合法的——问题出在登出前没有等 in-flight 的云写入。

### 为什么"同步合并时回推 local-only"的补丁也救不了

`syncFromCloud` 的确应该在合并时把本地独有的 trade 回推到云端（这个 bug 顺手修了），但登出路径里，`clearUserData` 在同步合并发生之前就已经把本地清空了——回推阶段再也看不到那条新记录。

## Fix

建立一个**全局 pending 追踪器**，登出前等所有 in-flight 云写入落地：

```ts
// src/lib/pendingSync.ts
const pendingOps = new Set<Promise<unknown>>()

export function trackSync<T>(promise: Promise<T>): Promise<T> {
  const wrapped: Promise<T> = promise.finally(() => {
    pendingOps.delete(wrapped as Promise<unknown>)
  })
  pendingOps.add(wrapped as Promise<unknown>)
  return wrapped
}

export async function flushPendingSync(): Promise<void> {
  if (pendingOps.size === 0) return
  await Promise.allSettled(Array.from(pendingOps))
}
```

每一处 fire-and-forget 的 upsert/delete 用 `trackSync(...)` 包一下：

```ts
// useTradeStore.addTrade（修复后）
if (s.userId) trackSync(upsertTrade(s.userId, stamped)).catch((e) => console.error(...))
```

`useAuthStore.signOut()` 在失效 session 之前先 flush：

```ts
signOut: async () => {
  await flushPendingSync()         // ← JWT 还有效，upsert 能成功落地
  await supabase.auth.signOut()    // ← 然后才 invalidate
  set({ user: null, session: null, profile: null })
}
```

## Future Signal

下一次出现以下任一情形时，应当想到这个模式：

- 任何 "本地状态已更新 → 立即做一个 auth/session 失效动作 → 数据丢失" 的 bug 报告
- 新建 store action 时，云写入不 await、用 `.catch(console.error)` 静默吞错
- 把 Supabase 换成其他 BaaS（Firebase、Appwrite）——JWT/session 作废机制都类似，同一个 race 会复现

**收录标准**：所有用 Zustand + Supabase（或同类 BaaS）、客户端写入非事务性且 session 作废即时生效的项目都会遇到。这是架构级陷阱，不是本项目独有。

## Related Files

- `src/lib/pendingSync.ts`（新）
- `src/store/useAuthStore.ts` (signOut)
- `src/store/useTradeStore.ts`（所有 action 的 upsert 点）
- `src/store/useJournalStore.ts`（同上）
- `src/App.tsx` useEffect 里的 clearUserData 触发点（仅作为延迟触发器）

## Related Memories

- `zustand_persist_auth_invariant.md` — 是**互补**问题：那条约束覆盖"auth 未 init 前"的时序，本 learning 覆盖"登出触发时"的时序
