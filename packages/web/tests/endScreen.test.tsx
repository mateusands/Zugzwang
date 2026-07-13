// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EndScreen } from '../src/components/EndScreen.js';
import { emptyMoveCounts, topMoveClasses, type GameReview } from '../src/gameReview.js';

afterEach(cleanup);

function sampleReview(): GameReview {
  const white = emptyMoveCounts();
  const black = emptyMoveCounts();
  white.excellent = 28;
  black.excellent = 22;
  white.brilliant = 2;
  black.brilliant = 1;
  white.good = 8;
  black.good = 9;
  white.blunder = 4;
  black.blunder = 3;
  return {
    plies: [],
    accuracy: { white: 82.4, black: 76.1 },
    counts: { white, black },
  };
}

describe('topMoveClasses', () => {
  it('soma as duas cores e devolve somente as três maiores ocorrências', () => {
    expect(topMoveClasses(sampleReview())).toEqual([
      { class: 'excellent', count: 50 },
      { class: 'good', count: 17 },
      { class: 'blunder', count: 7 },
    ]);
  });

  it('ignora zeros e usa a ordem canônica para desempatar', () => {
    const review = sampleReview();
    review.counts.white = emptyMoveCounts();
    review.counts.black = emptyMoveCounts();
    review.counts.white.brilliant = 2;
    review.counts.white.great = 2;
    review.counts.white.best = 2;
    review.counts.white.book = 2;

    expect(topMoveClasses(review)).toEqual([
      { class: 'book', count: 2 },
      { class: 'brilliant', count: 2 },
      { class: 'great', count: 2 },
    ]);
  });
});

describe('EndScreen', () => {
  it('mostra o top 3 e as ações de revisão, revanche e novo bot', () => {
    const onReview = vi.fn();
    const onRematch = vi.fn();
    const onNewBot = vi.fn();
    render(
      <EndScreen
        outcome={{ kind: 'loss', title: 'Você desistiu', reason: 'por desistência' }}
        review={sampleReview()}
        reviewing={false}
        reviewProgress={{ done: 0, total: 0 }}
        reviewError={false}
        onReview={onReview}
        onRematch={onRematch}
        onNewBot={onNewBot}
      />,
    );

    expect(screen.getByText('Você desistiu')).toBeTruthy();
    expect(screen.getByText('50')).toBeTruthy();
    expect(screen.getByText('Excelente')).toBeTruthy();
    expect(screen.getByText('17')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Revisar partida' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revanche' }));
    fireEvent.click(screen.getByRole('button', { name: 'Novo bot' }));
    expect(onReview).toHaveBeenCalledOnce();
    expect(onRematch).toHaveBeenCalledOnce();
    expect(onNewBot).toHaveBeenCalledOnce();
  });

  it('mostra progresso e bloqueia a revisão durante a análise automática', () => {
    render(
      <EndScreen
        outcome={{ kind: 'win', title: 'Você venceu!', reason: 'por xeque-mate' }}
        review={null}
        reviewing
        reviewProgress={{ done: 12, total: 31 }}
        reviewError={false}
        onReview={vi.fn()}
        onRematch={vi.fn()}
        onNewBot={vi.fn()}
      />,
    );

    expect(screen.getByText('Analisando 12/31 posições…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Revisar partida' })).toHaveProperty(
      'disabled',
      true,
    );
  });
});
