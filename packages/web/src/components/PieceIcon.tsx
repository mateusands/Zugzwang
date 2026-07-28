import { PIECE_VIEW_BOX, pieceArt } from '../pieceArt.js';
import type { PieceColor } from '../api.js';
import type { PieceType } from '../review.js';

interface PieceIconProps {
  type: PieceType;
  color: PieceColor;
  /** Rótulo acessível; omitido, o desenho fica decorativo (casa já tem label). */
  label?: string;
}

/**
 * Desenha uma peça. A arte vem de `pieceArt.ts` como marcação estática
 * vendorizada — nunca de entrada do usuário nem da rede —, por isso o
 * `dangerouslySetInnerHTML` aqui não é um vetor de injeção.
 */
export function PieceIcon({ type, color, label }: PieceIconProps) {
  return (
    <svg
      className="piece__art"
      viewBox={PIECE_VIEW_BOX}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: pieceArt(type, color) }}
    />
  );
}
