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

type Reachability = 'checking' | 'ok' | 'blocked';

export function TradingViewWidget({
  symbol = 'OKX:BTCUSDT',
  interval = '60',
  theme = 'dark',
  className,
}: Props) {
  const [reachability, setReachability] = useState<Reachability>('checking');
  const [attempt, setAttempt] = useState(0);

  const src = useMemo(
    () => buildEmbedUrl(symbol, interval, theme),
    [symbol, interval, theme],
  );

  // 跨域 iframe 加载失败时不会触发 onError，被重置时浏览器还会把自己的错误页
  // 当成一次成功的 onLoad，所以 iframe 事件不足以判断可达性。改用一次 no-cors
  // 探测：域名被墙或被解析到 127.0.0.1 时 fetch 会直接 reject。
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    setReachability('checking');
    fetch(`${EMBED_ORIGIN}/widgetembed/`, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(() => {
        if (!cancelled) setReachability('ok');
      })
      .catch(() => {
        if (!cancelled) setReachability('blocked');
      })
      .finally(() => clearTimeout(timer));

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (reachability === 'blocked') {
    return (
      <div className={className ?? 'w-full h-full'}>
        <div className="flex h-full w-full items-center justify-center p-6">
          <div className="max-w-md rounded-lg border border-amber-500/40 bg-amber-500/5 p-5 text-sm">
            <p className="mb-2 font-medium text-amber-500">图表服务连接失败</p>
            <p className="mb-3 text-muted-foreground">
              浏览器无法连接到 TradingView（<code>{EMBED_ORIGIN}</code>）。
              这是网络层问题，不是交易数据出了问题 —— 你的账户、交易记录和计划都不受影响。
            </p>
            <ul className="mb-4 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>确认代理已开启，且 <code>*.tradingview.com</code> 走代理</li>
              <li>
                检查代理规则或广告拦截是否把 TradingView 的域名屏蔽成了
                <code> 127.0.0.1</code>
              </li>
            </ul>
            <div className="flex items-center gap-3">
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
                className="text-muted-foreground underline hover:text-foreground"
              >
                在新标签页打开
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className ?? 'w-full h-full'}>
      {reachability === 'checking' ? (
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          正在加载图表…
        </div>
      ) : (
        <iframe
          key={`${src}-${attempt}`}
          src={src}
          title="TradingView 图表"
          className="h-full w-full border-0"
          allow="clipboard-write"
          referrerPolicy="origin"
        />
      )}
    </div>
  );
}
