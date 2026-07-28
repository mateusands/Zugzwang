// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveReview } from '../src/useLiveReview.js';
import { analyzePositionBatch, checkAnalysisBackend } from '../src/analysisApi.js';
import type { GameState } from '../src/api.js';

vi.mock('../src/analysisApi.js', () => ({
  analyzePositionBatch: vi.fn(),
  checkAnalysisBackend: vi.fn(),
}));

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_A3 = 'rnbqkbnr/pppppppp/8/8/8/P7/1PPPPPPP/RNBQKBNR b KQkq - 0 1';
const AFTER_A6 = 'rnbqkbnr/1ppppppp/p7/8/8/P7/1PPPPPPP/RNBQKBNR w KQkq - 0 2';

function game(fens: string[], history: string[]): GameState {
  return {
    id: 'live',
    fen: fens.at(-1) ?? START,
    turn: 'white',
    status: 'in_progress',
    gameOver: false,
    winner: null,
    pieces: [],
    legalMoves: [],
    legalTargets: {},
    history,
    fens,
    pgn: '',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkAnalysisBackend).mockResolvedValue({
    available: true,
    engine: 'stockfish-18-full',
  });
  vi.mocked(analyzePositionBatch).mockResolvedValue({});
});

afterEach(cleanup);

describe('useLiveReview', () => {
  /**
   * Spec: a pré-análise dispara a cada lance, e ela começava perguntando
   * `GET /analysis/health` toda vez — uma requisição por lance para saber algo
   * que não muda durante a partida. A resposta passa a valer por uma janela de
   * tempo, então lances seguintes reaproveitam.
   *
   * Dado que o backend já respondeu que está disponível,
   * Quando um lance novo entra e dispara outra rodada de análise,
   * Então a saúde não é consultada de novo.
   */
  it('deve consultar a saúde do backend uma vez só ao longo dos lances', async () => {
    const { rerender } = renderHook(({ state }) => useLiveReview(state, false), {
      initialProps: { state: game([START, AFTER_A3], ['a3']) },
    });
    await waitFor(() => expect(analyzePositionBatch).toHaveBeenCalledTimes(1));

    rerender({ state: game([START, AFTER_A3, AFTER_A6], ['a3', 'a6']) });

    await waitFor(() => expect(analyzePositionBatch).toHaveBeenCalledTimes(2));
    expect(checkAnalysisBackend).toHaveBeenCalledTimes(1);
  });

  /**
   * Dado que uma partida nova começa,
   * Quando o `reset` é chamado,
   * Então a saúde volta a ser consultada — o backend pode ter mudado de estado
   * entre uma partida e outra.
   */
  it('deve reconsultar a saúde depois de um reset', async () => {
    const { result, rerender } = renderHook(({ state }) => useLiveReview(state, false), {
      initialProps: { state: game([START, AFTER_A3], ['a3']) },
    });
    await waitFor(() => expect(checkAnalysisBackend).toHaveBeenCalledTimes(1));

    result.current.reset();
    rerender({ state: game([START, AFTER_A3, AFTER_A6], ['a3', 'a6']) });

    await waitFor(() => expect(checkAnalysisBackend).toHaveBeenCalledTimes(2));
  });
});
