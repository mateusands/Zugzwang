import type { CSSProperties, PointerEvent as ReactPointerEvent, Ref } from 'react';
import {
  glyph,
  isCaptureTarget,
  isLightSquare,
  orderedSquares,
  pieceMap,
  slideOffset,
} from './board.js';
import { arrowPolyline, type Arrow } from './annotations.js';
import type { Piece } from './api.js';

export interface AnimatedMove {
  from: string;
  to: string;
}

interface BoardViewProps {
  boardRef: Ref<HTMLDivElement>;
  pieces: Piece[];
  selected: string | null;
  targets: string[];
  /** Squares whose piece can be picked up (player's movable pieces). */
  movable: string[];
  onSquarePointerDown: (square: string, event: ReactPointerEvent) => void;
  /** Right-button drag/click drives annotations; left-button clears them. */
  onSquareMouseDown: (square: string, button: number) => void;
  onSquareMouseUp: (square: string, button: number) => void;
  /** Fired entering a square (used to trace the arrow path while drawing). */
  onSquareMouseEnter: (square: string) => void;
  highlights: string[];
  arrows: Arrow[];
  /** Square whose piece is currently being dragged (hidden at its origin). */
  dragFrom: string | null;
  /** Move to animate sliding to its square (player's or bot's). */
  animatedMove: AnimatedMove | null;
  /** Duration of the slide animation, in milliseconds. */
  animationMs: number;
  /** Bumps every move, so the sliding piece remounts and re-animates. */
  moveSeq: number;
  /** Whether to draw the legal-move hints (dots / capture rings). */
  showHints: boolean;
}

export function BoardView({
  boardRef,
  pieces,
  selected,
  targets,
  movable,
  onSquarePointerDown,
  onSquareMouseDown,
  onSquareMouseUp,
  onSquareMouseEnter,
  highlights,
  arrows,
  dragFrom,
  animatedMove,
  animationMs,
  moveSeq,
  showHints,
}: BoardViewProps) {
  const bySquare = pieceMap(pieces);
  const targetSet = new Set(targets);
  const movableSet = new Set(movable);
  const highlightSet = new Set(highlights);

  return (
    <div className="board" ref={boardRef} onContextMenu={(event) => event.preventDefault()}>
      {orderedSquares().map((square) => {
        const piece = bySquare.get(square);
        const offset = animatedMove?.to === square ? slideOffset(animatedMove.from, square) : null;
        const isTarget = showHints && targetSet.has(square);

        const classes = [
          'square',
          isLightSquare(square) ? 'square--light' : 'square--dark',
          square === selected && dragFrom !== square ? 'square--selected' : '',
          isTarget ? (isCaptureTarget(square, pieces) ? 'square--capture' : 'square--target') : '',
          highlightSet.has(square) ? 'square--annotated' : '',
          animatedMove && (animatedMove.from === square || animatedMove.to === square)
            ? 'square--lastmove'
            : '',
        ]
          .filter(Boolean)
          .join(' ');

        const pieceClasses = [
          'piece',
          piece ? `piece--${piece.color}` : '',
          offset ? 'piece--slide' : '',
          dragFrom === square ? 'piece--dragging' : '',
          movableSet.has(square) ? 'piece--movable' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <button
            key={square}
            type="button"
            data-square={square}
            className={classes}
            aria-label={square}
            onPointerDown={(event) => onSquarePointerDown(square, event)}
            onMouseDown={(event) => onSquareMouseDown(square, event.button)}
            onMouseUp={(event) => onSquareMouseUp(square, event.button)}
            onMouseEnter={() => onSquareMouseEnter(square)}
          >
            {piece ? (
              <span
                key={`${square}-${moveSeq}`}
                className={pieceClasses}
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

      <svg className="arrows" viewBox="0 0 8 8" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <marker
            id="arrowhead"
            markerUnits="userSpaceOnUse"
            markerWidth="0.7"
            markerHeight="0.7"
            refX="0.55"
            refY="0.35"
            orient="auto"
          >
            <path d="M0.05,0.05 L0.65,0.35 L0.05,0.65 Z" fill="rgba(255,150,0,0.85)" />
          </marker>
        </defs>
        {arrows.map((arrow) => {
          const points = arrowPolyline(arrow.path)
            .map((point) => `${point.x},${point.y}`)
            .join(' ');
          return (
            <polyline
              key={arrow.path.join('-')}
              points={points}
              fill="none"
              stroke="rgba(255,150,0,0.85)"
              strokeWidth={0.16}
              strokeLinecap="round"
              strokeLinejoin="round"
              markerEnd="url(#arrowhead)"
            />
          );
        })}
      </svg>
    </div>
  );
}
