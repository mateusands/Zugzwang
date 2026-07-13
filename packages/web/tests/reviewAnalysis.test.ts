import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzePositionBatch, checkAnalysisBackend } from '../src/analysisApi.js';
import { createReviewAnalysisStrategy } from '../src/reviewAnalysis.js';
import { getSharedEngine } from '../src/useEvaluation.js';

vi.mock('../src/analysisApi.js', () => ({
  analyzePositionBatch: vi.fn(),
  checkAnalysisBackend: vi.fn(),
}));

vi.mock('../src/useEvaluation.js', () => ({
  getSharedEngine: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('review analysis strategy', () => {
  it('prefere o backend completo e nao carrega o WASM local antecipadamente', async () => {
    vi.mocked(checkAnalysisBackend).mockResolvedValue({
      available: true,
      engine: 'stockfish-18-full',
    });
    vi.mocked(analyzePositionBatch).mockResolvedValue({});

    const strategy = await createReviewAnalysisStrategy();
    await strategy.batchEvaluate?.([], 'fast');

    expect(strategy.source).toBe('server');
    expect(analyzePositionBatch).toHaveBeenCalled();
    expect(getSharedEngine).not.toHaveBeenCalled();
  });

  it('usa o motor do navegador sob demanda quando o backend esta indisponivel', async () => {
    const evaluation = { bestMove: 'e2e4' };
    vi.mocked(checkAnalysisBackend).mockResolvedValue({ available: false, engine: null });
    vi.mocked(getSharedEngine).mockResolvedValue({
      evaluate: vi.fn().mockResolvedValue(evaluation),
    } as never);

    const strategy = await createReviewAnalysisStrategy();

    expect(strategy.source).toBe('browser');
    expect(strategy.batchEvaluate).toBeUndefined();
    expect(getSharedEngine).not.toHaveBeenCalled();
    await expect(strategy.evaluate('fen', { limit: { movetime: 120 }, multiPv: 1 })).resolves.toBe(
      evaluation,
    );
    expect(getSharedEngine).toHaveBeenCalledTimes(1);
  });
});
