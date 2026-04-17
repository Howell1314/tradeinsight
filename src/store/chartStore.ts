/**
 * chartStore
 * - 视图状态（symbol / timeframe / theme）
 * - k 线数据缓存（按 symbol+tf key 索引）
 * - 增量更新 / 合并
 *
 * 视图状态用 persist 中间件本地化；k 线数据不持久化（走 supabase 缓存）。
 */
import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import type { KLine, Timeframe } from '../lib/types';
import { mergeKLines } from '../lib/klineAdapter';

type Theme = 'light' | 'dark';

type KLineCacheKey = string; // `${symbol}:${tf}`
const cacheKey = (s: string, tf: Timeframe): KLineCacheKey => `${s}:${tf}`;

interface ChartState {
  // --- 视图状态（持久化） ---
  symbol: string;
  timeframe: Timeframe;
  theme: Theme;

  // --- 数据（不持久化） ---
  klines: Record<KLineCacheKey, KLine[]>;
  loading: Record<KLineCacheKey, boolean>;
  errors: Record<KLineCacheKey, string | null>;

  // --- actions ---
  setSymbol: (s: string) => void;
  setTimeframe: (tf: Timeframe) => void;
  setTheme: (t: Theme) => void;

  setKLines: (symbol: string, tf: Timeframe, klines: KLine[]) => void;
  appendKLines: (symbol: string, tf: Timeframe, klines: KLine[]) => void;
  upsertLatest: (symbol: string, tf: Timeframe, kline: KLine) => void;

  setLoading: (symbol: string, tf: Timeframe, loading: boolean) => void;
  setError: (symbol: string, tf: Timeframe, err: string | null) => void;

  /** 方便的 selector 用 helper */
  getCurrentKLines: () => KLine[];
}

type PersistedSlice = Pick<ChartState, 'symbol' | 'timeframe' | 'theme'>;

export const useChartStore = create<ChartState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        symbol: 'BTCUSDT',
        timeframe: '1h',
        theme: 'dark',

        klines: {},
        loading: {},
        errors: {},

        setSymbol: (symbol) => set({ symbol }),
        setTimeframe: (timeframe) => set({ timeframe }),
        setTheme: (theme) => set({ theme }),

        setKLines: (symbol, tf, klines) => {
          const key = cacheKey(symbol, tf);
          set((s) => ({
            klines: { ...s.klines, [key]: klines },
            errors: { ...s.errors, [key]: null },
          }));
        },

        appendKLines: (symbol, tf, incoming) => {
          const key = cacheKey(symbol, tf);
          set((s) => ({
            klines: {
              ...s.klines,
              [key]: mergeKLines(s.klines[key] ?? [], incoming),
            },
          }));
        },

        upsertLatest: (symbol, tf, kline) => {
          const key = cacheKey(symbol, tf);
          set((s) => ({
            klines: {
              ...s.klines,
              [key]: mergeKLines(s.klines[key] ?? [], [kline]),
            },
          }));
        },

        setLoading: (symbol, tf, loading) => {
          const key = cacheKey(symbol, tf);
          set((s) => ({ loading: { ...s.loading, [key]: loading } }));
        },

        setError: (symbol, tf, err) => {
          const key = cacheKey(symbol, tf);
          set((s) => ({ errors: { ...s.errors, [key]: err } }));
        },

        getCurrentKLines: () => {
          const { symbol, timeframe, klines } = get();
          return klines[cacheKey(symbol, timeframe)] ?? [];
        },
      }),
      {
        name: 'tradeinsight:chart',
        partialize: (s): PersistedSlice => ({
          symbol: s.symbol,
          timeframe: s.timeframe,
          theme: s.theme,
        }),
      }
    )
  )
);

// Stable fallbacks — must be module-level constants so React's useSyncExternalStore
// sees the same reference every call and does not trigger infinite re-renders.
const EMPTY_KLINES: KLine[] = [];

/** 便捷 selector：当前 symbol+tf 的 klines */
export const selectCurrentKLines = (s: ChartState) =>
  s.klines[cacheKey(s.symbol, s.timeframe)] ?? EMPTY_KLINES;

export const selectCurrentLoading = (s: ChartState) =>
  s.loading[cacheKey(s.symbol, s.timeframe)] ?? false;

export const selectCurrentError = (s: ChartState) =>
  s.errors[cacheKey(s.symbol, s.timeframe)] ?? null;
