import { useMemo } from 'react';
import { useChartStore } from '../../store/chartStore';
import { useChartTradeStore } from '../../store/chartTradeStore';

export function TradeList() {
  const symbol = useChartStore((s) => s.symbol);
  const trades = useChartTradeStore((s) => s.trades);
  const selectedId = useChartTradeStore((s) => s.selectedId);
  const select = useChartTradeStore((s) => s.select);
  const hover = useChartTradeStore((s) => s.hover);

  const rows = useMemo(
    () =>
      trades
        .filter((t) => t.symbol_code === symbol)
        .sort((a, b) => b.entry_ts - a.entry_ts),
    [trades, symbol]
  );

  if (rows.length === 0) {
    return (
      <div className="p-4 text-sm text-neutral-500">
        当前 {symbol} 无交易记录
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-neutral-800 text-xs text-neutral-400 font-medium flex items-center gap-2">
        <span>交易记录</span>
        <span className="text-neutral-500">({rows.length})</span>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-neutral-950 text-neutral-400">
            <tr>
              <th className="text-left px-3 py-2 font-normal">方向</th>
              <th className="text-left px-3 py-2 font-normal">入场</th>
              <th className="text-right px-3 py-2 font-normal">价格</th>
              <th className="text-right px-3 py-2 font-normal">PnL</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const isSel = t.id === selectedId;
              const pnlPos = (t.pnl ?? 0) > 0;
              return (
                <tr
                  key={t.id}
                  onClick={() => select(t.id)}
                  onMouseEnter={() => hover(t.id)}
                  onMouseLeave={() => hover(null)}
                  className={
                    'cursor-pointer border-b border-neutral-900 ' +
                    (isSel
                      ? 'bg-blue-950/40 text-white'
                      : 'hover:bg-neutral-900 text-neutral-200')
                  }
                >
                  <td className="px-3 py-2">
                    <span
                      className={
                        'px-1.5 py-0.5 rounded text-[10px] font-mono ' +
                        (t.side === 'long'
                          ? 'bg-green-950 text-green-400'
                          : 'bg-red-950 text-red-400')
                      }
                    >
                      {t.side.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-neutral-400">
                    {formatTs(t.entry_ts)}
                  </td>
                  <td className="px-3 py-2 font-mono text-right">
                    {t.entry_price.toFixed(2)}
                    {t.exit_price != null && (
                      <div className="text-neutral-500 text-[10px]">
                        → {t.exit_price.toFixed(2)}
                      </div>
                    )}
                  </td>
                  <td
                    className={
                      'px-3 py-2 font-mono text-right ' +
                      (t.pnl == null
                        ? 'text-neutral-500'
                        : pnlPos
                        ? 'text-green-400'
                        : 'text-red-400')
                    }
                  >
                    {t.pnl == null ? '—' : (pnlPos ? '+' : '') + t.pnl.toFixed(2)}
                    {t.pnl_pct != null && (
                      <div className="text-[10px]">
                        {(t.pnl_pct * 100).toFixed(2)}%
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatTs(ts: number) {
  const d = new Date(ts);
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${MM}-${DD} ${hh}:${mm}`;
}
