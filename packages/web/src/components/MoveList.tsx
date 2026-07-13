import { useEffect, useRef } from 'react';
import { moveRows } from '../replay.js';
import { MOVE_CLASS_LABELS, type MoveClass, type PlyReview } from '../review.js';

interface MoveListProps {
  sans: string[];
  /** Ply da posição exibida (0 = inicial); destaca o lance correspondente. */
  currentPly: number;
  onSelect: (ply: number) => void;
  reviews?: PlyReview[];
  filter?: MoveClass | null;
}

/**
 * Painel lateral com os lances em pares numerados; cada meio-lance é
 * clicável e o lance da posição exibida fica sempre visível (auto-scroll).
 */
export function MoveList({ sans, currentPly, onSelect, reviews, filter = null }: MoveListProps) {
  const listRef = useRef<HTMLOListElement>(null);

  // Mantém o lance destacado à vista quando a lista rola.
  useEffect(() => {
    const current = listRef.current?.querySelector('[aria-current="true"]');
    if (current && 'scrollIntoView' in current) current.scrollIntoView({ block: 'nearest' });
  }, [currentPly, sans.length]);

  if (sans.length === 0) return null;

  return (
    <ol ref={listRef} className="moves" aria-label="Lances da partida">
      {moveRows(sans).map((row) => {
        const { black, blackPly } = row;
        const whiteReview = reviews?.[row.whitePly - 1];
        const blackReview = blackPly === null ? undefined : reviews?.[blackPly - 1];
        const showWhite = filter === null || whiteReview?.class === filter;
        const showBlack = black !== null && (filter === null || blackReview?.class === filter);
        if (!showWhite && !showBlack) return null;
        return (
          <li key={row.number} className="moves__row">
            <span className="moves__number">{row.number}.</span>
            {showWhite ? (
              <button
                type="button"
                className="moves__ply"
                aria-current={currentPly === row.whitePly ? 'true' : undefined}
                onClick={() => onSelect(row.whitePly)}
              >
                {row.white}
                {whiteReview ? (
                  <span className={`move-badge move-badge--${whiteReview.class}`}>
                    {MOVE_CLASS_LABELS[whiteReview.class]}
                  </span>
                ) : null}
              </button>
            ) : (
              <span />
            )}
            {showBlack && black !== null && blackPly !== null ? (
              <button
                type="button"
                className="moves__ply"
                aria-current={currentPly === blackPly ? 'true' : undefined}
                onClick={() => onSelect(blackPly)}
              >
                {black}
                {blackReview ? (
                  <span className={`move-badge move-badge--${blackReview.class}`}>
                    {MOVE_CLASS_LABELS[blackReview.class]}
                  </span>
                ) : null}
              </button>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
