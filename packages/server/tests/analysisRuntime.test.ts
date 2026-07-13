import { describe, expect, it, vi } from 'vitest';
import type { PositionEvaluation } from '@zugzwang/analysis';
import { createAnalysisRuntime, parseAnalysisRuntimeConfig } from '../src/analysis/runtime.js';
import {
  MemoryAnalysisRepository,
  type PositionAnalyzer,
} from '../src/analysis/analysisJobManager.js';

describe('analysis runtime configuration', () => {
  it('parses bounded pool/hash settings and a durable data path', () => {
    expect(
      parseAnalysisRuntimeConfig(
        {
          ANALYSIS_POOL_SIZE: '3',
          ANALYSIS_HASH_MB: '768',
          ANALYSIS_DATA_PATH: 'D:/zugzwang/analysis.json',
          ANALYSIS_FAST_DEPTH: '19',
          ANALYSIS_DEEP_DEPTH: '24',
          ANALYSIS_MAXIMUM_DEPTH: '30',
        },
        'C:/server',
      ),
    ).toEqual({
      poolSize: 3,
      totalHashMb: 768,
      dataPath: 'D:/zugzwang/analysis.json',
      depths: { fast: 19, deep: 24, maximum: 30 },
    });
  });

  it('creates the analyzer pool and returns a resumable manager', async () => {
    const result: PositionEvaluation = {
      score: { type: 'cp', value: 0 },
      winPercent: 50,
      bestMove: 'e2e4',
      depth: 18,
      nodes: 1,
      timeMs: 1,
      nps: 1,
      secondLine: null,
    };
    const analyzers: PositionAnalyzer[] = [
      { engine: 'stockfish-test', analyze: vi.fn(async () => result) },
    ];
    const createPool = vi.fn(async () => analyzers);

    const manager = await createAnalysisRuntime({
      config: {
        poolSize: 1,
        totalHashMb: 64,
        dataPath: 'unused.json',
        depths: { fast: 18, deep: 22, maximum: 29 },
      },
      repository: new MemoryAnalysisRepository(),
      createPool,
    });

    expect(createPool).toHaveBeenCalledWith({ poolSize: 1, totalHashMb: 64 });
    expect(manager.engine).toBe('stockfish-test');
    const created = await manager.submit({
      profile: 'maximum',
      items: [{ key: '0', fen: '8/8/8/8/8/8/4K3/7k w - - 0 1', multiPv: 1 }],
    });
    await vi.waitFor(async () => {
      expect((await manager.get(created.id))?.status).toBe('completed');
    });
    expect(analyzers[0]?.analyze).toHaveBeenCalledWith(
      expect.anything(),
      { depth: 29, multiPv: 1 },
      expect.any(AbortSignal),
    );
    await manager.dispose();
  });
});
