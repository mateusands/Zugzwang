import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { AnalysisJobSnapshot } from '@zugzwang/analysis';
import { createApp } from '../src/app.js';
import type { AnalysisJobs } from '../src/analysis/analysisRoutes.js';

const FEN = '8/8/8/8/8/8/4K3/7k w - - 0 1';

function snapshot(status: AnalysisJobSnapshot['status'] = 'queued'): AnalysisJobSnapshot {
  return {
    id: 'job-1',
    status,
    profile: 'deep',
    engine: 'stockfish-test',
    progress: { done: 0, total: 1 },
    results: {},
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
  };
}

function fakeJobs(): AnalysisJobs {
  return {
    engine: 'stockfish-test',
    submit: vi.fn(async () => snapshot()),
    get: vi.fn(async (id) => (id === 'job-1' ? snapshot() : null)),
    cancel: vi.fn(async (id) => (id === 'job-1' ? snapshot('cancelled') : null)),
    subscribe: vi.fn(() => () => undefined),
  };
}

describe('analysis job routes', () => {
  it('reports whether the full analysis backend is available', async () => {
    expect(
      (await request(createApp({ analysisJobs: fakeJobs() })).get('/analysis/health')).body,
    ).toEqual({
      status: 'ok',
      engine: 'stockfish-test',
    });
    const unavailable = await request(createApp()).get('/analysis/health');
    expect(unavailable.status).toBe(503);
    expect(unavailable.body).toEqual({ status: 'unavailable' });
  });

  it('returns 202 immediately for a valid batch', async () => {
    const jobs = fakeJobs();
    const app = createApp({ analysisJobs: jobs });

    const response = await request(app)
      .post('/analysis/jobs')
      .send({ profile: 'deep', items: [{ key: '0', fen: FEN, multiPv: 2 }] });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ id: 'job-1', status: 'queued' });
    expect(jobs.submit).toHaveBeenCalledOnce();
  });

  it('rejects invalid batches before reaching the queue', async () => {
    const jobs = fakeJobs();
    const app = createApp({ analysisJobs: jobs });

    const response = await request(app).post('/analysis/jobs').send({ profile: 'infinite' });

    expect(response.status).toBe(400);
    expect(jobs.submit).not.toHaveBeenCalled();
  });

  it('gets and cancels a resumable job, returning 404 for unknown ids', async () => {
    const app = createApp({ analysisJobs: fakeJobs() });

    expect((await request(app).get('/analysis/jobs/job-1')).status).toBe(200);
    expect((await request(app).delete('/analysis/jobs/job-1')).body.status).toBe('cancelled');
    expect((await request(app).get('/analysis/jobs/missing')).status).toBe(404);
  });

  it('returns a controlled error when persistence or the engine backend fails', async () => {
    const jobs = fakeJobs();
    vi.mocked(jobs.submit).mockRejectedValue(new Error('disk unavailable'));

    const response = await request(createApp({ analysisJobs: jobs }))
      .post('/analysis/jobs')
      .send({ profile: 'fast', items: [{ key: '0', fen: FEN, multiPv: 1 }] })
      .timeout(250);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'analysis backend unavailable' });
  });
});
