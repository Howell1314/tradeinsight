/**
 * WorkerClient：封装 postMessage → Promise，支持取消。
 *
 * 用法：
 *   const client = getWorkerClient();
 *   const { values } = await client.calcIndicator('MACD', [12,26,9], klines, { signal });
 */
import type {
  IndicatorConfig,
  KLine,
  ChartTrade,
  WorkerRequest,
  WorkerResponse,
  BacktestResult,
} from '../lib/types';

let _worker: Worker | null = null;
let _client: WorkerClient | null = null;

export function getWorkerClient(): WorkerClient {
  if (_client) return _client;
  // Vite 的 worker 导入方式
  const IndicatorWorker = new Worker(
    new URL('./indicator.worker.ts', import.meta.url),
    { type: 'module' }
  );
  _worker = IndicatorWorker;
  _client = new WorkerClient(IndicatorWorker);
  return _client;
}

export function disposeWorkerClient() {
  _worker?.terminate();
  _worker = null;
  _client = null;
}

type Pending = {
  resolve: (v: WorkerResponse) => void;
  reject: (e: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

export class WorkerClient {
  private pending = new Map<string, Pending>();
  private seq = 0;
  private worker: Worker;

  constructor(worker: Worker) {
    this.worker = worker;
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      const p = this.pending.get(msg.reqId);
      if (!p) return; // 已取消
      this.pending.delete(msg.reqId);
      if (p.signal && p.onAbort) p.signal.removeEventListener('abort', p.onAbort);
      if (msg.kind === 'error') {
        p.reject(new Error(msg.message));
      } else {
        p.resolve(msg);
      }
    };
    this.worker.onerror = (e) => {
      // 整个 worker 挂了，reject 所有 pending
      for (const p of this.pending.values()) {
        p.reject(new Error(`Worker error: ${e.message}`));
      }
      this.pending.clear();
    };
  }

  private nextId() {
    return `w_${Date.now()}_${++this.seq}`;
  }

  private send<T extends WorkerResponse>(
    req: WorkerRequest,
    signal?: AbortSignal
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (req.kind === 'cancel') {
        this.worker.postMessage(req);
        resolve(undefined as unknown as T);
        return;
      }
      const reqId = req.reqId;
      const onAbort = () => {
        this.pending.delete(reqId);
        this.worker.postMessage({ kind: 'cancel', reqId } satisfies WorkerRequest);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      if (signal) {
        if (signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }
      this.pending.set(reqId, {
        resolve: (v) => resolve(v as T),
        reject,
        signal,
        onAbort,
      });
      this.worker.postMessage(req);
    });
  }

  calcIndicator(
    cfg: Pick<IndicatorConfig, 'name' | 'params'>,
    klines: KLine[],
    opts?: { signal?: AbortSignal }
  ) {
    const reqId = this.nextId();
    return this.send<
      Extract<WorkerResponse, { kind: 'indicator_result' }>
    >(
      {
        kind: 'calc_indicator',
        reqId,
        name: cfg.name,
        params: cfg.params,
        klines,
      },
      opts?.signal
    );
  }

  runStrategy(
    strategy: string,
    params: Record<string, unknown>,
    klines: KLine[],
    opts?: { signal?: AbortSignal }
  ): Promise<{ trades: ChartTrade[]; metrics: BacktestResult['metrics'] }> {
    const reqId = this.nextId();
    return this.send<
      Extract<WorkerResponse, { kind: 'strategy_result' }>
    >(
      { kind: 'run_strategy', reqId, strategy, params, klines },
      opts?.signal
    ).then((r) => ({ trades: r.trades, metrics: r.metrics }));
  }
}
