import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { cacheSatisfies, type AnalysisQuality, type PositionEvaluation } from '@zugzwang/analysis';
import type {
  AnalysisCacheEntry,
  AnalysisRepository,
  StoredAnalysisJob,
} from './analysisJobManager.js';

interface RepositoryState {
  version: 1;
  jobs: Record<string, StoredAnalysisJob>;
  cache: AnalysisCacheEntry[];
}

const EMPTY_STATE: RepositoryState = { version: 1, jobs: {}, cache: [] };
const MAX_CACHE_ENTRIES = 20_000;
/**
 * Teto do histórico de jobs. O arquivo é reescrito inteiro a cada save, então
 * ele não pode crescer sem limite. Jobs `queued`/`running` nunca são
 * descartados — o `resume()` depende deles depois de um reinício.
 */
const MAX_JOBS = 500;

function isResumable(job: StoredAnalysisJob): boolean {
  return job.status === 'queued' || job.status === 'running';
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function parseState(raw: string): RepositoryState {
  try {
    const parsed = JSON.parse(raw) as Partial<RepositoryState> | null;
    if (
      parsed?.version !== 1 ||
      typeof parsed.jobs !== 'object' ||
      parsed.jobs === null ||
      Array.isArray(parsed.jobs) ||
      !Array.isArray(parsed.cache)
    ) {
      return clone(EMPTY_STATE);
    }
    return {
      version: 1,
      jobs: parsed.jobs as Record<string, StoredAnalysisJob>,
      cache: parsed.cache as AnalysisCacheEntry[],
    };
  } catch {
    return clone(EMPTY_STATE);
  }
}

export class FileAnalysisRepository implements AnalysisRepository {
  readonly #path: string;
  readonly #maxJobs: number;
  #state: RepositoryState | null = null;
  #loading: Promise<void> | null = null;
  #writeChain: Promise<void> = Promise.resolve();
  /** Escrita já agendada mas ainda não iniciada — chamadores novos a reusam. */
  #scheduledWrite: Promise<void> | null = null;

  constructor(path: string, options: { maxJobs?: number } = {}) {
    this.#path = path;
    this.#maxJobs = options.maxJobs ?? MAX_JOBS;
  }

  async saveJob(job: StoredAnalysisJob): Promise<void> {
    await this.#ready();
    this.#requiredState().jobs[job.id] = clone(job);
    this.#pruneJobs();
    await this.#persist();
  }

  async getJob(id: string): Promise<StoredAnalysisJob | null> {
    await this.#ready();
    const job = this.#requiredState().jobs[id];
    return job ? clone(job) : null;
  }

  async listResumableJobs(): Promise<StoredAnalysisJob[]> {
    await this.#ready();
    return Object.values(this.#requiredState().jobs)
      .filter((job) => job.status === 'queued' || job.status === 'running')
      .map(clone);
  }

  async findCache(
    engine: string,
    fen: string,
    quality: AnalysisQuality,
  ): Promise<PositionEvaluation | null> {
    await this.#ready();
    const entry = this.#requiredState()
      .cache.filter(
        (current) =>
          current.engine === engine &&
          current.fen === fen &&
          cacheSatisfies(current.quality, quality),
      )
      .sort((a, b) => b.quality.depth - a.quality.depth)[0];
    return entry ? clone(entry.evaluation) : null;
  }

  async saveCache(entry: AnalysisCacheEntry): Promise<void> {
    await this.#ready();
    const state = this.#requiredState();
    state.cache = state.cache.filter(
      (current) =>
        current.engine !== entry.engine ||
        current.fen !== entry.fen ||
        current.quality.depth !== entry.quality.depth ||
        current.quality.multiPv !== entry.quality.multiPv,
    );
    state.cache.push(clone(entry));
    if (state.cache.length > MAX_CACHE_ENTRIES) {
      state.cache.splice(0, state.cache.length - MAX_CACHE_ENTRIES);
    }
    await this.#persist();
  }

  async #ready(): Promise<void> {
    if (this.#state) return;
    if (!this.#loading) {
      this.#loading = readFile(this.#path, 'utf8')
        .then((raw) => {
          this.#state = parseState(raw);
        })
        .catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          this.#state = clone(EMPTY_STATE);
        });
    }
    await this.#loading;
  }

  #requiredState(): RepositoryState {
    if (!this.#state) throw new Error('analysis repository was not initialized');
    return this.#state;
  }

  /** Descarta os jobs encerrados mais antigos até caber em `#maxJobs`. */
  #pruneJobs(): void {
    const state = this.#requiredState();
    const ids = Object.keys(state.jobs);
    let excess = ids.length - this.#maxJobs;
    if (excess <= 0) return;
    const evictable = ids
      .filter((id) => {
        const job = state.jobs[id];
        return job !== undefined && !isResumable(job);
      })
      .sort((left, right) =>
        (state.jobs[left]?.updatedAt ?? '').localeCompare(state.jobs[right]?.updatedAt ?? ''),
      );
    for (const id of evictable) {
      if (excess <= 0) break;
      delete state.jobs[id];
      excess -= 1;
    }
  }

  /**
   * Grava o estado inteiro, colapsando escritas concorrentes: enquanto uma
   * escrita está em voo, no máximo UMA outra fica agendada e todos os
   * chamadores do intervalo esperam por ela. Como o JSON só é serializado
   * quando a escrita roda, a escrita colapsada já inclui todas as mutações —
   * elas são aplicadas ao estado em memória antes de chamar este método.
   */
  #persist(): Promise<void> {
    if (this.#scheduledWrite) return this.#scheduledWrite;
    const write = this.#writeChain
      .catch(() => undefined)
      .then(async () => {
        this.#scheduledWrite = null;
        await this.#writeState();
      });
    this.#scheduledWrite = write;
    this.#writeChain = write.catch(() => undefined);
    return write;
  }

  async #writeState(): Promise<void> {
    const payload = `${JSON.stringify(this.#requiredState())}\n`;
    const temporary = `${this.#path}.${process.pid}.${randomUUID()}.tmp`;
    await mkdir(dirname(this.#path), { recursive: true });
    try {
      await writeFile(temporary, payload, 'utf8');
      await rename(temporary, this.#path);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
