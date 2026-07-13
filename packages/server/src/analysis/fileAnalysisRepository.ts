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
  #state: RepositoryState | null = null;
  #loading: Promise<void> | null = null;
  #writeChain: Promise<void> = Promise.resolve();

  constructor(path: string) {
    this.#path = path;
  }

  async saveJob(job: StoredAnalysisJob): Promise<void> {
    await this.#ready();
    this.#requiredState().jobs[job.id] = clone(job);
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

  async #persist(): Promise<void> {
    const payload = `${JSON.stringify(this.#requiredState())}\n`;
    const temporary = `${this.#path}.${process.pid}.${randomUUID()}.tmp`;
    const write = this.#writeChain
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.#path), { recursive: true });
        try {
          await writeFile(temporary, payload, 'utf8');
          await rename(temporary, this.#path);
        } finally {
          await rm(temporary, { force: true });
        }
      });
    this.#writeChain = write.catch(() => undefined);
    await write;
  }
}
