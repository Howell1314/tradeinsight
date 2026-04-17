/**
 * ChartPage
 * - 组装 toolbar / KLineChartContainer / TradeList
 * - symbol / timeframe 变化时拉取 OHLC（走 Edge Function）
 * - 订阅 backtest_trades 的 realtime（如果接了 supabase）
 */
import { useEffect, useState } from 'react';
import { KLineChartContainer } from '../components/chart/KLineChartContainer';
import { ChartToolbar } from '../components/chart/ChartToolbar';
import { IndicatorPanel } from '../components/chart/IndicatorPanel';
import { TradeList } from '../components/chart/TradeList';
import { useChartStore } from '../store/chartStore';
import { useChartTradeStore } from '../store/chartTradeStore';
import { invokeFn, supabase } from '../lib/supabase';
import { rowsToKLines } from '../lib/klineAdapter';
import type { OhlcRow, ChartTrade } from '../lib/types';

interface FetchOhlcResponse {
  rows: OhlcRow[];
}

export function ChartPage() {
  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);
  const theme = useChartStore((s) => s.theme);
  const setKLines = useChartStore((s) => s.setKLines);
  const setLoading = useChartStore((s) => s.setLoading);
  const setError = useChartStore((s) => s.setError);

  const setTrades = useChartTradeStore((s) => s.setTrades);

  const [indicatorPanelOpen, setIndicatorPanelOpen] = useState(false);

  // ---- 拉 OHLC ----
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      setLoading(symbol, timeframe, true);
      setError(symbol, timeframe, null);
      try {
        const res = await invokeFn<FetchOhlcResponse>(
          'fetch-ohlc',
          { symbol, timeframe, limit: 1000 },
          { signal: controller.signal }
        );
        if (cancelled) return;
        const klines = rowsToKLines(res.rows ?? []);
        setKLines(symbol, timeframe, klines);
      } catch (e) {
        if (cancelled || (e as Error).name === 'AbortError') return;
        setError(symbol, timeframe, (e as Error).message || 'fetch failed');
      } finally {
        if (!cancelled) setLoading(symbol, timeframe, false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [symbol, timeframe, setKLines, setLoading, setError]);

  // ---- 拉 backtest_trades + 订阅 realtime ----
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('backtest_trades')
        .select('*')
        .order('entry_ts', { ascending: true });
      if (cancelled) return;
      if (!error && data) {
        setTrades(data.map(rowToChartTrade));
      }
    })();

    const ch = supabase
      .channel('backtest-trades-stream')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'backtest_trades' },
        () => {
          supabase
            .from('backtest_trades')
            .select('*')
            .order('entry_ts', { ascending: true })
            .then(({ data }) => {
              if (!cancelled && data) setTrades(data.map(rowToChartTrade));
            });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [setTrades]);

  // ---- 全局主题 class ----
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <div className="h-screen w-screen flex flex-col bg-neutral-950 text-neutral-100">
      <ChartToolbar onOpenIndicatorPanel={() => setIndicatorPanelOpen(true)} />
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0">
          <KLineChartContainer className="w-full h-full" />
        </div>
        <aside className="w-[320px] border-l border-neutral-800 flex flex-col">
          <TradeList />
        </aside>
      </div>
      {indicatorPanelOpen && (
        <IndicatorPanel onClose={() => setIndicatorPanelOpen(false)} />
      )}
    </div>
  );
}

function rowToChartTrade(r: Record<string, unknown>): ChartTrade {
  return {
    id: r.id as string,
    symbol_code: r.symbol_code as string,
    side: r.side as ChartTrade['side'],
    status: r.status as ChartTrade['status'],
    entry_ts: Number(r.entry_ts),
    entry_price: Number(r.entry_price),
    exit_ts: r.exit_ts == null ? undefined : Number(r.exit_ts),
    exit_price: r.exit_price == null ? undefined : Number(r.exit_price),
    qty: Number(r.qty),
    pnl: r.pnl == null ? undefined : Number(r.pnl),
    pnl_pct: r.pnl_pct == null ? undefined : Number(r.pnl_pct),
    strategy_id: (r.strategy_id as string) ?? undefined,
    note: (r.note as string) ?? undefined,
    tags: (r.tags as string[]) ?? undefined,
  };
}
