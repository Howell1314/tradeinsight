import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark';

interface ChartState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const useChartStore = create<ChartState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'tradeinsight:chart',
    }
  )
);
