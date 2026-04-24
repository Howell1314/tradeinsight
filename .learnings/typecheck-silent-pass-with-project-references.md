---
title: tsc --noEmit 在 project references + files:[] 布局下静默跳过 typecheck
date: 2026-04-24
tags: [typescript, build, trap, project-reference]
severity: high  # 让开发者误以为 typecheck 通过，直到 build 才抓到错
---

## Problem

在使用 TypeScript project references 的仓库里，根 `tsconfig.json` 常见模式是：

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

此时 `tsc --noEmit` **什么都不 check**（因为 `files: []` 告诉 tsc 本 project 没有源文件，而默认调用模式不会自动走进 references）。命令立即返回退出码 0，看上去像"零错误"。

## Symptom

本项目 `npm run typecheck` 过去定义为 `tsc --noEmit`，历次运行都空返回：

```
$ npx tsc --noEmit
(no output)
```

但真正的错误能被 `npm run build`（内部 `tsc -b && vite build`）抓到。例如 2026-04-24 改了 `PlanConfidence.subjective_score` 为可选后：

- `npx tsc --noEmit` 零输出 ✓（假阳性）
- `npm run build` 报 4 处 TS 错误：
  - `src/pages/PlanDetailPage.tsx:144` 消费 undefined
  - `src/utils/validatePlan.ts:118` 消费 undefined

## Root Cause

`tsc --noEmit` 在以下两种模式的交集下失效：

1. 入口 tsconfig 使用 `files: []`（典型的 Vite / CRA / monorepo 模板）
2. tsc 未启用 `-b` / `--build` 模式

没有 `-b`，tsc 只会看当前 tsconfig 的 `files` / `include` / `exclude`。`files: []` → 无源文件 → 无错可报。

`references` 字段**只在 `-b` 模式下被 tsc 展开**。

## Fix

`package.json` 的 typecheck script 必须带 `-b`：

```diff
-  "typecheck": "tsc --noEmit",
+  "typecheck": "tsc -b --noEmit",
```

替代等价写法：
- `tsc -p tsconfig.app.json --noEmit`（只 check app，不含 node）
- `tsc -b --noEmit --force`（禁用 build info 缓存，适合 CI）

## Future Signal

未来新协作者（包括 AI）遇到以下任一情形时，**不要回退**到 `tsc --noEmit`：

- 看到 `tsconfig.json` 里 `files: []` + `references: [...]`
- 看到 `tsc -b` 在 build script 里出现
- `npm run typecheck` 和 `npm run build` 的 TS 错误报告不一致

直接信任当前的 `"typecheck": "tsc -b --noEmit"`。

如果要让 typecheck 更稳，可以考虑：
- CI 里同时跑 `npm run typecheck` 和 `npm run build`，后者兜底
- 或者在 tsconfig.json 里改成真正有源的配置（不再用 references）

## Related Files

- `package.json`（scripts.typecheck）
- `tsconfig.json`（references）
- `tsconfig.app.json`（实际 compilerOptions）
- `tsconfig.node.json`
