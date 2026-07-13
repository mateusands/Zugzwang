// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewPanel } from '../src/components/ReviewPanel.js';
import { MoveList } from '../src/components/MoveList.js';
import { emptyMoveCounts, type GameReview } from '../src/gameReview.js';

afterEach(cleanup);

function review(): GameReview {
  const white = emptyMoveCounts();
  const black = emptyMoveCounts();
  white.book = 1;
  black.brilliant = 1;
  return {
    plies: [
      {
        mover: 'white',
        sanPlayed: 'e4',
        playedMove: 'e2e4',
        bestMove: 'e2e4',
        class: 'book',
        winPercentLost: 0,
      },
      {
        mover: 'black',
        sanPlayed: 'e5',
        playedMove: 'e7e5',
        bestMove: 'c7c5',
        class: 'brilliant',
        winPercentLost: 1,
      },
    ],
    accuracy: { white: 100, black: 95.2 },
    counts: { white, black },
  };
}

describe('ReviewPanel', () => {
  it('mostra accuracy, contagens e detalhes do lance selecionado', () => {
    render(<ReviewPanel review={review()} selectedPly={2} filter={null} onFilter={vi.fn()} />);

    expect(screen.getByText('100.0%')).toBeTruthy();
    expect(screen.getByText('95.2%')).toBeTruthy();
    expect(screen.getByText(/Jogado: e5/)).toBeTruthy();
    expect(screen.getByText(/Melhor: c7c5/)).toBeTruthy();
  });

  it('permite ativar e limpar um filtro de categoria', () => {
    const onFilter = vi.fn();
    const { rerender } = render(
      <ReviewPanel review={review()} selectedPly={0} filter={null} onFilter={onFilter} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Brilhante/ }));
    expect(onFilter).toHaveBeenCalledWith('brilliant');

    rerender(
      <ReviewPanel review={review()} selectedPly={0} filter="brilliant" onFilter={onFilter} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Brilhante/ }));
    expect(onFilter).toHaveBeenLastCalledWith(null);
  });
});

describe('MoveList com revisão', () => {
  it('mostra badges e oculta categorias fora do filtro', () => {
    render(
      <MoveList
        sans={['e4', 'e5']}
        currentPly={2}
        onSelect={vi.fn()}
        reviews={review().plies}
        filter="brilliant"
      />,
    );

    expect(screen.getByRole('button', { name: /e5.*Brilhante/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /e4.*Livro/ })).toBeNull();
  });
});
