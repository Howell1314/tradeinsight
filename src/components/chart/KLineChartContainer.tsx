/**
 * KLineChartContainer
 * - 封装 klinecharts 的生命周期
 * - 订阅 chartStore 的 klines/theme，订阅 indicatorStore 的指标，订阅 chartTradeStore 的交易
 * - 双向联动：chart overlay 点击 → select trade；selectedId → chart scroll/highlight
 *
 * 对 klinecharts v9.x 的 API 做了封装。版本有差异时看 usedApi.md。
 */
import {
  init,
  dispose,
  type Chart,
  type KLineData,
  type OverlayCreate,
} from 'klinecharts';
import { useEffect, useMemo, useRef } from 'react';
import {
  useChartStore,
  selectCurrentKLines,
  selectCurrentError,
  selectCurrentLoading,
} from '../../store/chartStore';
import { useIndicatorStore } from '../../store/indicatorStore';
import { useChartTradeStore } from '../../store/chartTradeStore';
import { getWorkerClient } from '../../workers/workerClient';
import type { ChartTrade } from '../../lib/types';

interface Props {
  className?: string;
}

export function KLineChartContainer({ className }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const appliedIndicatorsRef = useRef<Map<string, string>>(new Map()); // cfg.id -> paneId
  const tradeOverlayIdsRef = useRef<Set<string>>(new Set());

  const klines = useChartStore(selectCurrentKLines);
  const loading = useChartStore(selectCurrentLoading);
  const error = useChartStore(selectCurrentError);
  const theme = useChartStore((s) => s.theme);
  const symbol = useChartStore((s) => s.symbol);
  const timeframe = useChartStore((s) => s.timeframe);

  const indicators = useIndicatorStore((s) => s.indicators);
  const indicatorValues = useIndicatorStore((s) => s.values);
  const setIndicatorValues = useIndicatorStore((s) => s.setValues);

  const trades = useChartTradeStore((s) => s.trades);
  const selectedTradeId = useChartTradeStore((s) => s.selectedId);
  const selectTrade = useChartTradeStore((s) => s.select);

  const currentSymbolTrades = useMemo(
    () => trades.filter((t) => t.symbol_code === symbol),
    [trades, symbol]
  );

  // ---------- 初始化 ----------
  useEffect(() => {
    if (!hostRef.current) return;
    const chart = init(hostRef.current, {
      styles: buildStyles(theme),
    });
    if (!chart) return;
    chartRef.current = chart;

    // resize observer
    const ro = new ResizeObserver(() => {
      chart.resize();
    });
    ro.observe(hostRef.current);

    return () => {
      ro.disconnect();
      if (hostRef.current) dispose(hostRef.current);
      chartRef.current = null;
      appliedIndicatorsRef.current.clear();
      tradeOverlayIdsRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- theme 切换 ----------
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setStyles(buildStyles(theme));
  }, [theme]);

  // ---------- 数据 ----------
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const data: KLineData[] = klines.map((k) => ({
      timestamp: k.timestamp,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume,
      turnover: k.turnover,
    }));
    chart.applyNewData(data);
  }, [klines, symbol, timeframe]);

  // ---------- 指标（主图/副图）的 diff 应用 ----------
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const applied = appliedIndicatorsRef.current;
    const desiredIds = new Set(indicators.filter((i) => i.visible).map((i) => i.id));

    // 删除不再需要的
    for (const [id, paneId] of applied.entries()) {
      if (!desiredIds.has(id)) {
        try {
          (chart as any).removeIndicator?.({ id, paneId });
        } catch {
          /* noop */
        }
        applied.delete(id);
      }
    }

    // 新增 / 保留
    for (const cfg of indicators) {
      if (!cfg.visible) continue;
      if (applied.has(cfg.id)) continue;

      const paneId = cfg.pane === 'main' ? 'candle_pane' : `pane_${cfg.id}`;
      try {
        const createdPaneId = (chart as any).createIndicator?.(
          { name: cfg.name, calcParams: cfg.params },
          cfg.pane === 'sub',
          { id: cfg.id, paneId }
        );
        if (createdPaneId) applied.set(cfg.id, createdPaneId as string);
      } catch (err) {
        console.warn('[chart] create indicator failed', cfg, err);
      }
    }
  }, [indicators]);

  // ---------- 主线程兜底：某些自定义指标交 Worker 算完后回写 ----------
  useEffect(() => {
    const worker = getWorkerClient();
    const controller = new AbortController();

    async function recompute() {
      for (const cfg of indicators) {
        if (!cfg.visible) continue;
        if (!isCustom(cfg.name)) continue;
        try {
          const res = await worker.calcIndicator(
            { name: cfg.name, params: cfg.params },
            klines,
            { signal: controller.signal }
          );
          setIndicatorValues(cfg.id, res.values);
        } catch (e) {
          if ((e as Error).name !== 'AbortError') {
            console.warn('[chart] custom indicator compute failed', cfg, e);
          }
        }
      }
    }
    if (klines.length > 0) recompute();
    return () => controller.abort();
  }, [klines, indicators, setIndicatorValues]);

  // ---------- Trade markers ----------
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // 清旧
    for (const id of tradeOverlayIdsRef.current) {
      try {
        (chart as any).removeOverlay?.({ id });
      } catch {
        /* noop */
      }
    }
    tradeOverlayIdsRef.current.clear();

    // 建新
    for (const t of currentSymbolTrades) {
      const overlays = buildTradeOverlays(t, t.id === selectedTradeId);
      for (const o of overlays) {
        try {
          const id = (chart as any).createOverlay?.(o);
          if (id) tradeOverlayIdsRef.current.add(id as string);
        } catch (err) {
          console.warn('[chart] create trade overlay failed', t, err);
        }
      }
    }

    // overlay 点击回调
    (chart as any).subscribeAction?.('onClick', (data: any) => {
      const overlay = data?.overlay;
      if (!overlay) return;
      const tradeId = overlay?.extendData?.tradeId;
      if (tradeId) selectTrade(tradeId);
    });
  }, [currentSymbolTrades, selectedTradeId, selectTrade]);

  // ---------- selected trade → scroll chart ----------
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !selectedTradeId) return;
    const t = currentSymbolTrades.find((x) => x.id === selectedTradeId);
    if (!t) return;
    try {
      (chart as any).scrollToTimestamp?.(t.entry_ts);
    } catch {
      /* noop */
    }
  }, [selectedTradeId, currentSymbolTrades]);

  // 标注 indicatorValues 已读，避免 lint 警告
  void indicatorValues;

  return (
    <div className={className ?? 'relative w-full h-full'}>
      <div ref={hostRef} className="w-full h-full" />
      {loading && <OverlayHint text="加载中…" />}
      {error && <OverlayHint text={`出错：${error}`} tone="error" />}
      {!loading && !error && klines.length === 0 && (
        <OverlayHint text="暂无数据" />
      )}
    </div>
  );
}

// ---------- helpers ----------

function isCustom(name: string): boolean {
  const builtin = new Set([
    'MA', 'EMA', 'MACD', 'RSI', 'BOLL', 'VOL', 'KDJ', 'SMA', 'BIAS',
    'BRAR', 'CCI', 'DMI', 'CR', 'PSY', 'DMA', 'TRIX', 'OBV', 'VR',
    'WR', 'MTM', 'EMV', 'SAR', 'ROC', 'PVT', 'AO', 'BBI',
  ]);
  return !builtin.has(name.toUpperCase());
}

function buildTradeOverlays(trade: ChartTrade, selected: boolean): OverlayCreate[] {
  const color = trade.side === 'long' ? '#16a34a' : '#dc2626';
  const alpha = selected ? '' : 'cc';
  const lineWidth = selected ? 2 : 1;

  const overlays: OverlayCreate[] = [];

  overlays.push({
    name: 'simpleAnnotation',
    points: [{ timestamp: trade.entry_ts, value: trade.entry_price }],
    extendData: { tradeId: trade.id, type: 'entry' },
    styles: {
      text: {
        color: color + alpha,
        backgroundColor: '#00000033',
        borderColor: color,
        borderSize: lineWidth,
      },
    },
  } as OverlayCreate);

  if (trade.exit_ts && trade.exit_price != null) {
    overlays.push({
      name: 'simpleAnnotation',
      points: [{ timestamp: trade.exit_ts, value: trade.exit_price }],
      extendData: { tradeId: trade.id, type: 'exit' },
      styles: {
        text: {
          color: color + alpha,
          backgroundColor: '#00000033',
          borderColor: color,
          borderSize: lineWidth,
        },
      },
    } as OverlayCreate);

    overlays.push({
      name: 'segment',
      points: [
        { timestamp: trade.entry_ts, value: trade.entry_price },
        { timestamp: trade.exit_ts, value: trade.exit_price },
      ],
      extendData: { tradeId: trade.id, type: 'link' },
      styles: {
        line: {
          color: color + alpha,
          size: lineWidth,
          style: selected ? 'solid' : 'dashed',
        },
      },
    } as OverlayCreate);
  }

  return overlays;
}

function buildStyles(theme: 'light' | 'dark') {
  const dark = theme === 'dark';
  return {
    grid: {
      horizontal: { color: dark ? '#1f2937' : '#e5e7eb' },
      vertical: { color: dark ? '#1f2937' : '#e5e7eb' },
    },
    candle: {
      bar: {
        upColor: '#16a34a',
        downColor: '#dc2626',
        upBorderColor: '#16a34a',
        downBorderColor: '#dc2626',
      },
      tooltip: {
        text: { color: dark ? '#e5e7eb' : '#111827' },
      },
    },
    crosshair: {
      horizontal: {
        line: { color: dark ? '#4b5563' : '#9ca3af' },
        text: { color: dark ? '#e5e7eb' : '#111827', backgroundColor: dark ? '#111827' : '#f3f4f6' },
      },
      vertical: {
        line: { color: dark ? '#4b5563' : '#9ca3af' },
        text: { color: dark ? '#e5e7eb' : '#111827', backgroundColor: dark ? '#111827' : '#f3f4f6' },
      },
    },
    xAxis: {
      axisLine: { color: dark ? '#374151' : '#d1d5db' },
      tickText: { color: dark ? '#9ca3af' : '#4b5563' },
      tickLine: { color: dark ? '#374151' : '#d1d5db' },
    },
    yAxis: {
      axisLine: { color: dark ? '#374151' : '#d1d5db' },
      tickText: { color: dark ? '#9ca3af' : '#4b5563' },
      tickLine: { color: dark ? '#374151' : '#d1d5db' },
    },
  };
}

function OverlayHint({ text, tone = 'info' }: { text: string; tone?: 'info' | 'error' }) {
  return (
    <div
      className={[
        'absolute inset-0 flex items-center justify-center pointer-events-none',
        tone === 'error' ? 'text-red-400' : 'text-neutral-400',
      ].join(' ')}
    >
      <span className="px-3 py-1.5 rounded bg-black/40 text-sm">{text}</span>
    </div>
  );
}
