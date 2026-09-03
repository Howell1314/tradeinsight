# .learnings

项目级踩坑与经验沉淀。每条学习（learning）解决一个**具体的非显然问题**，目标是"下一次踩同一个坑的人（包括未来的自己和 AI 协作者）能在 1 分钟内找到解法并信任它"。

## 收录标准

一条学习值得写入此目录，当它至少满足一条：

- 问题非显然，需要调试 / 查阅才能诊断
- 工作区环境 / 项目结构导致的陷阱（不是通用 JS/TS 知识）
- 工具行为和直觉不符（命令看似成功实则无效）
- 反复会遇到的外部 API 限制或绕道方案

**不要**写入：

- CLAUDE.md 已覆盖的架构规则
- 可以从 git log / PR 描述查到的修复记录
- 一次性的调试日志

## 索引

- [typecheck-silent-pass-with-project-references.md](./typecheck-silent-pass-with-project-references.md) — `tsc --noEmit` 在 `tsconfig.json` 使用 project references 且 `files: []` 时**静默跳过**类型检查；必须用 `tsc -b --noEmit` 才是真 check
- [signout-race-loses-fire-and-forget-writes.md](./signout-race-loses-fire-and-forget-writes.md) — 登出前必须 flush pending 云写入；否则最后一笔编辑会被 JWT 失效吃掉，本地 + 云端双丢
- [schema-drift-silent-postgrest-errors.md](./schema-drift-silent-postgrest-errors.md) — `supabase-js` 不 throw，失败只在 `{error}` 里；schema/代码 drift + 不检查 error = 静默数据丢失 13 天。每个 upsert 必须 `if (error) throw error`
- [third-party-iframe-blocked-by-dns.md](./third-party-iframe-blocked-by-dns.md) — 第三方 iframe 域名被 DNS 劫持到 `127.0.0.1` 时浏览器画错误页，且跨域 iframe 失败**会报成功的 `onLoad`**；另含「shell 的 `http_proxy` 让直连测试说谎」与「用失败耗时区分被墙 / 本地劫持」两条排查法
