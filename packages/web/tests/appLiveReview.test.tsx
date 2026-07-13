// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { analyzePositionBatch, checkAnalysisBackend } from '../src/analysisApi.js';
import { getGame, takeback, type GameState } from '../src/api.js';

vi.mock('../src/api.js', async () => {
  const actual = await vi.importActual<typeof import('../src/api.js')>('../src/api.js');
  return { ...actual, getGame: vi.fn(), takeback: vi.fn() };
});

vi.mock('../src/analysisApi.js', () => ({
  analyzePositionBatch: vi.fn(),
  checkAnalysisBackend: vi.fn(),
}));

vi.mock('../src/useEvaluation.js', () => ({
  useEvaluation: () => ({ ready: false, thinking: false, evaluation: null, error: false }),
  getSharedEngine: vi.fn(),
}));

const STORAGE_KEY = 'zugzwang:game';
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_A3 = 'rnbqkbnr/pppppppp/8/8/8/P7/1PPPPPPP/RNBQKBNR b KQkq - 0 1';
const AFTER_A6 = 'rnbqkbnr/1ppppppp/p7/8/8/P7/1PPPPPPP/RNBQKBNR w KQkq - 0 2';

function activeGame(fens = [START, AFTER_A3, AFTER_A6]): GameState {
  return {
    id: 'live-review',
    fen: fens.at(-1) ?? START,
    turn: 'white',
    status: 'in_progress',
    gameOver: false,
    winner: null,
    pieces: [],
    legalMoves: [],
    legalTargets: {},
    history: fens.length === 1 ? [] : ['a3', 'a6'],
    fens,
    pgn: fens.length === 1 ? '' : '1. a3 a6',
  };
}

function evaluation() {
  return {
    score: { type: 'cp' as const, value: 10 },
    winPercent: 51,
    bestMove: 'a2a3',
    depth: 18,
    nodes: 100,
    timeMs: 2,
    nps: 50_000,
    secondLine: null,
  };
}

function evaluationAt(winPercent: number, bestMove: string) {
  return { ...evaluation(), winPercent, bestMove };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ id: 'live-review', difficulty: 'medium', resigned: false }),
  );
  vi.mocked(getGame).mockResolvedValue(activeGame());
  vi.mocked(checkAnalysisBackend).mockResolvedValue({
    available: true,
    engine: 'stockfish-18-full',
  });
});

afterEach(cleanup);

describe('App live review pre-analysis', () => {
  it('analyzes new positions in the background and persists partial cache', async () => {
    vi.mocked(analyzePositionBatch).mockImplementation(async (items, profile, options) => {
      const quickByKey = {
        '0': evaluationAt(60, 'h2h3'),
        '1': evaluationAt(40, 'h7h6'),
        '2': evaluationAt(40, 'h2h3'),
      };
      const results = Object.fromEntries(
        items.map((item) => [
          item.key,
          profile === 'fast'
            ? (quickByKey[item.key as keyof typeof quickByKey] ?? evaluation())
            : evaluationAt(42, item.key === '0' ? 'h2h3' : 'h7h6'),
        ]),
      );
      options.onResults?.(results);
      return results;
    });

    render(<App />);

    await waitFor(() => expect(analyzePositionBatch).toHaveBeenCalledTimes(3));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
        reviewCache?: Record<string, unknown>;
      };
      expect(Object.keys(stored.reviewCache ?? {})).toEqual([START, AFTER_A3, AFTER_A6]);
    });
    expect(analyzePositionBatch).toHaveBeenNthCalledWith(
      1,
      expect.any(Array),
      'fast',
      expect.any(Object),
    );
    expect(analyzePositionBatch).toHaveBeenNthCalledWith(
      2,
      [{ key: '0', fen: START, multiPv: 2 }],
      'deep',
      expect.any(Object),
    );
    expect(analyzePositionBatch).toHaveBeenNthCalledWith(
      3,
      [{ key: '1', fen: AFTER_A3, multiPv: 1 }],
      'deep',
      expect.any(Object),
    );
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
        reviewCache?: Record<string, { quality?: string }>;
      };
      expect(stored.reviewCache?.[START]?.quality).toBe('deep');
    });
  });

  it('cancels obsolete work and removes reverted positions after takeback', async () => {
    const initial = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<
      string,
      unknown
    >;
    initial.reviewCache = {
      [START]: { evaluation: evaluation(), quality: 'quick', multiPv: 1 },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    vi.mocked(takeback).mockResolvedValue(activeGame([START]));
    let batchSignal: AbortSignal | undefined;
    vi.mocked(analyzePositionBatch).mockImplementation((_items, _profile, options) => {
      batchSignal = options.signal;
      return new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          reject(new DOMException('cancelled', 'AbortError'));
        });
      });
    });

    render(<App />);
    await waitFor(() => expect(analyzePositionBatch).toHaveBeenCalledOnce());
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));

    await waitFor(() => expect(batchSignal?.aborted).toBe(true));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
        reviewCache?: Record<string, unknown>;
      };
      expect(Object.keys(stored.reviewCache ?? {})).toEqual([START]);
    });
  });
});
