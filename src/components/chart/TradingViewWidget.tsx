import { useEffect, useRef } from 'react';

interface Props {
  symbol?: string;       // 'OKX:BTCUSDT' / 'BINANCE:BTCUSDT' / 'NASDAQ:AAPL'
  interval?: string;     // '1' / '5' / '15' / '30' / '60' / '240' / 'D' / 'W'
  theme?: 'light' | 'dark';
  className?: string;
}

export function TradingViewWidget({
  symbol = 'OKX:BTCUSDT',
  interval = '60',
  theme = 'dark',
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    container.innerHTML = ''; // 清掉上一个 widget

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: 'Etc/UTC',
      theme,
      style: '1',
      locale: 'zh_CN',
      allow_symbol_change: true,
      hide_side_toolbar: false,
      withdateranges: true,
      support_host: 'https://www.tradingview.com',
    });
    container.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, [symbol, interval, theme]);

  return (
    <div className={className ?? 'w-full h-full'}>
      <div
        ref={containerRef}
        className="tradingview-widget-container"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
