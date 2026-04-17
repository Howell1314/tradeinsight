import { useChartStore } from '../../store/chartStore';
import type { Timeframe } from '../../lib/types';

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];

interface Props {
  onOpenIndicatorPanel?: () => void;
  symbolOptions?: string[];
}

export function ChartToolbar({ onOpenIndicatorPanel, symbolOptions }: Props) {
  const symbol = useChartStore((s) => s.symbol);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const timeframe = useChartStore((s) => s.timeframe);
  const setTimeframe = useChartStore((s) => s.setTimeframe);
  const theme = useChartStore((s) => s.theme);
  const setTheme = useChartStore((s) => s.setTheme);

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-800 bg-neutral-950 text-sm">
      {/* Symbol */}
      {symbolOptions && symbolOptions.length > 0 ? (
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-neutral-100"
        >
          {symbolOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 w-32 text-neutral-100"
          placeholder="BTCUSDT"
        />
      )}

      {/* Timeframe */}
      <div className="flex items-center rounded border border-neutral-700 overflow-hidden">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={
              'px-2 py-1 text-xs ' +
              (tf === timeframe
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800')
            }
          >
            {tf}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      <button
        onClick={onOpenIndicatorPanel}
        className="px-3 py-1 rounded border border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
      >
        指标
      </button>

      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="px-3 py-1 rounded border border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
        title="切换主题"
      >
        {theme === 'dark' ? '🌙' : '☀️'}
      </button>
    </div>
  );
}
