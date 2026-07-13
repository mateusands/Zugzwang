import { describe, expect, it, vi } from 'vitest';
import {
  REVIEW_DEEP_MS,
  REVIEW_QUICK_MS,
  buildGameReview,
  moveUciFromFens,
  type ReviewCache,
  type ReviewEvaluationRequest,
} from '../src/gameReview.js';
import type { SavedGame } from '../src/savedGames.js';
import type { Evaluation } from '../src/stockfishClient.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const AFTER_A3 = 'rnbqkbnr/pppppppp/8/8/8/P7/1PPPPPPP/RNBQKBNR b KQkq - 0 1';
const AFTER_A6 = 'rnbqkbnr/1ppppppp/p7/8/8/P7/1PPPPPPP/RNBQKBNR w KQkq - 0 2';

function evaluation(win: number, bestMove: string, secondWin: number): Evaluation {
  return {
    score: { type: 'cp', value: 0 },
    winPercent: win,
    bestMove,
    depth: 18,
    secondLine: {
      score: { type: 'cp', value: 0 },
      winPercent: secondWin,
      bestMove: 'a2a3',
      depth: 18,
    },
  };
}

function savedGame(): SavedGame {
  return {
    id: 'game-1',
    savedAt: '2026-07-13T12:00:00.000Z',
    difficulty: 'medium',
    playerColor: 'white',
    result: { kind: 'draw', status: 'draw', winner: null, resigned: false },
    sans: ['e4', 'e5'],
    fens: [START, AFTER_E4, AFTER_E5],
    pgn: '1. e4 e5',
  };
}

function nonBookGame(): SavedGame {
  return {
    ...savedGame(),
    result: { kind: 'loss', status: 'in_progress', winner: null, resigned: true },
    sans: ['a3', 'a6'],
    fens: [START, AFTER_A3, AFTER_A6],
    pgn: '1. a3 a6',
  };
}

describe('moveUciFromFens', () => {
  it('deriva lance comum e captura en passant', () => {
    expect(moveUciFromFens(START, AFTER_E4, 'e4')).toBe('e2e4');
    expect(
      moveUciFromFens('8/8/8/3pP3/8/8/8/4K2k w - d6 0 1', '8/8/3P4/8/8/8/8/4K2k b - - 0 1', 'exd6'),
    ).toBe('e5d6');
  });

  it('deriva roque pelo deslocamento do rei e promoção com sufixo UCI', () => {
    expect(
      moveUciFromFens('4k3/8/8/8/8/8/8/4K2R w K - 0 1', '4k3/8/8/8/8/8/8/5RK1 b - - 1 1', 'O-O'),
    ).toBe('e1g1');
    expect(
      moveUciFromFens('7k/P7/8/8/8/8/8/7K w - - 0 1', 'Q6k/8/8/8/8/8/8/7K b - - 0 1', 'a8=Q+'),
    ).toBe('a7a8q');
  });
});

describe('buildGameReview', () => {
  it('faz a passagem rápida em sequência com MultiPV 1', async () => {
    const values = new Map<string, Evaluation>([
      [START, evaluation(50, 'h2h3', 48)],
      [AFTER_A3, evaluation(50, 'h7h6', 50)],
      [AFTER_A6, evaluation(50, 'h2h3', 49)],
    ]);
    const calls: { fen: string; request: ReviewEvaluationRequest }[] = [];
    const evaluate = vi.fn(async (fen: string, request: ReviewEvaluationRequest) => {
      calls.push({ fen, request });
      return values.get(fen) ?? null;
    });
    const progress = vi.fn();

    const review = await buildGameReview(nonBookGame(), evaluate, progress);

    expect(calls.map(({ fen }) => fen)).toEqual([START, AFTER_A3, AFTER_A6]);
    expect(calls.every(({ request }) => request.multiPv === 1)).toBe(true);
    expect(
      calls.every(
        ({ request }) => 'movetime' in request.limit && request.limit.movetime === REVIEW_QUICK_MS,
      ),
    ).toBe(true);
    expect(progress.mock.calls[0]).toEqual([0, 3, 'quick']);
    expect(progress.mock.calls.at(-1)).toEqual([3, 3, 'quick']);
    expect(review.plies).toHaveLength(2);
    expect(review.plies.map((ply) => ply.playedMove)).toEqual(['a2a3', 'a7a6']);
    expect(review.accuracy.white).toBeGreaterThan(0);
    expect(review.accuracy.black).toBeGreaterThan(0);
  });

  it('classifica uma sequência inteira de livro sem chamar o motor', async () => {
    const evaluate = vi.fn();

    const review = await buildGameReview(savedGame(), evaluate);

    expect(evaluate).not.toHaveBeenCalled();
    expect(review.plies.map((ply) => ply.class)).toEqual(['book', 'book']);
  });

  it('retoma do cache parcial e persiste cada nova posição', async () => {
    const cached = evaluation(50, 'h2h3', 48);
    const cache: ReviewCache = {
      [START]: { evaluation: cached, quality: 'quick', multiPv: 1 },
    };
    const values = new Map<string, Evaluation>([
      [AFTER_A3, evaluation(50, 'h7h6', 50)],
      [AFTER_A6, evaluation(50, 'h2h3', 49)],
    ]);
    const evaluate = vi.fn(async (fen: string) => values.get(fen) ?? null);
    const progress = vi.fn();
    const onCache = vi.fn();

    await buildGameReview(nonBookGame(), evaluate, progress, { cache, onCache });

    expect(progress.mock.calls[0]).toEqual([1, 3, 'quick']);
    expect(evaluate.mock.calls.map(([fen]) => fen)).toEqual([AFTER_A3, AFTER_A6]);
    expect(onCache).toHaveBeenCalledTimes(2);
    expect(Object.keys(onCache.mock.calls.at(-1)?.[0] as ReviewCache)).toHaveLength(3);
  });

  it('aprofunda somente posições candidatas e pede MultiPV 2 apenas na raiz', async () => {
    const quick = new Map<string, Evaluation>([
      [START, evaluation(60, 'h2h3', 45)],
      [AFTER_A3, evaluation(40, 'h7h6', 38)],
      [AFTER_A6, evaluation(40, 'h2h3', 38)],
    ]);
    const requests: { fen: string; request: ReviewEvaluationRequest }[] = [];
    const evaluate = vi.fn(async (fen: string, request: ReviewEvaluationRequest) => {
      requests.push({ fen, request });
      return quick.get(fen) ?? null;
    });

    await buildGameReview(nonBookGame(), evaluate);

    const deep = requests.filter(
      ({ request }) => 'movetime' in request.limit && request.limit.movetime === REVIEW_DEEP_MS,
    );
    expect(deep).toEqual([
      { fen: START, request: { limit: { movetime: REVIEW_DEEP_MS }, multiPv: 2 } },
      { fen: AFTER_A3, request: { limit: { movetime: REVIEW_DEEP_MS }, multiPv: 1 } },
    ]);
  });

  it('usa o resultado salvo quando a posição terminal não traz avaliação', async () => {
    const game = savedGame();
    game.sans = ['e4'];
    game.fens = [START, AFTER_E4];
    game.result = { kind: 'win', status: 'checkmate', winner: 'white', resigned: false };

    const review = await buildGameReview(game, async (fen) =>
      fen === START ? evaluation(80, 'e2e4', 60) : null,
    );

    expect(review.plies[0]?.winPercentLost).toBe(0);
  });

  it('interrompe o lote antes da próxima posição quando o signal é cancelado', async () => {
    const controller = new AbortController();
    const evaluate = vi.fn(async () => {
      controller.abort();
      return evaluation(50, 'h2h3', 48);
    });

    await expect(
      buildGameReview(nonBookGame(), evaluate, undefined, { signal: controller.signal }),
    ).rejects.toHaveProperty('name', 'AbortError');
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
});
