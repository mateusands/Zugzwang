import type {
  AnalysisItemRequest,
  AnalysisJobSnapshot,
  AnalysisProfile,
  PositionEvaluation,
} from '@zugzwang/analysis';

const API = '/api/analysis';
const DEFAULT_POLL_INTERVAL_MS = 150;

export interface AnalysisBackendStatus {
  available: boolean;
  engine: string | null;
}

export interface AnalyzeBatchOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  onResults?: (results: Record<string, PositionEvaluation>) => void;
  /** Reduzido a zero somente nos testes; produÃ§Ã£o evita polling agressivo. */
  pollIntervalMs?: number;
}

function abortError(): DOMException {
  return new DOMException('game review cancelled', 'AbortError');
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

function delay(milliseconds: number, signal: AbortSignal | undefined): Promise<void> {
  if (milliseconds <= 0) {
    throwIfAborted(signal);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isScore(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    (value.type === 'cp' && isFiniteNumber(value.value)) ||
    (value.type === 'mate' &&
      isFiniteNumber(value.movesToMate) &&
      (value.winner === 'white' || value.winner === 'black'))
  );
}

function isEvaluationLine(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isScore(value.score) &&
    isFiniteNumber(value.winPercent) &&
    value.winPercent >= 0 &&
    value.winPercent <= 100 &&
    (typeof value.bestMove === 'string' || value.bestMove === null) &&
    isFiniteNumber(value.depth) &&
    value.depth >= 0
  );
}

function isPositionEvaluation(value: unknown): value is PositionEvaluation {
  if (!isEvaluationLine(value) || !isRecord(value)) return false;
  return (
    isFiniteNumber(value.nodes) &&
    value.nodes >= 0 &&
    isFiniteNumber(value.timeMs) &&
    value.timeMs >= 0 &&
    isFiniteNumber(value.nps) &&
    value.nps >= 0 &&
    (value.secondLine === null || isEvaluationLine(value.secondLine))
  );
}

function isSnapshot(value: unknown): value is AnalysisJobSnapshot {
  if (!isRecord(value) || !isRecord(value.progress) || !isRecord(value.results)) return false;
  return (
    typeof value.id === 'string' &&
    ['queued', 'running', 'completed', 'failed', 'cancelled'].includes(String(value.status)) &&
    ['fast', 'deep', 'maximum'].includes(String(value.profile)) &&
    typeof value.engine === 'string' &&
    Number.isInteger(value.progress.done) &&
    Number.isInteger(value.progress.total) &&
    Object.values(value.results).every(isPositionEvaluation) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

async function readSnapshot(response: Response): Promise<AnalysisJobSnapshot> {
  if (!response.ok) throw new Error(`analysis backend returned HTTP ${response.status}`);
  const value: unknown = await response.json();
  if (!isSnapshot(value)) throw new Error('analysis backend returned an invalid snapshot');
  return value;
}

export async function checkAnalysisBackend(signal?: AbortSignal): Promise<AnalysisBackendStatus> {
  try {
    const response = await fetch(`${API}/health`, { signal });
    if (!response.ok) return { available: false, engine: null };
    const value: unknown = await response.json();
    if (!isRecord(value) || value.status !== 'ok' || typeof value.engine !== 'string') {
      return { available: false, engine: null };
    }
    return { available: true, engine: value.engine };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { available: false, engine: null };
  }
}

export async function analyzePositionBatch(
  items: AnalysisItemRequest[],
  profile: AnalysisProfile,
  options: AnalyzeBatchOptions = {},
): Promise<Record<string, PositionEvaluation>> {
  if (items.length === 0) return {};
  throwIfAborted(options.signal);
  let jobId: string | null = null;
  let terminal = false;
  try {
    const submitted = await readSnapshot(
      await fetch(`${API}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, items }),
        signal: options.signal,
      }),
    );
    jobId = submitted.id;
    let snapshot = submitted;

    while (true) {
      options.onProgress?.(snapshot.progress.done, snapshot.progress.total);
      options.onResults?.(snapshot.results);
      if (snapshot.status === 'completed') {
        terminal = true;
        for (const item of items) {
          if (!(item.key in snapshot.results)) {
            throw new Error(`analysis backend omitted result ${item.key}`);
          }
        }
        return snapshot.results;
      }
      if (snapshot.status === 'failed') {
        terminal = true;
        throw new Error(snapshot.error ?? 'analysis job failed');
      }
      if (snapshot.status === 'cancelled') {
        terminal = true;
        throw abortError();
      }

      await delay(options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS, options.signal);
      throwIfAborted(options.signal);
      snapshot = await readSnapshot(
        await fetch(`${API}/jobs/${encodeURIComponent(jobId)}`, { signal: options.signal }),
      );
    }
  } catch (error) {
    if (jobId && !terminal) {
      await fetch(`${API}/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' }).catch(() => {});
    }
    if (options.signal?.aborted) throw abortError();
    throw error;
  }
}
