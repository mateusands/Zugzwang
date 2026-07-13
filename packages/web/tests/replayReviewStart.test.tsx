// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReplayScreen } from '../src/components/ReplayScreen.js';
import { emptyMoveCounts, type GameReview } from '../src/gameReview.js';
import type { SavedGame } from '../src/savedGames.js';
import type { StockfishClient } from '../src/stockfishClient.js';
import { getSharedEngine } from '../src/useEvaluation.js';

vi.mock('../src/useEvaluation.js', () => ({
  useEvaluation: () => ({ ready: false, thinking: false, evaluation: null, error: false }),
  getSharedEngine: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function reviewedGame(): SavedGame {
  const white = emptyMoveCounts();
  const black = emptyMoveCounts();
  white.blunder = 1;
  const review: GameReview = {
    plies: [
      {
        mover: 'white',
        sanPlayed: 'e4',
        playedMove: 'e2e4',
        bestMove: 'd2d4',
        class: 'blunder',
        winPercentLost: 24,
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

function unreviewedGame(): SavedGame {
  const { review: _review, ...game } = reviewedGame();
  return {
    ...game,
    result: { kind: 'loss', status: 'in_progress', winner: null, resigned: true },
    sans: ['a3'],
    fens: [
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'rnbqkbnr/pppppppp/8/8/8/P7/1PPPPPPP/RNBQKBNR b KQkq - 0 1',
    ],
    pgn: '1. a3',
  };
}

function engineEvaluation() {
  return {
    score: { type: 'cp' as const, value: 0 },
    winPercent: 50,
    bestMove: 'h2h3',
    depth: 12,
    secondLine: null,
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

  it('anima e colore o lance selecionado e aponta a melhor jogada em verde', () => {
    const { container } = render(
      <ReplayScreen
        savedGame={reviewedGame()}
        startInReview
        suspendKeys={false}
        onBack={vi.fn()}
        onOpenList={vi.fn()}
        onSaveReview={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /e4.*Capivarada/ }));

    const origin = screen.getByRole('button', { name: 'e2' });
    const destination = screen.getByRole('button', { name: 'e4' });
    expect(origin.classList.contains('square--review-blunder')).toBe(true);
    expect(destination.classList.contains('square--review-blunder')).toBe(true);
    expect(destination.querySelector('.piece--slide')).not.toBeNull();
    expect(destination.querySelector('[aria-label="Capivarada"]')?.textContent).toBe('??');
    const bestArrow = container.querySelector('.arrow--best');
    expect(bestArrow).not.toBeNull();
    expect(bestArrow?.getAttribute('stroke')).toBe('rgba(129,182,76,0.95)');
    expect(bestArrow?.getAttribute('marker-end')).toBe('url(#arrowhead-best)');
  });

  it('não desenha recomendação quando o melhor lance foi o lance jogado', () => {
    const game = reviewedGame();
    const firstPly = game.review?.plies[0];
    if (!firstPly) throw new Error('fixture sem primeiro lance');
    firstPly.bestMove = firstPly.playedMove;

    const { container } = render(
      <ReplayScreen
        savedGame={game}
        startInReview
        suspendKeys={false}
        onBack={vi.fn()}
        onOpenList={vi.fn()}
        onSaveReview={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /e4.*Capivarada/ }));

    expect(container.querySelector('.arrows polyline')).toBeNull();
  });

  it('anima para frente e para trás pelos controles de lance', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Próximo lance' }));
    expect(screen.getByText('Lance 1 de 1')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'e4' }).querySelector('.piece--slide'),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Lance anterior' }));
    expect(screen.getByText('Lance 0 de 1')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'e2' }).querySelector('.piece--slide'),
    ).not.toBeNull();
  });

  it('anima os saltos para o último lance e de volta ao primeiro', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Último lance' }));
    expect(
      screen.getByRole('button', { name: 'e4' }).querySelector('.piece--slide'),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Primeiro lance' }));
    expect(
      screen.getByRole('button', { name: 'e2' }).querySelector('.piece--slide'),
    ).not.toBeNull();
  });

  it('analisa e persiste uma partida ainda sem revisão', async () => {
    const evaluate = vi.fn(async () => engineEvaluation());
    vi.mocked(getSharedEngine).mockResolvedValue({ evaluate } as unknown as StockfishClient);
    const onSaveReview = vi.fn();
    const onSaveReviewCache = vi.fn();

    render(
      <ReplayScreen
        savedGame={unreviewedGame()}
        suspendKeys={false}
        onBack={vi.fn()}
        onOpenList={vi.fn()}
        onSaveReview={onSaveReview}
        onSaveReviewCache={onSaveReviewCache}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Revisar partida' }));

    await waitFor(() => expect(onSaveReview).toHaveBeenCalledOnce());
    expect(evaluate).toHaveBeenCalled();
    expect(onSaveReviewCache).toHaveBeenCalled();
  });

  it('cancela a análise quando o replay é desmontado', async () => {
    let receivedSignal: AbortSignal | undefined;
    const evaluate = vi.fn((_fen: string, request: { signal?: AbortSignal }) => {
      receivedSignal = request.signal;
      return new Promise<never>((_resolve, reject) => {
        request.signal?.addEventListener('abort', () => {
          reject(new DOMException('cancelled', 'AbortError'));
        });
      });
    });
    vi.mocked(getSharedEngine).mockResolvedValue({ evaluate } as unknown as StockfishClient);
    const onSaveReview = vi.fn();
    const { unmount } = render(
      <ReplayScreen
        savedGame={unreviewedGame()}
        suspendKeys={false}
        onBack={vi.fn()}
        onOpenList={vi.fn()}
        onSaveReview={onSaveReview}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Revisar partida' }));
    await waitFor(() => expect(evaluate).toHaveBeenCalled());
    unmount();

    expect(receivedSignal?.aborted).toBe(true);
    expect(onSaveReview).not.toHaveBeenCalled();
  });
});
