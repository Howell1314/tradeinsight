---
title: 第三方图表 iframe 被 DNS 劫持到 127.0.0.1，应用侧完全无法感知
date: 2026-09-03
tags: [tradingview, iframe, dns, network, third-party, silent-failure, debugging]
severity: high  # 整个功能页不可用，且报错像是应用崩了
---

## Problem

生产环境 `tradeinsight.capital` 的「K线图表」页，整块内容区被浏览器的
「已重置连接。」（`ERR_CONNECTION_RESET`）错误页占满，左侧导航正常。

看起来像应用崩溃，实际是**第三方 iframe 的目标域名在客户端被 DNS 解析到了
`127.0.0.1`**，浏览器去连本机 443（无服务）→ 连接被重置 → 画出错误页。

`TradingViewWidget` 原实现注入官方脚本
`https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js`，
该脚本自己创建的 iframe 指向 **`www.tradingview-widget.com`**。这个域名形如
广告/追踪域名，很容易被代理软件规则或广告拦截列表误杀。

```
dig www.tradingview-widget.com          → 127.0.0.1        ← 被污染
dig @8.8.8.8 www.tradingview-widget.com → 109.61.83.246    ← 真实地址
grep tradingview /etc/hosts             → (无)             ← 不是 hosts 干的
```

## 三个反直觉点（真正拖慢排查的）

### 1. shell 里的 `http_proxy` 会让「直连测试」全部说谎

排查时先跑 `curl https://www.tradingview.com/` 得到 200，据此判断"网络没问题"——
错。当前 shell 有：

```
all_proxy=socks5://127.0.0.1:7897
http_proxy=http://127.0.0.1:33210
https_proxy=http://127.0.0.1:33210
```

curl 默认吃这些环境变量，所谓「直连」其实全程走代理。要测真直连必须显式剥离：

```bash
env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
  curl --noproxy '*' -sS -o /dev/null -w "%{http_code}\n" --max-time 10 https://HOST/
```

剥离后真实结论完全不同：三个 TradingView 域名**真直连全部不可达**，只是被墙的
那两个挂代理能救，被 DNS 污染的那个挂代理也救不回来。

### 2. 跨域 iframe 加载失败**不会**触发 `onError`

连接被重置时浏览器渲染的是自己的错误页，而那个错误页对 iframe 而言是一次
**成功的 `onLoad`**。所以 `<iframe onError>` 和 "超时没 onLoad 就算失败" 两种
判据都不成立，应用侧永远以为加载成功了。

可用的探测手段是 `fetch(url, { mode: 'no-cors' })`：域名被墙或被解析到
`127.0.0.1` 时会直接 reject，能连通则 resolve 一个 opaque response。

### 3. 域名被 reset 的耗时能区分故障类型

| 现象 | 耗时 | 含义 |
|---|---|---|
| `Connection timed out` | 10s（打满 timeout） | 被墙，丢包 |
| `Connection reset by peer` / `Couldn't connect` | **0.02–0.03s** | 本地回环，DNS 被解析成 `127.0.0.1` |
| TLS `SSL_ERROR_SYSCALL` | 0.3s 左右 | TLS 握手阶段被重置（GFW 特征） |

**极短耗时的连接失败 = 本机层面的问题，不要往网络远端查。**

## Fix

`4b4dbf5` — 改为直接 iframe 到 `s.tradingview.com/widgetembed/`：

- 少依赖一个域名（不再经过 `www.tradingview-widget.com`）
- 功能等价（symbol / interval / theme / style / locale / withdateranges /
  allow_symbol_change / hide_side_toolbar / save_image 参数都支持）
- 对没有 DNS 污染的用户同样可用，是纯改进
- 配 no-cors 可达性探测 + 降级面板（含重试与「新标签页打开」），失败时给出
  「这是网络问题，你的交易数据不受影响」的明确说明，而不是把浏览器错误页甩给用户

## 后续：修复引入的回归（同日，值得单独记）

给生产补 CSP 时，TradingView 只放进了 `frame-src`，没放进 `connect-src`。结果：

- iframe 本身走 `frame-src` —— **通的，图表能加载**
- 上面那个 `fetch(..., {mode:'no-cors'})` 可达性探测走 **`connect-src`** —— 被 CSP 拦，reject
- 组件当时用探测结果决定渲不渲染 iframe → **把一个能用的图表整个藏掉，并报「连接失败」**

两条教训：

1. **一个第三方域名可能同时被多条 CSP 指令管辖。** iframe 是 `frame-src`，
   fetch/XHR/WebSocket 是 `connect-src`，`<img>` 是 `img-src`……放行时要按
   **实际用到的加载方式**逐条列，不能只放"看起来最相关"的那一条。
2. **不要让副路探测掌握主功能的显示权。** 探测会因为与功能无关的原因失败
   （CSP、扩展拦截、临时抖动）。正确做法是主功能照常渲染，探测失败只叠加一条
   可关闭的提示 —— 宁可多一条误报，也不要少一个功能。

## 通用教训

**任何第三方 iframe/脚本嵌入都必须假设它会被拦掉**，并给出应用自己的降级 UI。
否则第三方的网络故障会伪装成你的应用崩溃，用户和排查者都会被误导。

选嵌入端点时优先挑**域名少、名字不像追踪域名**的那个——`*-widget.com`、
`*-analytics.com` 这类域名进拦截列表的概率显著更高。

## 相关

- 生产环境目前**没有 CSP**：`vite.config.ts` 里那份写在 `server.headers`，
  只作用于 Vite 开发服务器；`public/` 下没有 `_headers`，Cloudflare Pages
  上线后不带任何 CSP。本次故障与它无关（生产没 CSP 反而不会拦），但是独立隐患。
  若将来补 `_headers`，`frame-src` 必须包含实际使用的嵌入域名。
