import { glyph } from '../board.js';
import type { PieceColor } from '../api.js';

interface CapturedRowProps {
  /** Types of the captured pieces, in display order. */
  pieces: string[];
  /** Colour of the captured pieces (they belonged to this side). */
  color: PieceColor;
  /** Material lead of the capturing side, shown as +N when positive. */
  lead: number;
}

/** Linha de peças capturadas por um lado (com a vantagem material). */
export function CapturedRow({ pieces, color, lead }: CapturedRowProps) {
  return (
    <div className="captured">
      {pieces.map((type, index) => (
        <span key={`${type}-${index}`} className={`captured__piece piece--${color}`}>
          {glyph({ square: '', type, color })}
        </span>
      ))}
      {lead > 0 ? <span className="captured__lead">+{lead}</span> : null}
    </div>
  );
}
