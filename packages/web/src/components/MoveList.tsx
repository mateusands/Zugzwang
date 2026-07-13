import { useEffect, useRef } from 'react';
import { moveRows } from '../replay.js';

interface MoveListProps {
  sans: string[];
  /** Ply da posição exibida (0 = inicial); destaca o lance correspondente. */
  currentPly: number;
  onSelect: (ply: number) => void;
}

/**
 * Painel lateral com os lances em pares numerados; cada meio-lance é
 * clicável e o lance da posição exibida fica sempre visível (auto-scroll).
 */
export function MoveList({ sans, currentPly, onSelect }: MoveListProps) {
  const listRef = useRef<HTMLOListElement>(null);

  // Mantém o lance destacado à vista quando a lista rola.
  useEffect(() => {
    const current = listRef.current?.querySelector('[aria-current="true"]');
    current?.scrollIntoView({ block: 'nearest' });
  }, [currentPly, sans.length]);

  if (sans.length === 0) return null;

  return (
    <ol ref={listRef} className="moves" aria-label="Lances da partida">
      {moveRows(sans).map((row) => {
        const { black, blackPly } = row;
        return (
          <li key={row.number} className="moves__row">
            <span className="moves__number">{row.number}.</span>
            <button
              type="button"
              className="moves__ply"
              aria-current={currentPly === row.whitePly ? 'true' : undefined}
              onClick={() => onSelect(row.whitePly)}
            >
              {row.white}
            </button>
            {black !== null && blackPly !== null ? (
              <button
                type="button"
                className="moves__ply"
                aria-current={currentPly === blackPly ? 'true' : undefined}
                onClick={() => onSelect(blackPly)}
              >
                {black}
              </button>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
