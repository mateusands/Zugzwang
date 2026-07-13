import { analyzePositionBatch, checkAnalysisBackend } from './analysisApi.js';
import type { ReviewBatchEvaluator, ReviewEvaluator } from './gameReview.js';
import { getSharedEngine } from './useEvaluation.js';

export interface ReviewAnalysisStrategy {
  source: 'server' | 'browser';
  engine: string;
  evaluate: ReviewEvaluator;
  batchEvaluate?: ReviewBatchEvaluator;
}

/**
 * Seleciona o Stockfish full remoto sem inicializar o WASM local. O cliente
 * do navegador Ã© criado preguiÃ§osamente apenas se o servidor estiver fora ou
 * se um lote remoto falhar durante a revisÃ£o.
 */
export async function createReviewAnalysisStrategy(
  signal?: AbortSignal,
): Promise<ReviewAnalysisStrategy> {
  const backend = await checkAnalysisBackend(signal);
  let localEngine: ReturnType<typeof getSharedEngine> | null = null;
  const evaluate: ReviewEvaluator = async (fen, request) => {
    localEngine ??= getSharedEngine();
    const client = await localEngine;
    return client.evaluate(fen, request);
  };

  if (!backend.available || !backend.engine) {
    return { source: 'browser', engine: 'stockfish-lite-browser', evaluate };
  }

  return {
    source: 'server',
    engine: backend.engine,
    evaluate,
    batchEvaluate: (items, profile, onProgress, batchSignal, onResults) =>
      analyzePositionBatch(items, profile, {
        ...(batchSignal ? { signal: batchSignal } : {}),
        ...(onProgress ? { onProgress } : {}),
        ...(onResults ? { onResults } : {}),
      }),
  };
}
