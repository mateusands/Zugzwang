// @vitest-environment jsdom

import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.js';
import { createGame, type GameState } from '../src/api.js';
import { readSavedGames } from '../src/savedGames.js';
import type { StockfishClient } from '../src/stockfishClient.js';
import { getSharedEngine } from '../src/useEvaluation.js';

vi.mock('../src/api.js', async () => {
  const actual = await vi.importActual<typeof import('../src/api.js')>('../src/api.js');
  return { ...actual, createGame: vi.fn() };
});

vi.mock('../src/useEvaluation.js', () => ({
  useEvaluation: () => ({ ready: false, thinking: false, evaluation: null, error: false }),
  getSharedEngine: vi.fn(),
}));

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_A3 = 'rnbqkbnr/pppppppp/8/8/8/P7/1PPPPPPP/RNBQKBNR b KQkq - 0 1';

function finishedGame(): GameState {
  return {
    id: 'auto-review',
    fen: AFTER_A3,
    turn: 'black',
    status: 'checkmate',
    gameOver: true,
    winner: 'white',
    pieces: [],
    legalMoves: [],
    legalTargets: {},
    history: ['a3'],
    fens: [START, AFTER_A3],
    pgn: '1. a3',
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('App — revisão automática no encerramento', () => {
  it('inicia uma única análise e persiste o resultado final', async () => {
    vi.mocked(createGame).mockResolvedValue(finishedGame());
    const evaluate = vi.fn(async () => ({
      score: { type: 'cp' as const, value: 10 },
      winPercent: 55,
      bestMove: 'a2a3',
      depth: 12,
      secondLine: null,
    }));
    vi.mocked(getSharedEngine).mockResolvedValue({ evaluate } as unknown as StockfishClient);

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Jogar' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Jogar' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Revisar partida' })).toHaveProperty(
        'disabled',
        false,
      );
    });

    expect(evaluate).toHaveBeenCalledOnce();
    expect(readSavedGames(localStorage)[0]?.review?.plies).toHaveLength(1);
  });
});
