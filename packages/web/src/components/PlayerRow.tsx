import { CapturedRow } from './CapturedRow.js';
import type { PieceColor, PieceType } from '../api.js';

interface PlayerRowProps {
  name: string;
  /** Peças que este jogador capturou. */
  captured: PieceType[];
  /** Cor das peças capturadas (as do adversário). */
  capturedColor: PieceColor;
  /** Vantagem material deste jogador; 0 ou menos não aparece. */
  lead: number;
  /** Destaca a linha de quem tem a vez. */
  toMove?: boolean;
}

/**
 * Linha de identificação de um dos lados, acima ou abaixo do tabuleiro:
 * avatar, nome, peças capturadas e vantagem material.
 */
export function PlayerRow({ name, captured, capturedColor, lead, toMove = false }: PlayerRowProps) {
  return (
    <div
      role="listitem"
      aria-label={toMove ? `vez de ${name}` : name}
      className={`player-row${toMove ? ' player-row--to-move' : ''}`}
    >
      <span className="player-row__avatar" aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <span className="player-row__name">{name}</span>
      <CapturedRow pieces={captured} color={capturedColor} lead={lead} />
    </div>
  );
}
