import {
  goCommand,
  parseBestMove,
  parseInfoLine,
  positionCommand,
  turnOfFen,
  type EngineColor,
  type InfoEvaluation,
  type Score,
} from './uci.js';
import { winPercent } from './winprob.js';

// Cliente do Stockfish sobre um transporte abstrato (o Worker real, ou um
// fake nos testes). Cuida do handshake UCI, do streaming de progresso e do
// cancelamento serializado: uma busca nova só arranca depois que o `bestmove`
// da busca cancelada chega, para nunca haver duas buscas disputando as linhas.

export interface EngineTransport {
  postMessage(command: string): void;
  onLine(listener: (line: string) => void): void;
  onError(listener: (error: unknown) => void): void;
  terminate(): void;
}

export interface Evaluation {
  score: Score;
  winPercent: number;
  /** Melhor lance (UCI); null em posição terminal. */
  bestMove: string | null;
  depth: number;
  secondLine: EvaluationLine | null;
}

export interface EvaluationLine {
  score: Score;
  winPercent: number;
  bestMove: string | null;
  depth: number;
}

/** Rejeição de uma avaliação superada por outra (ou pelo dispose). */
export class EvaluationCancelledError extends Error {
  constructor() {
    super('evaluation cancelled');
    this.name = 'EvaluationCancelledError';
  }
}

export interface EvaluateOptions {
  onProgress?: (partial: Evaluation) => void;
  limit?: { depth: number } | { movetime: number };
  multiPv?: 1 | 2;
  /** `false` força uma busca nova (usado ao aprofundar uma candidata). */
  useCache?: boolean;
  signal?: AbortSignal;
}

interface Request {
  fen: string;
  turn: EngineColor;
  onProgress: ((partial: Evaluation) => void) | undefined;
  limit: { depth: number } | { movetime: number };
  multiPv: 1 | 2;
  resolve: (value: Evaluation | null) => void;
  reject: (error: unknown) => void;
  latest: Map<number, InfoEvaluation>;
  signal: AbortSignal | undefined;
  onAbort: (() => void) | undefined;
}

interface CacheEntry {
  evaluation: Evaluation;
  limit: { depth: number } | { movetime: number };
  multiPv: 1 | 2;
}

const CACHE_LIMIT = 256;
const MAX_LIVE_DEPTH_REUSE_MS = 400;

function toEvaluationLine(info: InfoEvaluation, bestMove = info.pv[0] ?? null): EvaluationLine {
  const total = info.wdl ? info.wdl.white + info.wdl.draw + info.wdl.black : 0;
  return {
    score: info.score,
    winPercent:
      info.wdl && total > 0
        ? ((info.wdl.white + info.wdl.draw / 2) / total) * 100
        : winPercent(info.score),
    bestMove,
    depth: info.depth,
  };
}

function toEvaluation(
  primary: InfoEvaluation,
  bestMove: string | null,
  secondary: InfoEvaluation | null,
): Evaluation {
  return {
    ...toEvaluationLine(primary, bestMove),
    secondLine: secondary ? toEvaluationLine(secondary) : null,
  };
}

export class StockfishClient {
  readonly #transport: EngineTransport;
  readonly #threads: number;
  readonly #depth: number;

  #initPromise: Promise<void> | null = null;
  #initResolve: (() => void) | null = null;
  #initReject: ((error: unknown) => void) | null = null;
  #initialized = false;
  #activeMultiPv: 1 | 2 = 1;
  readonly #cache = new Map<string, CacheEntry[]>();

  /** Busca que está recebendo linhas do motor (pode já estar cancelada). */
  #current: Request | null = null;
  /** A busca corrente foi cancelada e só aguardamos seu `bestmove`. */
  #currentCancelled = false;
  /** Busca a iniciar assim que a corrente terminar. */
  #queued: Request | null = null;

  constructor(transport: EngineTransport, options: { threads: number; depth: number }) {
    this.#transport = transport;
    this.#threads = options.threads;
    this.#depth = options.depth;
    transport.onLine((line) => this.#onLine(line));
    transport.onError((error) => this.#onError(error));
  }

  /** Handshake UCI. Idempotente: chamadas repetidas compartilham a promise. */
  init(): Promise<void> {
    if (this.#initPromise) return this.#initPromise;
    this.#initPromise = new Promise((resolve, reject) => {
      this.#initResolve = resolve;
      this.#initReject = reject;
    });
    this.#transport.postMessage('uci');
    return this.#initPromise;
  }

  evaluate(fen: string, options: EvaluateOptions = {}): Promise<Evaluation | null> {
    if (options.signal?.aborted) return Promise.reject(new EvaluationCancelledError());
    const limit = options.limit ?? { depth: this.#depth };
    const multiPv = options.multiPv ?? 1;
    if (options.useCache !== false) {
      const cached = this.#cached(fen, limit, multiPv);
      if (cached) return Promise.resolve(cached);
    }
    return new Promise((resolve, reject) => {
      const request: Request = {
        fen,
        turn: turnOfFen(fen),
        onProgress: options.onProgress,
        limit,
        multiPv,
        resolve,
        reject,
        latest: new Map(),
        signal: options.signal,
        onAbort: undefined,
      };

      if (this.#current === null) {
        this.#start(request);
      } else if (!this.#currentCancelled) {
        // Cancela a busca corrente e enfileira a nova; a nova só arranca
        // depois que o `bestmove` da cancelada chegar.
        this.#reject(this.#current, new EvaluationCancelledError());
        this.#currentCancelled = true;
        this.#transport.postMessage('stop');
        this.#queued = request;
      } else {
        // Já parando: substitui a que estava na fila.
        if (this.#queued) this.#reject(this.#queued, new EvaluationCancelledError());
        this.#queued = request;
      }

      if (request.signal) {
        request.onAbort = () => this.#abort(request);
        request.signal.addEventListener('abort', request.onAbort, { once: true });
      }
    });
  }

  dispose(): void {
    this.#transport.terminate();
    if (this.#current && !this.#currentCancelled) {
      this.#reject(this.#current, new EvaluationCancelledError());
    }
    if (this.#queued) this.#reject(this.#queued, new EvaluationCancelledError());
    this.#current = null;
    this.#currentCancelled = false;
    this.#queued = null;
  }

  #start(request: Request): void {
    this.#current = request;
    this.#currentCancelled = false;
    if (request.multiPv !== this.#activeMultiPv) {
      this.#transport.postMessage(`setoption name MultiPV value ${request.multiPv}`);
      this.#activeMultiPv = request.multiPv;
    }
    this.#transport.postMessage(positionCommand(request.fen));
    this.#transport.postMessage(goCommand(request.limit));
  }

  #abort(request: Request): void {
    if (this.#queued === request) {
      this.#queued = null;
      this.#reject(request, new EvaluationCancelledError());
      return;
    }
    if (this.#current !== request || this.#currentCancelled) return;
    this.#reject(request, new EvaluationCancelledError());
    this.#currentCancelled = true;
    this.#transport.postMessage('stop');
  }

  #detachAbort(request: Request): void {
    if (request.signal && request.onAbort) {
      request.signal.removeEventListener('abort', request.onAbort);
      request.onAbort = undefined;
    }
  }

  #reject(request: Request, error: unknown): void {
    this.#detachAbort(request);
    request.reject(error);
  }

  #resolve(request: Request, evaluation: Evaluation | null): void {
    this.#detachAbort(request);
    request.resolve(evaluation);
  }

  #onLine(line: string): void {
    if (!this.#initialized) {
      this.#handleHandshake(line);
      return;
    }
    if (this.#current === null) return;

    const bestMove = parseBestMove(line);
    if (bestMove !== undefined) {
      this.#finishCurrent(bestMove);
      return;
    }

    if (this.#currentCancelled) return; // ignora linhas da busca cancelada
    const info = parseInfoLine(line, this.#current.turn);
    if (info === null) return;
    const previous = this.#current.latest.get(info.multiPv);
    if (!previous || info.depth >= previous.depth) {
      this.#current.latest.set(info.multiPv, info);
    }
    if (info.multiPv === 1) {
      this.#current.onProgress?.(
        toEvaluation(info, info.pv[0] ?? null, this.#current.latest.get(2) ?? null),
      );
    }
  }

  #handleHandshake(line: string): void {
    if (line.startsWith('uciok')) {
      this.#transport.postMessage('setoption name MultiPV value 1');
      this.#transport.postMessage('setoption name Hash value 64');
      this.#transport.postMessage('setoption name UCI_ShowWDL value true');
      if (this.#threads > 1) {
        this.#transport.postMessage(`setoption name Threads value ${this.#threads}`);
      }
      this.#transport.postMessage('isready');
    } else if (line.startsWith('readyok')) {
      this.#initialized = true;
      this.#initResolve?.();
    }
  }

  #finishCurrent(bestMove: string | null): void {
    const finished = this.#current;
    const wasCancelled = this.#currentCancelled;
    this.#current = null;
    this.#currentCancelled = false;

    if (finished && !wasCancelled) {
      const primary = finished.latest.get(1);
      const evaluation = primary
        ? toEvaluation(
            primary,
            bestMove,
            finished.multiPv === 2 ? (finished.latest.get(2) ?? null) : null,
          )
        : null;
      if (evaluation) this.#remember(finished.fen, evaluation, finished.limit, finished.multiPv);
      this.#resolve(finished, evaluation);
    }

    if (this.#queued) {
      const next = this.#queued;
      this.#queued = null;
      this.#start(next);
    }
  }

  #onError(error: unknown): void {
    if (!this.#initialized) {
      this.#initReject?.(error);
      return;
    }
    if (this.#current && !this.#currentCancelled) this.#reject(this.#current, error);
    if (this.#queued) this.#reject(this.#queued, error);
    this.#current = null;
    this.#currentCancelled = false;
    this.#queued = null;
  }

  #cached(
    fen: string,
    requestedLimit: { depth: number } | { movetime: number },
    requestedMultiPv: 1 | 2,
  ): Evaluation | null {
    const entries = this.#cache.get(fen);
    const match = entries?.find(
      (entry) =>
        entry.multiPv >= requestedMultiPv && this.#limitSatisfies(entry.limit, requestedLimit),
    );
    if (!match) return null;
    // Atualiza a recência do FEN no LRU.
    this.#cache.delete(fen);
    this.#cache.set(fen, entries ?? []);
    return requestedMultiPv === 1 ? { ...match.evaluation, secondLine: null } : match.evaluation;
  }

  #limitSatisfies(
    cached: { depth: number } | { movetime: number },
    requested: { depth: number } | { movetime: number },
  ): boolean {
    if ('depth' in requested) return 'depth' in cached && cached.depth >= requested.depth;
    if ('depth' in cached) {
      return cached.depth >= this.#depth && requested.movetime <= MAX_LIVE_DEPTH_REUSE_MS;
    }
    return cached.movetime >= requested.movetime;
  }

  #remember(
    fen: string,
    evaluation: Evaluation,
    limit: { depth: number } | { movetime: number },
    multiPv: 1 | 2,
  ): void {
    const achievedLimit = 'depth' in limit ? { depth: evaluation.depth } : limit;
    const entries = this.#cache.get(fen) ?? [];
    const next = [
      { evaluation, limit: achievedLimit, multiPv },
      ...entries.filter(
        (entry) =>
          entry.multiPv !== multiPv ||
          JSON.stringify(entry.limit) !== JSON.stringify(achievedLimit),
      ),
    ].slice(0, 4);
    this.#cache.delete(fen);
    this.#cache.set(fen, next);
    if (this.#cache.size > CACHE_LIMIT) {
      const oldest = this.#cache.keys().next().value as string | undefined;
      if (oldest) this.#cache.delete(oldest);
    }
  }
}

/** Transporte real: embrulha um Web Worker (o script do stockfish.js). */
export function createWorkerTransport(url: string): EngineTransport {
  const worker = new Worker(url);
  return {
    postMessage: (command) => worker.postMessage(command),
    onLine: (listener) => {
      worker.addEventListener('message', (event: MessageEvent) => {
        if (typeof event.data === 'string') listener(event.data);
      });
    },
    onError: (listener) => {
      worker.addEventListener('error', (event) => listener(event));
    },
    terminate: () => worker.terminate(),
  };
}
