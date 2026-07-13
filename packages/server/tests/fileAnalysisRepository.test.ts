import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PositionEvaluation } from '@zugzwang/analysis';
import type { StoredAnalysisJob } from '../src/analysis/analysisJobManager.js';
import { FileAnalysisRepository } from '../src/analysis/fileAnalysisRepository.js';

const directories: string[] = [];
const FEN = '8/8/8/8/8/8/4K3/7k w - - 0 1';

function evaluation(): PositionEvaluation {
  return {
    score: { type: 'cp', value: 0 },
    winPercent: 50,
    bestMove: 'e2e3',
    depth: 26,
    nodes: 100,
    timeMs: 1,
    nps: 100_000,
    secondLine: null,
  };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('FileAnalysisRepository', () => {
  it('persists jobs and cache atomically across repository instances', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zugzwang-analysis-'));
    directories.push(directory);
    const path = join(directory, 'analysis.json');
    const job: StoredAnalysisJob = {
      id: 'job-1',
      status: 'running',
      profile: 'maximum',
      engine: 'stockfish-test',
      progress: { done: 0, total: 1 },
      results: {},
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:00:00.000Z',
      items: [{ key: '0', fen: FEN, multiPv: 2 }],
    };
    const first = new FileAnalysisRepository(path);
    await first.saveJob(job);
    await first.saveCache({
      engine: 'stockfish-test',
      fen: FEN,
      quality: { depth: 26, multiPv: 2 },
      evaluation: evaluation(),
    });

    const second = new FileAnalysisRepository(path);
    expect((await second.getJob(job.id))?.status).toBe('running');
    expect((await second.listResumableJobs()).map((current) => current.id)).toEqual(['job-1']);
    expect(await second.findCache('stockfish-test', FEN, { depth: 22, multiPv: 1 })).toMatchObject({
      depth: 26,
      bestMove: 'e2e3',
    });
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ version: 1 });
  });

  it('recovers the write queue after a transient persistence failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zugzwang-analysis-recovery-'));
    directories.push(directory);
    const path = join(directory, 'analysis.json');
    const repository = new FileAnalysisRepository(path);
    await expect(repository.getJob('missing')).resolves.toBeNull();
    await mkdir(path);
    const job: StoredAnalysisJob = {
      id: 'job-recovery',
      status: 'queued',
      profile: 'fast',
      engine: 'stockfish-test',
      progress: { done: 0, total: 1 },
      results: {},
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:00:00.000Z',
      items: [{ key: '0', fen: FEN, multiPv: 1 }],
    };

    await expect(repository.saveJob(job)).rejects.toBeDefined();
    await rm(path, { recursive: true });
    job.status = 'running';
    await expect(repository.saveJob(job)).resolves.toBeUndefined();
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
      jobs: { 'job-recovery': { status: 'running' } },
    });
  });
});
