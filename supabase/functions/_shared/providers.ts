// OHLC 数据源适配器。
// 目前实现了 OKX；要接其他源就加一个 provider，dispatch 里加个 case。

export interface OhlcCandle {
  ts: number;   // Unix seconds
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';

export interface FetchArgs {
  symbol: string;
  timeframe: Timeframe;
  limit?: number;
  endTs?: number;  // exclusive, seconds
}

// ---------- Binance ----------

const BINANCE_TF: Record<Timeframe, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w',
};

async function fetchBinance(args: FetchArgs): Promise<OhlcCandle[]> {
  const interval = BINANCE_TF[args.timeframe];
  if (!interval) throw new Error(`Unsupported timeframe: ${args.timeframe}`);
  const limit = Math.min(args.limit ?? 1000, 1000);
  const params = new URLSearchParams({
    symbol: args.symbol,
    interval,
    limit: String(limit),
  });
  if (args.endTs) params.set('endTime', String(args.endTs * 1000));

  const url = `https://api.binance.com/api/v3/klines?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance ${res.status}: ${await res.text()}`);
  const arr = (await res.json()) as unknown[][];
  return arr.map((row) => ({
    ts: Math.floor(Number(row[0]) / 1000),
    o: Number(row[1]),
    h: Number(row[2]),
    l: Number(row[3]),
    c: Number(row[4]),
    v: Number(row[5]),
  }));
}

// ---------- OKX ----------

const OKX_TF: Record<Timeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1H', '4h': '4H', '1d': '1D', '1w': '1W',
};

function toOkxInstId(symbol: string): string {
  // BTCUSDT -> BTC-USDT, ETHUSDT -> ETH-USDT
  const match = symbol.match(/^(.+?)(USDT|USDC|USD|BTC|ETH)$/);
  if (!match) throw new Error(`Unknown symbol format: ${symbol}`);
  return `${match[1]}-${match[2]}`;
}

async function fetchOkx(args: FetchArgs): Promise<OhlcCandle[]> {
  const instId = toOkxInstId(args.symbol);
  const bar = OKX_TF[args.timeframe];
  const limit = Math.min(args.limit ?? 300, 300);
  const params = new URLSearchParams({
    instId, bar,
    limit: String(limit),
  });
  if (args.endTs) params.set('after', String(args.endTs * 1000));

  const url = `https://www.okx.com/api/v5/market/candles?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OKX ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.code !== '0') throw new Error(`OKX API: ${data.msg}`);

  // OKX 返回倒序 [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
  return (data.data as string[][]).map((row) => ({
    ts: Math.floor(Number(row[0]) / 1000),
    o: Number(row[1]),
    h: Number(row[2]),
    l: Number(row[3]),
    c: Number(row[4]),
    v: Number(row[5]),
  })).reverse(); // 转成升序
}

// ---------- dispatcher ----------

export async function fetchCandles(
  exchange: string,
  args: FetchArgs
): Promise<OhlcCandle[]> {
  switch (exchange.toUpperCase()) {
    case 'BINANCE':
      return fetchBinance(args);
    case 'OKX':
      return fetchOkx(args);
    default:
      throw new Error(`Unknown exchange: ${exchange}`);
  }
}
