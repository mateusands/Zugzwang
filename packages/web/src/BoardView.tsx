import { glyph, isLightSquare, orderedSquares, pieceMap } from './board.js';
import type { Piece } from './api.js';

interface BoardViewProps {
  pieces: Piece[];
  selected: string | null;
  targets: string[];
  onSquareClick: (square: string) => void;
}

export function BoardView({ pieces, selected, targets, onSquareClick }: BoardViewProps) {
  const bySquare = pieceMap(pieces);
  const targetSet = new Set(targets);

  return (
    <div className="board">
      {orderedSquares().map((square) => {
        const piece = bySquare.get(square);
        const classes = [
          'square',
          isLightSquare(square) ? 'square--light' : 'square--dark',
          square === selected ? 'square--selected' : '',
          targetSet.has(square) ? 'square--target' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <button
            key={square}
            type="button"
            className={classes}
            aria-label={square}
            onClick={() => onSquareClick(square)}
          >
            {piece ? <span className="piece">{glyph(piece)}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
