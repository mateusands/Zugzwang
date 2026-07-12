import { moveRows } from '../replay.js';

interface MoveListProps {
  sans: string[];
  /** Ply da posição exibida (0 = inicial); destaca o lance correspondente. */
  currentPly: number;
  onSelect: (ply: number) => void;
}

/** Lista de lances em pares numerados; cada meio-lance é clicável. */
export function MoveList({ sans, currentPly, onSelect }: MoveListProps) {
  if (sans.length === 0) return null;

  return (
    <ol className="moves" aria-label="Lances da partida">
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
