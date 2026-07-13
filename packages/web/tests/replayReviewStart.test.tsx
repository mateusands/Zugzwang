// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReplayScreen } from '../src/components/ReplayScreen.js';
import { emptyMoveCounts, type GameReview } from '../src/gameReview.js';
import type { SavedGame } from '../src/savedGames.js';

vi.mock('../src/useEvaluation.js', () => ({
  useEvaluation: () => ({ ready: false, thinking: false, evaluation: null, error: false }),
  getSharedEngine: vi.fn(),
}));

afterEach(cleanup);

function reviewedGame(): SavedGame {
  const white = emptyMoveCounts();
  const black = emptyMoveCounts();
  white.book = 1;
  const review: GameReview = {
    plies: [
      {
        mover: 'white',
        sanPlayed: 'e4',
        playedMove: 'e2e4',
        bestMove: 'e2e4',
        class: 'book',
        winPercentLost: 0,
      },
    ],
    accuracy: { white: 100, black: 0 },
    counts: { white, black },
  };
  return {
    id: 'finished',
    savedAt: '2026-07-13T12:00:00.000Z',
    difficulty: 'medium',
    playerColor: 'white',
    result: { kind: 'win', status: 'checkmate', winner: 'white', resigned: false },
    sans: ['e4'],
    fens: [
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    ],
    pgn: '1. e4',
    review,
  };
}

describe('ReplayScreen iniciado pelo encerramento', () => {
  it('abre diretamente no modo de revisão e reutiliza o resultado salvo', () => {
    render(
      <ReplayScreen
        savedGame={reviewedGame()}
        startInReview
        suspendKeys={false}
        onBack={vi.fn()}
        onOpenList={vi.fn()}
        onSaveReview={vi.fn()}
      />,
    );

    expect(screen.getByRole('checkbox', { name: 'Revisar partida' })).toHaveProperty(
      'checked',
      true,
    );
    expect(screen.getByRole('complementary', { name: 'Revisão da partida' })).toBeTruthy();
  });
});
