import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PositionEvaluation } from '@zugzwang/analysis';
import type { StoredAnalysisJob } from '../src/analysis/analysisJobManager.js';
import { FileAnalysisRepository } from '../src/analysis/fileAnalysisRepository.js';

// `writeFile` fica espionável para medir a amplificação de escrita — o resto do
// módulo continua real, porque os testes conferem o arquivo no disco.
vi.mock('node:fs/promises', async (importActual) => {
  const actual = await importActual<typeof import('node:fs/promises')>();
  return { ...actual, writeFile: vi.fn(actual.writeFile) };
});

const directories: string[] = [];
const FEN = '8/8/8/8/8/8/4K3/7k w - - 0 1';

function storedJob(id: string, overrides: Partial<StoredAnalysisJob> = {}): StoredAnalysisJob {
  return {
    id,
    status: 'completed',
    profile: 'fast',
    engine: 'stockfish-test',
    progress: { done: 1, total: 1 },
    results: {},
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
    items: [{ key: '0', fen: FEN, multiPv: 1 }],
    ...overrides,
  };
}

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

  /**
   * Spec: the persisted file is rewritten whole on every save, so the total
   * number of stored jobs has a ceiling. Only finished jobs are evictable, and
   * the oldest go first; queued/running ones are never dropped, because
   * `resume()` needs them after a restart (so a burst of them may exceed the
   * ceiling on purpose).
   *
   * Given a ceiling of 3 jobs and one of them interrupted,
   * When a fourth finished job is saved,
   * Then the oldest finished job is gone and the interrupted one survives.
   */
  it('evicts the oldest finished jobs beyond the retention limit', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zugzwang-analysis-retention-'));
    directories.push(directory);
    const path = join(directory, 'analysis.json');
    const repository = new FileAnalysisRepository(path, { maxJobs: 3 });

    await repository.saveJob(storedJob('running-old', { status: 'running' }));
    await repository.saveJob(storedJob('done-1', { updatedAt: '2026-07-13T00:01:00.000Z' }));
    await repository.saveJob(storedJob('done-2', { updatedAt: '2026-07-13T00:02:00.000Z' }));
    await repository.saveJob(storedJob('done-3', { updatedAt: '2026-07-13T00:03:00.000Z' }));

    expect(await repository.getJob('done-1')).toBeNull();
    expect(await repository.getJob('done-3')).not.toBeNull();
    expect((await repository.listResumableJobs()).map((job) => job.id)).toEqual(['running-old']);
    const onDisk = JSON.parse(await readFile(path, 'utf8')) as { jobs: Record<string, unknown> };
    expect(Object.keys(onDisk.jobs).sort()).toEqual(['done-2', 'done-3', 'running-old']);
  });

  /**
   * Spec: every save rewrites the whole file, so concurrent saves must collapse
   * into a single write instead of one write per call. The state is serialised
   * when the write actually runs, so a coalesced write still contains every
   * mutation made before it.
   *
   * Given ten cache entries saved concurrently,
   * When all of them settle,
   * Then far fewer than ten writes reached the disk and none of the entries was lost.
   */
  it('coalesces concurrent saves into a single write without losing entries', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zugzwang-analysis-coalesce-'));
    directories.push(directory);
    const path = join(directory, 'analysis.json');
    const repository = new FileAnalysisRepository(path);
    await repository.getJob('warm-up'); // carrega o estado antes de medir
    vi.mocked(writeFile).mockClear();

    const fens = Array.from({ length: 10 }, (_, index) => `${FEN} ${index}`);
    await Promise.all(
      fens.map((fen) =>
        repository.saveCache({
          engine: 'stockfish-test',
          fen,
          quality: { depth: 18, multiPv: 1 },
          evaluation: evaluation(),
        }),
      ),
    );

    expect(vi.mocked(writeFile).mock.calls.length).toBeLessThanOrEqual(3);
    const onDisk = JSON.parse(await readFile(path, 'utf8')) as { cache: { fen: string }[] };
    expect(onDisk.cache.map((entry) => entry.fen).sort()).toEqual([...fens].sort());
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
