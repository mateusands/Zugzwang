import { randomUUID } from 'node:crypto';
import {
  analysisProfileDepth,
  cacheSatisfies,
  type AnalysisItemRequest,
  type AnalysisJobRequest,
  type AnalysisJobSnapshot,
  type AnalysisProfile,
  type AnalysisQuality,
  type PositionEvaluation,
} from '@zugzwang/analysis';

export interface PositionAnalyzer {
  readonly engine: string;
  analyze(
    item: AnalysisItemRequest,
    quality: AnalysisQuality,
    signal: AbortSignal,
  ): Promise<PositionEvaluation>;
  dispose?(): Promise<void> | void;
}

export interface AnalysisCacheEntry {
  engine: string;
  fen: string;
  quality: AnalysisQuality;
  evaluation: PositionEvaluation;
}

export interface StoredAnalysisJob extends AnalysisJobSnapshot {
  items: AnalysisItemRequest[];
}

export interface AnalysisRepository {
  saveJob(job: StoredAnalysisJob): Promise<void>;
  getJob(id: string): Promise<StoredAnalysisJob | null>;
  listResumableJobs(): Promise<StoredAnalysisJob[]>;
  findCache(
    engine: string,
    fen: string,
    quality: AnalysisQuality,
  ): Promise<PositionEvaluation | null>;
  saveCache(entry: AnalysisCacheEntry): Promise<void>;
}

function cloneJob(job: StoredAnalysisJob): StoredAnalysisJob {
  return structuredClone(job);
}

export class MemoryAnalysisRepository implements AnalysisRepository {
  readonly #jobs = new Map<string, StoredAnalysisJob>();
  readonly #cache: AnalysisCacheEntry[] = [];

  async saveJob(job: StoredAnalysisJob): Promise<void> {
    this.#jobs.set(job.id, cloneJob(job));
  }

  async getJob(id: string): Promise<StoredAnalysisJob | null> {
    const job = this.#jobs.get(id);
    return job ? cloneJob(job) : null;
  }

  async listResumableJobs(): Promise<StoredAnalysisJob[]> {
    return [...this.#jobs.values()]
      .filter((job) => job.status === 'queued' || job.status === 'running')
      .map(cloneJob);
  }

  async findCache(
    engine: string,
    fen: string,
    quality: AnalysisQuality,
  ): Promise<PositionEvaluation | null> {
    const match = this.#cache
      .filter(
        (entry) =>
          entry.engine === engine && entry.fen === fen && cacheSatisfies(entry.quality, quality),
      )
      .sort((a, b) => b.quality.depth - a.quality.depth)[0];
    return match ? structuredClone(match.evaluation) : null;
  }

  async saveCache(entry: AnalysisCacheEntry): Promise<void> {
    const duplicate = this.#cache.findIndex(
      (current) =>
        current.engine === entry.engine &&
        current.fen === entry.fen &&
        current.quality.depth === entry.quality.depth &&
        current.quality.multiPv === entry.quality.multiPv,
    );
    if (duplicate >= 0) this.#cache.splice(duplicate, 1);
    this.#cache.push(structuredClone(entry));
  }
}

interface PendingTask {
  jobId: string;
  item: AnalysisItemRequest;
}

const PROFILE_PRIORITY: Record<AnalysisProfile, number> = {
  fast: 0,
  deep: 1,
  maximum: 2,
};

type JobListener = (snapshot: AnalysisJobSnapshot) => void;

function publicSnapshot(job: StoredAnalysisJob): AnalysisJobSnapshot {
  const { items: _items, ...snapshot } = job;
  return structuredClone(snapshot);
}

function isTerminal(status: AnalysisJobSnapshot['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

function isAbort(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

export class AnalysisJobManager {
  readonly #analyzers: PositionAnalyzer[];
  readonly #repository: AnalysisRepository;
  readonly #now: () => Date;
  readonly #id: () => string;
  readonly #profileDepth: (profile: AnalysisProfile) => number;
  readonly #jobs = new Map<string, StoredAnalysisJob>();
  readonly #pending: PendingTask[] = [];
  readonly #idle = new Set<number>();
  readonly #active = new Map<string, AbortController>();
  readonly #listeners = new Map<string, Set<JobListener>>();

  constructor(options: {
    analyzers: PositionAnalyzer[];
    repository: AnalysisRepository;
    now?: () => Date;
    id?: () => string;
    profileDepth?: (profile: AnalysisProfile) => number;
  }) {
    if (options.analyzers.length === 0) throw new Error('at least one analyzer is required');
    const engine = options.analyzers[0]?.engine;
    if (!options.analyzers.every((analyzer) => analyzer.engine === engine)) {
      throw new Error('all analyzers must use the same engine version');
    }
    this.#analyzers = options.analyzers;
    this.#repository = options.repository;
    this.#now = options.now ?? (() => new Date());
    this.#id = options.id ?? randomUUID;
    this.#profileDepth = options.profileDepth ?? analysisProfileDepth;
    options.analyzers.forEach((_analyzer, index) => this.#idle.add(index));
  }

  get engine(): string {
    return this.#analyzers[0]?.engine ?? 'unknown';
  }

  async submit(request: AnalysisJobRequest): Promise<AnalysisJobSnapshot> {
    const timestamp = this.#now().toISOString();
    const job: StoredAnalysisJob = {
      id: this.#id(),
      status: 'queued',
      profile: request.profile,
      engine: this.#analyzers[0]?.engine ?? 'unknown',
      progress: { done: 0, total: request.items.length },
      results: {},
      createdAt: timestamp,
      updatedAt: timestamp,
      items: structuredClone(request.items),
    };
    this.#jobs.set(job.id, job);
    this.#enqueue(job.items.map((item) => ({ jobId: job.id, item })));
    await this.#repository.saveJob(job);
    queueMicrotask(() => this.#drain());
    return publicSnapshot(job);
  }

  async get(id: string): Promise<AnalysisJobSnapshot | null> {
    const local = this.#jobs.get(id);
    if (local) return publicSnapshot(local);
    const stored = await this.#repository.getJob(id);
    return stored ? publicSnapshot(stored) : null;
  }

  async resume(): Promise<void> {
    const currentEngine = this.#analyzers[0]?.engine ?? 'unknown';
    for (const stored of await this.#repository.listResumableJobs()) {
      if (this.#jobs.has(stored.id)) continue;
      if (stored.engine !== currentEngine) {
        stored.engine = currentEngine;
        stored.results = {};
        stored.progress = { done: 0, total: stored.items.length };
      }
      stored.status = 'queued';
      delete stored.error;
      stored.updatedAt = this.#now().toISOString();
      this.#jobs.set(stored.id, stored);
      this.#enqueue(
        stored.items
          .filter((item) => !(item.key in stored.results))
          .map((item) => ({ jobId: stored.id, item })),
      );
      await this.#repository.saveJob(stored);
    }
    this.#drain();
  }

  async cancel(id: string): Promise<AnalysisJobSnapshot | null> {
    const job = this.#jobs.get(id) ?? (await this.#repository.getJob(id));
    if (!job) return null;
    if (isTerminal(job.status)) return publicSnapshot(job);
    this.#jobs.set(id, job);
    job.status = 'cancelled';
    job.updatedAt = this.#now().toISOString();
    for (const [taskKey, controller] of this.#active) {
      if (taskKey.startsWith(`${id}:`)) controller.abort();
    }
    await this.#saveAndEmit(job);
    return publicSnapshot(job);
  }

  subscribe(id: string, listener: JobListener): () => void {
    const listeners = this.#listeners.get(id) ?? new Set<JobListener>();
    listeners.add(listener);
    this.#listeners.set(id, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.#listeners.delete(id);
    };
  }

  async dispose(): Promise<void> {
    for (const controller of this.#active.values()) controller.abort();
    await Promise.all(this.#analyzers.map((analyzer) => analyzer.dispose?.()));
  }

  #enqueue(tasks: PendingTask[]): void {
    this.#pending.push(...tasks);
    this.#pending.sort((left, right) => {
      const leftJob = this.#jobs.get(left.jobId);
      const rightJob = this.#jobs.get(right.jobId);
      return (
        PROFILE_PRIORITY[leftJob?.profile ?? 'maximum'] -
        PROFILE_PRIORITY[rightJob?.profile ?? 'maximum']
      );
    });
  }

  #drain(): void {
    while (this.#idle.size > 0 && this.#pending.length > 0) {
      const analyzerIndex = this.#idle.values().next().value as number | undefined;
      const task = this.#pending.shift();
      if (analyzerIndex === undefined || !task) return;
      const job = this.#jobs.get(task.jobId);
      if (!job || isTerminal(job.status) || task.item.key in job.results) continue;
      this.#idle.delete(analyzerIndex);
      let persistRunning = false;
      if (job.status === 'queued') {
        job.status = 'running';
        job.updatedAt = this.#now().toISOString();
        persistRunning = true;
      }
      const analyzer = this.#analyzers[analyzerIndex];
      if (!analyzer) {
        this.#idle.add(analyzerIndex);
        continue;
      }
      void this.#runTask(analyzerIndex, analyzer, task, job, persistRunning);
    }
  }

  async #runTask(
    analyzerIndex: number,
    analyzer: PositionAnalyzer,
    task: PendingTask,
    job: StoredAnalysisJob,
    persistRunning: boolean,
  ): Promise<void> {
    const quality: AnalysisQuality = {
      depth: this.#profileDepth(job.profile),
      multiPv: task.item.multiPv,
    };
    const taskKey = `${job.id}:${task.item.key}`;
    const controller = new AbortController();
    this.#active.set(taskKey, controller);
    try {
      if (persistRunning) await this.#saveAndEmit(job);
      if (isTerminal(job.status)) return;
      const cached = await this.#repository.findCache(job.engine, task.item.fen, quality);
      const result = cached ?? (await analyzer.analyze(task.item, quality, controller.signal));
      if (isTerminal(job.status)) return;
      if (!cached) {
        await this.#repository.saveCache({
          engine: job.engine,
          fen: task.item.fen,
          quality: { depth: result.depth, multiPv: task.item.multiPv },
          evaluation: result,
        });
      }
      job.results[task.item.key] = result;
      job.progress = { done: Object.keys(job.results).length, total: job.items.length };
      job.updatedAt = this.#now().toISOString();
      if (job.progress.done === job.progress.total) job.status = 'completed';
      await this.#saveAndEmit(job);
    } catch (error) {
      if (job.status !== 'cancelled' && !isAbort(error)) {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'analysis failed';
        job.updatedAt = this.#now().toISOString();
        for (const [activeKey, activeController] of this.#active) {
          if (activeKey !== taskKey && activeKey.startsWith(`${job.id}:`)) {
            activeController.abort();
          }
        }
        await this.#saveAndEmit(job).catch(() => undefined);
      }
    } finally {
      this.#active.delete(taskKey);
      this.#idle.add(analyzerIndex);
      this.#drain();
    }
  }

  async #saveAndEmit(job: StoredAnalysisJob): Promise<void> {
    await this.#repository.saveJob(job);
    const snapshot = publicSnapshot(job);
    for (const listener of this.#listeners.get(job.id) ?? []) listener(snapshot);
  }
}
