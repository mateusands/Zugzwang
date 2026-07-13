import { describe, expect, it, vi } from 'vitest';
import type { AnalysisItemRequest, AnalysisQuality, PositionEvaluation } from '@zugzwang/analysis';
import {
  AnalysisJobManager,
  MemoryAnalysisRepository,
  type PositionAnalyzer,
  type StoredAnalysisJob,
} from '../src/analysis/analysisJobManager.js';

const FENS = [
  '8/8/8/8/8/8/4K3/7k w - - 0 1',
  '8/8/8/8/8/8/4K3/6k1 b - - 0 1',
  '8/8/8/8/8/8/4K3/5k2 w - - 0 1',
  '8/8/8/8/8/8/4K3/4k3 b - - 0 1',
];

function evaluation(depth: number, bestMove = 'e2e3'): PositionEvaluation {
  return {
    score: { type: 'cp', value: 12 },
    winPercent: 51,
    bestMove,
    depth,
    nodes: 10_000,
    timeMs: 20,
    nps: 500_000,
    secondLine: null,
  };
}

async function terminal(manager: AnalysisJobManager, id: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const job = await manager.get(id);
    if (job && ['completed', 'failed', 'cancelled'].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error('job did not finish');
}

describe('AnalysisJobManager', () => {
  it('runs positions in parallel without exceeding the analyzer pool', async () => {
    let active = 0;
    let maximumActive = 0;
    const analyze = vi.fn(async (_item: AnalysisItemRequest, quality: AnalysisQuality) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 8));
      active -= 1;
      return evaluation(quality.depth);
    });
    const analyzers: PositionAnalyzer[] = [
      { engine: 'stockfish-test', analyze },
      { engine: 'stockfish-test', analyze },
    ];
    const manager = new AnalysisJobManager({
      analyzers,
      repository: new MemoryAnalysisRepository(),
    });

    const created = await manager.submit({
      profile: 'deep',
      items: FENS.map((fen, index) => ({ key: String(index), fen, multiPv: 1 })),
    });
    const completed = await terminal(manager, created.id);

    expect(maximumActive).toBe(2);
    expect(completed.status).toBe('completed');
    expect(completed.progress).toEqual({ done: 4, total: 4 });
    expect(Object.keys(completed.results)).toHaveLength(4);
  });

  it('runs a newly queued fast position before pending deep refinement', async () => {
    const releases: Array<() => void> = [];
    const started: string[] = [];
    const analyzer: PositionAnalyzer = {
      engine: 'stockfish-test',
      analyze: (item, quality) => {
        started.push(`${quality.depth}:${item.key}`);
        return new Promise((resolve) => {
          releases.push(() => resolve(evaluation(quality.depth)));
        });
      },
    };
    const manager = new AnalysisJobManager({
      analyzers: [analyzer],
      repository: new MemoryAnalysisRepository(),
    });

    const deep = await manager.submit({
      profile: 'deep',
      items: FENS.slice(0, 2).map((fen, index) => ({ key: `deep-${index}`, fen, multiPv: 1 })),
    });
    await vi.waitFor(() => expect(started).toEqual(['22:deep-0']));
    const fast = await manager.submit({
      profile: 'fast',
      items: [{ key: 'fast-new', fen: FENS[2] ?? '', multiPv: 1 }],
    });

    releases.shift()?.();
    await vi.waitFor(() => expect(started).toEqual(['22:deep-0', '18:fast-new']));
    releases.shift()?.();
    await vi.waitFor(() => expect(started).toEqual(['22:deep-0', '18:fast-new', '22:deep-1']));
    releases.shift()?.();

    expect((await terminal(manager, fast.id)).status).toBe('completed');
    expect((await terminal(manager, deep.id)).status).toBe('completed');
  });

  it('reuses sufficiently deep cache without calling an analyzer', async () => {
    const repository = new MemoryAnalysisRepository();
    await repository.saveCache({
      engine: 'stockfish-test',
      fen: FENS[0] ?? '',
      quality: { depth: 26, multiPv: 2 },
      evaluation: evaluation(26),
    });
    const analyze = vi.fn(async () => evaluation(22));
    const manager = new AnalysisJobManager({
      analyzers: [{ engine: 'stockfish-test', analyze }],
      repository,
    });

    const created = await manager.submit({
      profile: 'deep',
      items: [{ key: 'cached', fen: FENS[0] ?? '', multiPv: 1 }],
    });
    const completed = await terminal(manager, created.id);

    expect(analyze).not.toHaveBeenCalled();
    expect(completed.results.cached?.depth).toBe(26);
  });

  it('aborts active work and never starts pending items after cancellation', async () => {
    let started = 0;
    let aborted = false;
    const analyzer: PositionAnalyzer = {
      engine: 'stockfish-test',
      analyze: (_item, _quality, signal) => {
        started += 1;
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            reject(new DOMException('cancelled', 'AbortError'));
          });
        });
      },
    };
    const manager = new AnalysisJobManager({
      analyzers: [analyzer],
      repository: new MemoryAnalysisRepository(),
    });
    const created = await manager.submit({
      profile: 'maximum',
      items: FENS.slice(0, 2).map((fen, index) => ({ key: String(index), fen, multiPv: 2 })),
    });
    await vi.waitFor(() => expect(started).toBe(1));

    const cancelled = await manager.cancel(created.id);
    await vi.waitFor(() => expect(aborted).toBe(true));

    expect(cancelled?.status).toBe('cancelled');
    expect(started).toBe(1);
  });

  it('aborts sibling work when one position makes the job fail', async () => {
    let siblingAborted = false;
    const failing: PositionAnalyzer = {
      engine: 'stockfish-test',
      analyze: async () => {
        await new Promise((resolve) => setTimeout(resolve, 2));
        throw new Error('engine crashed');
      },
    };
    const sibling: PositionAnalyzer = {
      engine: 'stockfish-test',
      analyze: (_item, _quality, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            siblingAborted = true;
            reject(new DOMException('cancelled', 'AbortError'));
          });
        }),
    };
    const manager = new AnalysisJobManager({
      analyzers: [failing, sibling],
      repository: new MemoryAnalysisRepository(),
    });

    const created = await manager.submit({
      profile: 'deep',
      items: FENS.slice(0, 2).map((fen, index) => ({ key: String(index), fen, multiPv: 1 })),
    });
    const failed = await terminal(manager, created.id);

    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('engine crashed');
    await vi.waitFor(() => expect(siblingAborted).toBe(true));
  });

  it('resumes only missing positions from an interrupted persisted job', async () => {
    const repository = new MemoryAnalysisRepository();
    const interrupted: StoredAnalysisJob = {
      id: 'interrupted',
      status: 'running',
      profile: 'deep',
      engine: 'stockfish-test',
      progress: { done: 1, total: 2 },
      results: { first: evaluation(22) },
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:01:00.000Z',
      items: [
        { key: 'first', fen: FENS[0] ?? '', multiPv: 1 },
        { key: 'missing', fen: FENS[1] ?? '', multiPv: 1 },
      ],
    };
    await repository.saveJob(interrupted);
    const analyze = vi.fn(async () => evaluation(22, 'e2f3'));
    const manager = new AnalysisJobManager({
      analyzers: [{ engine: 'stockfish-test', analyze }],
      repository,
    });

    await manager.resume();
    const completed = await terminal(manager, interrupted.id);

    expect(analyze).toHaveBeenCalledOnce();
    expect(completed.status).toBe('completed');
    expect(completed.progress).toEqual({ done: 2, total: 2 });
    expect(completed.results.first?.bestMove).toBe('e2e3');
    expect(completed.results.missing?.bestMove).toBe('e2f3');
  });
});
