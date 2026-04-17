import { useEffect } from 'react';
import { TradingViewWidget } from '../components/chart/TradingViewWidget';
import { useChartStore } from '../store/chartStore';

export function ChartPage() {
  const theme = useChartStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <div className="h-full w-full">
      <TradingViewWidget theme={theme} />
    </div>
  );
}
