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
}

interface Request {
  fen: string;
  turn: EngineColor;
  onProgress: ((partial: Evaluation) => void) | undefined;
  resolve: (value: Evaluation | null) => void;
  reject: (error: unknown) => void;
  latest: InfoEvaluation | null;
}

function toEvaluation(info: InfoEvaluation, bestMove: string | null): Evaluation {
  return {
    score: info.score,
    winPercent: winPercent(info.score),
    bestMove,
    depth: info.depth,
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
    return new Promise((resolve, reject) => {
      const request: Request = {
        fen,
        turn: turnOfFen(fen),
        onProgress: options.onProgress,
        resolve,
        reject,
        latest: null,
      };

      if (this.#current === null) {
        this.#start(request);
      } else if (!this.#currentCancelled) {
        // Cancela a busca corrente e enfileira a nova; a nova só arranca
        // depois que o `bestmove` da cancelada chegar.
        this.#current.reject(new EvaluationCancelledError());
        this.#currentCancelled = true;
        this.#transport.postMessage('stop');
        this.#queued = request;
      } else {
        // Já parando: substitui a que estava na fila.
        this.#queued?.reject(new EvaluationCancelledError());
        this.#queued = request;
      }
    });
  }

  dispose(): void {
    this.#transport.terminate();
    if (this.#current && !this.#currentCancelled) {
      this.#current.reject(new EvaluationCancelledError());
    }
    this.#queued?.reject(new EvaluationCancelledError());
    this.#current = null;
    this.#currentCancelled = false;
    this.#queued = null;
  }

  #start(request: Request): void {
    this.#current = request;
    this.#currentCancelled = false;
    this.#transport.postMessage(positionCommand(request.fen));
    this.#transport.postMessage(goCommand({ depth: this.#depth }));
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
    this.#current.latest = info;
    this.#current.onProgress?.(toEvaluation(info, info.pv[0] ?? null));
  }

  #handleHandshake(line: string): void {
    if (line.startsWith('uciok')) {
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
      finished.resolve(finished.latest ? toEvaluation(finished.latest, bestMove) : null);
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
    if (this.#current && !this.#currentCancelled) this.#current.reject(error);
    this.#queued?.reject(error);
    this.#current = null;
    this.#currentCancelled = false;
    this.#queued = null;
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
