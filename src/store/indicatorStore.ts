/**
 * indicatorStore
 * - 管理用户添加的指标配置
 * - 持久化配置（不持久化计算结果 —— 切 symbol/tf 就重算）
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { IndicatorConfig } from '../lib/types';

interface IndicatorState {
  indicators: IndicatorConfig[];
  // 计算结果按 indicator id 索引（非持久化）
  values: Record<string, Array<Record<string, number | null>>>;

  addIndicator: (cfg: Omit<IndicatorConfig, 'id'>) => string;
  removeIndicator: (id: string) => void;
  toggleVisible: (id: string) => void;
  updateParams: (id: string, params: (number | string)[]) => void;

  setValues: (id: string, values: Array<Record<string, number | null>>) => void;
  clearValues: () => void;
}

type PersistedSlice = Pick<IndicatorState, 'indicators'>;

export const useIndicatorStore = create<IndicatorState>()(
  persist(
    (set) => ({
      indicators: [
        { id: 'default_ma20', name: 'MA', pane: 'main', params: [20], visible: true },
        { id: 'default_vol', name: 'VOL', pane: 'sub', params: [], visible: true },
      ],
      values: {},

      addIndicator: (cfg) => {
        const id = `ind_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        set((s) => ({ indicators: [...s.indicators, { ...cfg, id }] }));
        return id;
      },
      removeIndicator: (id) =>
        set((s) => {
          const { [id]: _removed, ...rest } = s.values;
          return {
            indicators: s.indicators.filter((i) => i.id !== id),
            values: rest,
          };
        }),
      toggleVisible: (id) =>
        set((s) => ({
          indicators: s.indicators.map((i) =>
            i.id === id ? { ...i, visible: !i.visible } : i
          ),
        })),
      updateParams: (id, params) =>
        set((s) => ({
          indicators: s.indicators.map((i) => (i.id === id ? { ...i, params } : i)),
          values: { ...s.values, [id]: [] }, // 失效旧值
        })),

      setValues: (id, values) =>
        set((s) => ({ values: { ...s.values, [id]: values } })),

      clearValues: () => set({ values: {} }),
    }),
    {
      name: 'tradeinsight:indicators',
      partialize: (s): PersistedSlice => ({ indicators: s.indicators }),
    }
  )
);
