/**
 * chartTradeStore
 * - 图表层交易列表（回测生成的 ChartTrade，用于 K 线 markers 联动）
 * - 与 src/store/useTradeStore.ts（真实成交日志）完全独立
 */
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { ChartTrade } from '../lib/types';

interface ChartTradeState {
  trades: ChartTrade[];
  selectedId: string | null;
  hoveredId: string | null;

  setTrades: (trades: ChartTrade[]) => void;
  addTrades: (trades: ChartTrade[]) => void;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  clear: () => void;
}

export const useChartTradeStore = create<ChartTradeState>()(
  subscribeWithSelector((set) => ({
    trades: [],
    selectedId: null,
    hoveredId: null,

    setTrades: (trades) => set({ trades, selectedId: null, hoveredId: null }),
    addTrades: (incoming) =>
      set((s) => {
        const seen = new Set(s.trades.map((t) => t.id));
        const merged = [...s.trades];
        for (const t of incoming) {
          if (!seen.has(t.id)) merged.push(t);
        }
        merged.sort((a, b) => a.entry_ts - b.entry_ts);
        return { trades: merged };
      }),
    select: (id) => set({ selectedId: id }),
    hover: (id) => set({ hoveredId: id }),
    clear: () => set({ trades: [], selectedId: null, hoveredId: null }),
  }))
);

export const selectChartTradesBySymbol = (symbol: string) => (s: ChartTradeState) =>
  s.trades.filter((t) => t.symbol_code === symbol);

export const selectSelectedChartTrade = (s: ChartTradeState) =>
  s.selectedId ? s.trades.find((t) => t.id === s.selectedId) ?? null : null;
