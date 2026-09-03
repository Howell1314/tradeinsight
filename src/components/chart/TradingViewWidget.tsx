import { useCallback, useEffect, useMemo, useState } from 'react';

interface Props {
  symbol?: string;       // 'OKX:BTCUSDT' / 'BINANCE:BTCUSDT' / 'NASDAQ:AAPL'
  interval?: string;     // '1' / '5' / '15' / '30' / '60' / '240' / 'D' / 'W'
  theme?: 'light' | 'dark';
  className?: string;
}

// 直接使用 s.tradingview.com 的 widgetembed 端点，而不是 embed-widget-advanced-chart.js。
// 原因：那个脚本会把 iframe 指向 www.tradingview-widget.com，该域名容易被代理规则/
// 广告拦截列表误杀成 127.0.0.1，导致整块图表区域变成浏览器的 ERR_CONNECTION_RESET
// 错误页，且应用侧完全无法感知。widgetembed 端点功能等价且少一层域名依赖。
const EMBED_ORIGIN = 'https://s.tradingview.com';

function buildEmbedUrl(symbol: string, interval: string, theme: 'light' | 'dark') {
  const params = new URLSearchParams({
    symbol,
    interval,
    theme,
    style: '1',
    locale: 'zh_CN',
    timezone: 'Etc/UTC',
    withdateranges: '1',
    allow_symbol_change: '1',
    hide_side_toolbar: '0',
    save_image: '1',
  });
  return `${EMBED_ORIGIN}/widgetembed/?${params.toString()}`;
}

export function TradingViewWidget({
  symbol = 'OKX:BTCUSDT',
  interval = '60',
  theme = 'dark',
  className,
}: Props) {
  const [probeFailed, setProbeFailed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const src = useMemo(
    () => buildEmbedUrl(symbol, interval, theme),
    [symbol, interval, theme],
  );

  // 跨域 iframe 加载失败时不会触发 onError，被重置时浏览器还会把自己的错误页
  // 当成一次成功的 onLoad，所以 iframe 事件不足以判断可达性。用一次 no-cors
  // 探测补足：域名被墙或被解析到 127.0.0.1 时 fetch 会直接 reject。
  //
  // ⚠️ 探测只用来「叠加一条提示」，绝不用来决定 iframe 渲不渲染。
  // 这条探测本身会因为跟图表无关的原因失败（最典型的：CSP 的 connect-src 漏放
  // TradingView —— iframe 走 frame-src 是通的，探测却被拦），一旦让它掌握显示权，
  // 就会把一个本来能用的图表藏起来。宁可多一条可关掉的误报，也不要少一个功能。
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    setProbeFailed(false);
    fetch(`${EMBED_ORIGIN}/widgetembed/`, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    })
      .catch(() => {
        if (!cancelled) setProbeFailed(true);
      })
      .finally(() => clearTimeout(timer));

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setDismissed(false);
    setAttempt((n) => n + 1);
  }, []);

  return (
    <div className={className ?? 'w-full h-full'}>
      <div className="relative h-full w-full">
        <iframe
          key={`${src}-${attempt}`}
          src={src}
          title="TradingView 图表"
          className="h-full w-full border-0"
          allow="clipboard-write"
          referrerPolicy="origin"
        />

        {probeFailed && !dismissed && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
            <div className="pointer-events-auto max-w-xl rounded-lg border border-amber-500/40 bg-neutral-900/95 p-4 text-sm shadow-lg">
              <p className="mb-1 font-medium text-amber-500">图表可能无法加载</p>
              <p className="mb-3 text-neutral-300">
                连不上 TradingView（<code>{EMBED_ORIGIN}</code>）。如果下方图表其实
                显示正常，忽略本提示即可。你的账户、交易记录和计划都不受影响。
              </p>
              <ul className="mb-3 list-disc space-y-1 pl-5 text-neutral-400">
                <li>确认代理已开启，且 <code>*.tradingview.com</code> 走代理</li>
                <li>
                  检查代理规则或广告拦截是否把 TradingView 的域名屏蔽成了
                  <code> 127.0.0.1</code>
                </li>
              </ul>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={retry}
                  className="rounded-md border border-amber-500/50 px-3 py-1.5 font-medium text-amber-500 hover:bg-amber-500/10"
                >
                  重试
                </button>
                <a
                  href={src}
                  target="_blank"
                  rel="noreferrer"
                  className="text-neutral-400 underline hover:text-neutral-200"
                >
                  在新标签页打开
                </a>
                <button
                  type="button"
                  onClick={() => setDismissed(true)}
                  className="ml-auto text-neutral-500 hover:text-neutral-300"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
