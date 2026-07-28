import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzePositionBatch, checkAnalysisBackend } from '../src/analysisApi.js';

const FEN = '8/8/8/8/8/8/8/K6k w - - 0 1';

interface FakeEventSource {
  url: string;
  closed: boolean;
  emit(type: string, data: unknown): void;
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function evaluation() {
  return {
    score: { type: 'cp' as const, value: 12 },
    winPercent: 51,
    bestMove: 'a1a2',
    depth: 18,
    nodes: 42_000,
    timeMs: 120,
    nps: 350_000,
    secondLine: null,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('analysis backend API', () => {
  it('detecta quando o Stockfish completo esta disponivel', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(response({ status: 'ok', engine: 'stockfish-18-full' }));
    vi.stubGlobal('fetch', fetch);

    await expect(checkAnalysisBackend()).resolves.toEqual({
      available: true,
      engine: 'stockfish-18-full',
    });
    expect(fetch).toHaveBeenCalledWith('/api/analysis/health', expect.any(Object));
  });

  it('submete um lote assincrono e acompanha o progresso ate terminar', async () => {
    const queued = {
      id: 'job-1',
      status: 'queued',
      profile: 'fast',
      engine: 'stockfish-18-full',
      progress: { done: 0, total: 1 },
      results: {},
      createdAt: '2026-07-13T12:00:00.000Z',
      updatedAt: '2026-07-13T12:00:00.000Z',
    };
    const running = { ...queued, status: 'running', progress: { done: 0, total: 1 } };
    const completed = {
      ...queued,
      status: 'completed',
      progress: { done: 1, total: 1 },
      results: { start: evaluation() },
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(queued, 202))
      .mockResolvedValueOnce(response(running))
      .mockResolvedValueOnce(response(completed));
    vi.stubGlobal('fetch', fetch);
    const onProgress = vi.fn();
    const onResults = vi.fn();

    const results = await analyzePositionBatch([{ key: 'start', fen: FEN, multiPv: 1 }], 'fast', {
      onProgress,
      onResults,
      pollIntervalMs: 0,
    });

    expect(results).toEqual({ start: evaluation() });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/analysis/jobs',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/analysis/jobs/job-1', expect.any(Object));
    expect(onProgress).toHaveBeenLastCalledWith(1, 1);
    expect(onResults).toHaveBeenLastCalledWith({ start: evaluation() });
  });

  /**
   * Spec: acompanhar um job por polling gerava um GET a cada 150 ms enquanto o
   * Stockfish pensava — dezenas de requisições por posição, e uma pré-análise
   * roda a cada lance. O server já publica o progresso em
   * `GET /analysis/jobs/:id/events` (SSE), então o web assina o stream e a
   * requisição repetida some.
   *
   * Dado um navegador com EventSource,
   * Quando o job é submetido e o server empurra os snapshots,
   * Então nenhum GET de consulta é disparado e o resultado vem do stream.
   */
  it('acompanha o job pelo stream de eventos, sem GET repetido', async () => {
    const queued = {
      id: 'job-sse',
      status: 'queued',
      profile: 'fast',
      engine: 'stockfish-18-full',
      progress: { done: 0, total: 1 },
      results: {},
      createdAt: '2026-07-13T12:00:00.000Z',
      updatedAt: '2026-07-13T12:00:00.000Z',
    };
    const completed = {
      ...queued,
      status: 'completed',
      progress: { done: 1, total: 1 },
      results: { start: evaluation() },
    };
    const fetch = vi.fn().mockResolvedValue(response(queued, 202));
    vi.stubGlobal('fetch', fetch);
    const opened: string[] = [];
    const sources: FakeEventSource[] = [];
    vi.stubGlobal(
      'EventSource',
      class FakeEventSourceImpl {
        readonly listeners = new Map<string, ((event: MessageEvent) => void)[]>();
        closed = false;
        constructor(readonly url: string) {
          opened.push(url);
          sources.push(this as unknown as FakeEventSource);
        }
        addEventListener(type: string, listener: (event: MessageEvent) => void) {
          this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
        }
        removeEventListener() {}
        close() {
          this.closed = true;
        }
        emit(type: string, data: unknown) {
          for (const listener of this.listeners.get(type) ?? []) {
            listener(new MessageEvent(type, { data: JSON.stringify(data) }));
          }
        }
      },
    );
    const onProgress = vi.fn();

    const promise = analyzePositionBatch([{ key: 'start', fen: FEN, multiPv: 1 }], 'fast', {
      onProgress,
    });
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    sources[0]?.emit('snapshot', completed);

    await expect(promise).resolves.toEqual({ start: evaluation() });
    expect(opened).toEqual(['/api/analysis/jobs/job-sse/events']);
    expect(sources[0]?.closed).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1); // só o POST de submissão
    expect(onProgress).toHaveBeenLastCalledWith(1, 1);
  });

  it('rejeita uma avaliacao malformada em vez de contaminar a revisao', async () => {
    const completed = {
      id: 'job-invalid',
      status: 'completed',
      profile: 'fast',
      engine: 'stockfish-18-full',
      progress: { done: 1, total: 1 },
      results: { start: { depth: Number.NaN } },
      createdAt: '2026-07-13T12:00:00.000Z',
      updatedAt: '2026-07-13T12:00:00.000Z',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(completed, 202)));

    await expect(
      analyzePositionBatch([{ key: 'start', fen: FEN, multiPv: 1 }], 'fast'),
    ).rejects.toThrow('invalid snapshot');
  });

  it('cancela o job remoto quando o usuario interrompe a revisao', async () => {
    const controller = new AbortController();
    const queued = {
      id: 'job-cancel',
      status: 'queued',
      profile: 'maximum',
      engine: 'stockfish-18-full',
      progress: { done: 0, total: 1 },
      results: {},
      createdAt: '2026-07-13T12:00:00.000Z',
      updatedAt: '2026-07-13T12:00:00.000Z',
    };
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        queueMicrotask(() => controller.abort());
        return response(queued, 202);
      }
      if (init?.method === 'DELETE') return response({ ...queued, status: 'cancelled' });
      throw new Error('consulta inesperada');
    });
    vi.stubGlobal('fetch', fetch);

    await expect(
      analyzePositionBatch([{ key: 'start', fen: FEN, multiPv: 2 }], 'maximum', {
        signal: controller.signal,
        pollIntervalMs: 0,
      }),
    ).rejects.toHaveProperty('name', 'AbortError');
    expect(fetch).toHaveBeenCalledWith('/api/analysis/jobs/job-cancel', { method: 'DELETE' });
  });
});
