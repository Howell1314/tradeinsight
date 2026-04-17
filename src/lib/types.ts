/**
 * 共享类型定义
 * 这些类型同时被 UI / Worker / Edge Function 使用，保持一份真相。
 * 如果 Edge Function 用 Deno，把这个文件同步到 supabase/functions/_shared/types.ts 即可。
 */

export type Timeframe =
  | '1m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '4h'
  | '1d'
  | '1w';

export interface Symbol {
  code: string;           // e.g. "BTCUSDT" / "AAPL"
  name: string;
  exchange: string;       // "BINANCE" / "NASDAQ"
  asset_type: 'crypto' | 'stock' | 'forex' | 'futures';
  tick_size: number;
}

/** KLineChart 原生格式（camelCase, ms timestamp） */
export interface KLine {
  timestamp: number;      // 毫秒
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover?: number;
}

/** Supabase 里存储的原始 OHLC（snake_case, sec timestamp） */
export interface OhlcRow {
  symbol_code: string;
  timeframe: Timeframe;
  ts: number;             // Unix seconds
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type TradeSide = 'long' | 'short';
export type TradeStatus = 'open' | 'closed' | 'canceled';

export interface ChartTrade {
  id: string;
  symbol_code: string;
  side: TradeSide;
  status: TradeStatus;
  entry_ts: number;         // 毫秒
  entry_price: number;
  exit_ts?: number;
  exit_price?: number;
  qty: number;
  pnl?: number;             // exit 后计算
  pnl_pct?: number;
  strategy_id?: string;
  note?: string;
  tags?: string[];
}

export interface IndicatorConfig {
  id: string;               // 唯一 id（用于在 chart 上增删）
  name: string;             // 'MA' | 'EMA' | 'MACD' | 'RSI' | 'BOLL' | ...
  pane: 'main' | 'sub';     // 主图叠加 or 副图
  params: (number | string)[];
  visible: boolean;
}

export interface BacktestRequest {
  strategy_id: string;
  symbol_code: string;
  timeframe: Timeframe;
  start_ts: number;
  end_ts: number;
  initial_capital: number;
  params?: Record<string, unknown>;
}

export interface BacktestResult {
  run_id: string;
  strategy_id: string;
  symbol_code: string;
  timeframe: Timeframe;
  start_ts: number;
  end_ts: number;
  trades: ChartTrade[];
  equity_curve: Array<{ ts: number; value: number }>;
  metrics: {
    total_return: number;
    sharpe: number;
    max_drawdown: number;
    win_rate: number;
    profit_factor: number;
    trade_count: number;
  };
}

/** Worker 消息协议 */
export type WorkerRequest =
  | { kind: 'calc_indicator'; reqId: string; name: string; params: (number | string)[]; klines: KLine[] }
  | { kind: 'run_strategy'; reqId: string; strategy: string; params: Record<string, unknown>; klines: KLine[] }
  | { kind: 'cancel'; reqId: string };

export type WorkerResponse =
  | { kind: 'indicator_result'; reqId: string; values: Array<Record<string, number | null>> }
  | { kind: 'strategy_result'; reqId: string; trades: ChartTrade[]; metrics: BacktestResult['metrics'] }
  | { kind: 'error'; reqId: string; message: string };
