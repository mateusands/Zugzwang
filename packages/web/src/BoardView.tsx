import type { CSSProperties } from 'react';
import { glyph, isLightSquare, orderedSquares, pieceMap, slideOffset } from './board.js';
import type { Piece } from './api.js';

export interface AnimatedMove {
  from: string;
  to: string;
}

interface BoardViewProps {
  pieces: Piece[];
  selected: string | null;
  targets: string[];
  onSquareClick: (square: string) => void;
  /** Move to animate sliding to its square (player's or bot's). */
  animatedMove: AnimatedMove | null;
  /** Duration of the slide animation, in milliseconds. */
  animationMs: number;
  /** Bumps every move, so the sliding piece remounts and re-animates. */
  moveSeq: number;
}

export function BoardView({
  pieces,
  selected,
  targets,
  onSquareClick,
  animatedMove,
  animationMs,
  moveSeq,
}: BoardViewProps) {
  const bySquare = pieceMap(pieces);
  const targetSet = new Set(targets);

  return (
    <div className="board">
      {orderedSquares().map((square) => {
        const piece = bySquare.get(square);
        const offset = animatedMove?.to === square ? slideOffset(animatedMove.from, square) : null;

        const classes = [
          'square',
          isLightSquare(square) ? 'square--light' : 'square--dark',
          square === selected ? 'square--selected' : '',
          targetSet.has(square) ? 'square--target' : '',
          animatedMove && (animatedMove.from === square || animatedMove.to === square)
            ? 'square--lastmove'
            : '',
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
            {piece ? (
              <span
                key={`${square}-${moveSeq}`}
                className={`piece piece--${piece.color}${offset ? ' piece--slide' : ''}`}
                style={
                  offset
                    ? ({
                        '--dx': offset.dx,
                        '--dy': offset.dy,
                        '--slide-ms': `${animationMs}ms`,
                      } as CSSProperties)
                    : undefined
                }
              >
                {glyph(piece)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
