import { useState } from 'react';
import { useIndicatorStore } from '../../store/indicatorStore';

const INDICATOR_PRESETS = [
  { name: 'MA', label: 'MA', pane: 'main' as const, defaultParams: [20] },
  { name: 'EMA', label: 'EMA', pane: 'main' as const, defaultParams: [20] },
  { name: 'BOLL', label: 'Bollinger Bands', pane: 'main' as const, defaultParams: [20, 2] },
  { name: 'MACD', label: 'MACD', pane: 'sub' as const, defaultParams: [12, 26, 9] },
  { name: 'RSI', label: 'RSI', pane: 'sub' as const, defaultParams: [14] },
  { name: 'KDJ', label: 'KDJ', pane: 'sub' as const, defaultParams: [9, 3, 3] },
];

interface Props {
  onClose: () => void;
}

export function IndicatorPanel({ onClose }: Props) {
  const indicators = useIndicatorStore((s) => s.indicators);
  const add = useIndicatorStore((s) => s.addIndicator);
  const remove = useIndicatorStore((s) => s.removeIndicator);
  const toggle = useIndicatorStore((s) => s.toggleVisible);
  const updateParams = useIndicatorStore((s) => s.updateParams);

  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-20">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-[480px] max-h-[70vh] flex flex-col text-sm text-neutral-100">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <h3 className="font-medium">指标配置</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">
            ✕
          </button>
        </div>

        <div className="p-4 border-b border-neutral-800">
          <div className="text-xs text-neutral-400 mb-2">添加指标</div>
          <div className="flex flex-wrap gap-2">
            {INDICATOR_PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() =>
                  add({
                    name: p.name,
                    pane: p.pane,
                    params: p.defaultParams,
                    visible: true,
                  })
                }
                className="px-2 py-1 rounded border border-neutral-700 bg-neutral-800 hover:bg-neutral-700"
              >
                + {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-2">
          {indicators.length === 0 && (
            <div className="text-center text-neutral-500 py-6">暂无指标</div>
          )}
          {indicators.map((cfg) => (
            <div
              key={cfg.id}
              className="flex items-center gap-2 px-3 py-2 bg-neutral-800 rounded"
            >
              <input
                type="checkbox"
                checked={cfg.visible}
                onChange={() => toggle(cfg.id)}
              />
              <span className="font-mono text-xs bg-neutral-900 px-2 py-0.5 rounded">
                {cfg.name}
              </span>
              <span className="text-xs text-neutral-400">
                [{cfg.pane}]
              </span>
              {editingId === cfg.id ? (
                <input
                  autoFocus
                  defaultValue={cfg.params.join(',')}
                  onBlur={(e) => {
                    const parsed = e.target.value
                      .split(',')
                      .map((x) => x.trim())
                      .filter(Boolean)
                      .map((x) => (isNaN(Number(x)) ? x : Number(x)));
                    updateParams(cfg.id, parsed);
                    setEditingId(null);
                  }}
                  className="bg-neutral-900 border border-neutral-700 rounded px-2 py-0.5 text-xs w-32"
                />
              ) : (
                <button
                  onClick={() => setEditingId(cfg.id)}
                  className="text-xs font-mono text-neutral-300 hover:text-white"
                >
                  ({cfg.params.join(', ')})
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={() => remove(cfg.id)}
                className="text-xs text-red-400 hover:text-red-300"
              >
                删除
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
