import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { readdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import {
  parseBestMove,
  parseInfoLine,
  turnOfFen,
  winPercent,
  type AnalysisItemRequest,
  type AnalysisQuality,
  type EvaluationLine,
  type InfoEvaluation,
  type PositionEvaluation,
} from '@zugzwang/analysis';
import type { PositionAnalyzer } from './analysisJobManager.js';

export interface UciProcessTransport {
  write(command: string): void;
  onLine(listener: (line: string) => void): void;
  onError(listener: (error: unknown) => void): void;
  onExit(listener: (code: number | null) => void): void;
  kill(): void;
}

interface ActiveSearch {
  turn: ReturnType<typeof turnOfFen>;
  multiPv: 1 | 2;
  latest: Map<number, InfoEvaluation>;
  signal: AbortSignal;
  onAbort: () => void;
  cancelled: boolean;
  resolve: (evaluation: PositionEvaluation) => void;
  reject: (error: unknown) => void;
}

function toLine(info: InfoEvaluation, bestMove = info.pv[0] ?? null): EvaluationLine {
  const total = info.wdl ? info.wdl.white + info.wdl.draw + info.wdl.black : 0;
  return {
    score: info.score,
    winPercent:
      info.wdl && total > 0
        ? ((info.wdl.white + info.wdl.draw / 2) * 100) / total
        : winPercent(info.score),
    bestMove,
    depth: info.depth,
  };
}

export class StockfishProcess implements PositionAnalyzer {
  readonly engine: string;
  readonly #transport: UciProcessTransport;
  readonly #threads: number;
  readonly #hashMb: number;
  #initialized = false;
  #initializing: Promise<void> | null = null;
  #initResolve: (() => void) | null = null;
  #initReject: ((error: unknown) => void) | null = null;
  #activeMultiPv: 1 | 2 = 1;
  #search: ActiveSearch | null = null;
  #disposed = false;

  constructor(
    transport: UciProcessTransport,
    options: { engine: string; threads: number; hashMb: number },
  ) {
    this.#transport = transport;
    this.engine = options.engine;
    this.#threads = options.threads;
    this.#hashMb = options.hashMb;
    transport.onLine((line) => this.#onLine(line));
    transport.onError((error) => this.#fail(error));
    transport.onExit((code) => {
      if (!this.#disposed) this.#fail(new Error(`Stockfish exited with code ${String(code)}`));
    });
  }

  init(): Promise<void> {
    if (this.#initialized) return Promise.resolve();
    if (this.#initializing) return this.#initializing;
    this.#initializing = new Promise((resolve, reject) => {
      this.#initResolve = resolve;
      this.#initReject = reject;
    });
    this.#transport.write('uci');
    return this.#initializing;
  }

  analyze(
    item: AnalysisItemRequest,
    quality: AnalysisQuality,
    signal: AbortSignal,
  ): Promise<PositionEvaluation> {
    if (!this.#initialized) return Promise.reject(new Error('Stockfish is not initialized'));
    if (this.#search) return Promise.reject(new Error('Stockfish process is already searching'));
    if (signal.aborted) return Promise.reject(new DOMException('analysis cancelled', 'AbortError'));

    return new Promise((resolve, reject) => {
      const search: ActiveSearch = {
        turn: turnOfFen(item.fen),
        multiPv: quality.multiPv,
        latest: new Map(),
        signal,
        onAbort: () => {
          if (this.#search !== search || search.cancelled) return;
          search.cancelled = true;
          this.#transport.write('stop');
        },
        cancelled: false,
        resolve,
        reject,
      };
      this.#search = search;
      signal.addEventListener('abort', search.onAbort, { once: true });
      if (quality.multiPv !== this.#activeMultiPv) {
        this.#transport.write(`setoption name MultiPV value ${quality.multiPv}`);
        this.#activeMultiPv = quality.multiPv;
      }
      this.#transport.write(`position fen ${item.fen}`);
      this.#transport.write(`go depth ${quality.depth}`);
    });
  }

  dispose(): void {
    this.#disposed = true;
    if (this.#search) this.#settleError(new DOMException('analysis cancelled', 'AbortError'));
    this.#transport.write('quit');
    this.#transport.kill();
  }

  #onLine(line: string): void {
    if (!this.#initialized) {
      if (line.startsWith('uciok')) {
        this.#transport.write(`setoption name Threads value ${this.#threads}`);
        this.#transport.write(`setoption name Hash value ${this.#hashMb}`);
        this.#transport.write('setoption name UCI_ShowWDL value true');
        this.#transport.write('setoption name MultiPV value 1');
        this.#transport.write('isready');
      } else if (line.startsWith('readyok')) {
        this.#initialized = true;
        this.#initResolve?.();
      }
      return;
    }

    const search = this.#search;
    if (!search) return;
    const bestMove = parseBestMove(line);
    if (bestMove !== undefined) {
      if (search.cancelled) {
        this.#settleError(new DOMException('analysis cancelled', 'AbortError'));
        return;
      }
      const primary = search.latest.get(1);
      if (!primary) {
        this.#settleError(new Error('Stockfish returned no principal evaluation'));
        return;
      }
      const secondary = search.multiPv === 2 ? (search.latest.get(2) ?? null) : null;
      this.#settleSuccess({
        ...toLine(primary, bestMove),
        nodes: primary.nodes,
        timeMs: primary.timeMs,
        nps: primary.nps,
        secondLine: secondary ? toLine(secondary) : null,
      });
      return;
    }

    if (search.cancelled) return;
    const info = parseInfoLine(line, search.turn);
    if (!info || info.multiPv > search.multiPv) return;
    const previous = search.latest.get(info.multiPv);
    if (!previous || info.depth >= previous.depth) search.latest.set(info.multiPv, info);
  }

  #settleSuccess(evaluation: PositionEvaluation): void {
    const search = this.#takeSearch();
    search?.resolve(evaluation);
  }

  #settleError(error: unknown): void {
    const search = this.#takeSearch();
    search?.reject(error);
  }

  #takeSearch(): ActiveSearch | null {
    const search = this.#search;
    this.#search = null;
    if (search) search.signal.removeEventListener('abort', search.onAbort);
    return search;
  }

  #fail(error: unknown): void {
    this.#initReject?.(error);
    this.#settleError(error);
  }
}

export function computeStockfishResources(
  logicalCpuCount: number,
  requested: { poolSize?: number; totalHashMb?: number } = {},
): { poolSize: number; threadsPerEngine: number; hashMbPerEngine: number } {
  const cpuCount = Math.max(1, Math.floor(logicalCpuCount));
  const availableCpu = Math.max(1, cpuCount - 1);
  const defaultPool = Math.min(2, Math.max(1, Math.floor(cpuCount / 2)));
  const poolSize = Math.min(
    Math.max(1, Math.floor(requested.poolSize ?? defaultPool)),
    availableCpu,
  );
  const threadsPerEngine = Math.max(1, Math.floor(availableCpu / poolSize));
  const totalHashMb = Math.max(16, Math.floor(requested.totalHashMb ?? 512));
  return {
    poolSize,
    threadsPerEngine,
    hashMbPerEngine: Math.max(16, Math.floor(totalHashMb / poolSize)),
  };
}

export function resolveStockfishScript(): string {
  const require = createRequire(import.meta.url);
  const packageRoot = dirname(require.resolve('stockfish/package.json'));
  const bin = join(packageRoot, 'bin');
  const script = readdirSync(bin).find((file) => /^stockfish-\d+\.js$/.test(file));
  if (!script) throw new Error('Stockfish full script was not found');
  return join(bin, script);
}

export function createChildProcessTransport(scriptPath: string): UciProcessTransport {
  const child = spawn(process.execPath, [scriptPath], {
    cwd: dirname(scriptPath),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const lines = createInterface({ input: child.stdout });
  return {
    write: (command) => child.stdin.write(`${command}\n`),
    onLine: (listener) => lines.on('line', listener),
    onError: (listener) => child.on('error', listener),
    onExit: (listener) => child.on('exit', listener),
    kill: () => child.kill(),
  };
}

export async function createStockfishPool(
  options: {
    poolSize?: number;
    totalHashMb?: number;
    scriptPath?: string;
    engine?: string;
  } = {},
): Promise<StockfishProcess[]> {
  const resources = computeStockfishResources(cpus().length, options);
  const scriptPath = options.scriptPath ?? resolveStockfishScript();
  const engines = Array.from({ length: resources.poolSize }, () => {
    const engine = new StockfishProcess(createChildProcessTransport(scriptPath), {
      engine: options.engine ?? 'stockfish-18-full',
      threads: resources.threadsPerEngine,
      hashMb: resources.hashMbPerEngine,
    });
    return engine;
  });
  try {
    await Promise.all(engines.map((engine) => engine.init()));
    return engines;
  } catch (error) {
    for (const engine of engines) engine.dispose();
    throw error;
  }
}
