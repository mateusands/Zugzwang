import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzePositionBatch, checkAnalysisBackend } from './analysisApi.js';
import { pendingDeepReviewItems, type ReviewCache } from './gameReview.js';
import {
  isObsoleteLiveBatch,
  liveReviewItems,
  mergeLiveReviewResults,
  pruneLiveReviewCache,
} from './liveReview.js';
import type { GameState } from './api.js';

/**
 * Pré-análise em segundo plano durante a partida.
 *
 * A cada lance, manda ao backend a passagem rápida das posições ainda sem
 * avaliação e depois refina as mais críticas — um item profundo por job, para
 * o outro processo do Stockfish ficar livre para a posição rápida do lance
 * seguinte. Quando a partida acaba, a revisão final só precisa concluir o que
 * não chegou ao cache.
 *
 * Fica fora do componente porque coordena estado assíncrono de vida própria
 * (batches, cancelamento, dedupe de posições em voo) que não pertence à
 * árvore de render.
 */

interface LiveAnalysisBatch {
  fens: string[];
  controller: AbortController;
}

/**
 * Por quanto tempo a resposta de `/analysis/health` continua valendo. Sem
 * isto, cada lance abriria uma requisição a mais só para reconfirmar algo que
 * praticamente não muda durante a partida.
 */
const BACKEND_STATUS_TTL_MS = 30_000;

export interface LiveReview {
  /** Avaliações já concluídas, podadas para as posições da partida atual. */
  cache: ReviewCache;
  /** O backend não respondeu ou a análise falhou — a pré-análise não está rodando. */
  unavailable: boolean;
  /** Zera o trabalho em voo e o cache (partida nova ou restaurada). */
  reset: (cache?: ReviewCache) => void;
}

export function useLiveReview(game: GameState | null, over: boolean): LiveReview {
  const [cache, setCache] = useState<ReviewCache>({});
  const [unavailable, setUnavailable] = useState(false);
  const cacheRef = useRef<ReviewCache>({});
  const batches = useRef(new Map<number, LiveAnalysisBatch>());
  const inFlight = useRef(new Set<string>());
  const sequence = useRef(0);
  const gameId = useRef<string | null>(null);
  const gameFens = useRef<string[]>([]);
  const backendStatus = useRef<{ at: number; available: boolean } | null>(null);

  cacheRef.current = cache;
  gameFens.current = game?.fens ?? [];

  const cancel = useCallback(() => {
    for (const batch of batches.current.values()) batch.controller.abort();
    batches.current.clear();
    inFlight.current.clear();
  }, []);

  const reset = useCallback(
    (next: ReviewCache = {}) => {
      cancel();
      gameId.current = null;
      backendStatus.current = null; // partida nova reconfere o backend
      setUnavailable(false);
      setCache(next);
    },
    [cancel],
  );

  /** Saúde do backend, reaproveitada dentro da janela do TTL. */
  const backendAvailable = useCallback(async (signal: AbortSignal): Promise<boolean> => {
    const cached = backendStatus.current;
    if (cached && Date.now() - cached.at < BACKEND_STATUS_TTL_MS) return cached.available;
    const status = await checkAnalysisBackend(signal);
    backendStatus.current = { at: Date.now(), available: status.available };
    return status.available;
  }, []);

  useEffect(() => {
    if (!game) {
      cancel();
      gameId.current = null;
      return;
    }
    if (gameId.current !== game.id) {
      cancel();
      gameId.current = game.id;
    }

    for (const [batchId, batch] of batches.current) {
      if (!isObsoleteLiveBatch(batch.fens, game.fens)) continue;
      batch.controller.abort();
      for (const fen of batch.fens) inFlight.current.delete(fen);
      batches.current.delete(batchId);
    }
    setCache((current) => pruneLiveReviewCache(current, game.fens));

    if (over) {
      cancel();
      return;
    }

    const quickItems = liveReviewItems(game.history, game.fens, cacheRef.current, inFlight.current);
    const reviewSource = {
      sans: game.history,
      fens: game.fens,
      // Uma linha em andamento precisa da avaliação de sua posição atual.
      result: {
        kind: 'draw' as const,
        status: 'in_progress',
        resigned: true,
        winner: null,
      },
    };
    const initialDeepItems =
      quickItems.length === 0
        ? pendingDeepReviewItems(reviewSource, cacheRef.current).filter(
            (item) => !inFlight.current.has(item.fen),
          )
        : [];
    if (quickItems.length === 0 && initialDeepItems.length === 0) return;

    const controller = new AbortController();
    const batchId = ++sequence.current;
    const trackBatch = (fens: string[]) => {
      const previous = batches.current.get(batchId);
      for (const fen of previous?.fens ?? []) inFlight.current.delete(fen);
      if (fens.length === 0) {
        batches.current.delete(batchId);
        return;
      }
      for (const fen of fens) inFlight.current.add(fen);
      batches.current.set(batchId, { fens, controller });
    };
    const mergeResults = (
      items: typeof quickItems,
      results: Parameters<typeof mergeLiveReviewResults>[2],
      quality: 'quick' | 'deep',
    ) => {
      if (controller.signal.aborted) return cacheRef.current;
      const next = pruneLiveReviewCache(
        mergeLiveReviewResults(cacheRef.current, items, results, quality),
        gameFens.current,
      );
      cacheRef.current = next;
      setCache(next);
      return next;
    };
    trackBatch((quickItems.length > 0 ? quickItems : initialDeepItems).map((item) => item.fen));

    void backendAvailable(controller.signal)
      .then(async (available) => {
        if (!available) {
          setUnavailable(true);
          return;
        }
        if (controller.signal.aborted) return;
        setUnavailable(false);
        let current = cacheRef.current;
        if (quickItems.length > 0) {
          const results = await analyzePositionBatch(quickItems, 'fast', {
            signal: controller.signal,
            onResults: (partial) => {
              current = mergeResults(quickItems, partial, 'quick');
            },
          });
          current = mergeResults(quickItems, results, 'quick');
          trackBatch([]);
        }
        if (controller.signal.aborted) return;

        const deepItems = (
          quickItems.length > 0 ? pendingDeepReviewItems(reviewSource, current) : initialDeepItems
        ).filter((item) => !inFlight.current.has(item.fen));
        if (deepItems.length === 0) return;
        trackBatch(deepItems.map((item) => item.fen));

        // Um item profundo por job reserva o outro processo Stockfish para a
        // posição fast do próximo lance.
        for (const item of deepItems) {
          if (controller.signal.aborted) break;
          const results = await analyzePositionBatch([item], 'deep', {
            signal: controller.signal,
            onResults: (partial) => {
              current = mergeResults([item], partial, 'deep');
            },
          });
          current = mergeResults([item], results, 'deep');
        }
      })
      .catch((error: unknown) => {
        // Cancelamento é fluxo normal (lance novo, takeback, fim de partida);
        // qualquer outra falha significa que a pré-análise parou de verdade e
        // precisa aparecer, em vez de sumir num catch vazio.
        if (controller.signal.aborted || (error as Error | null)?.name === 'AbortError') return;
        setUnavailable(true);
      })
      .finally(() => {
        trackBatch([]);
      });
  }, [backendAvailable, cancel, game, over]);

  useEffect(() => () => cancel(), [cancel]);

  return { cache, unavailable, reset };
}
