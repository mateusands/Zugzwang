import { PieceIcon } from './PieceIcon.js';
import type { PieceType } from '../review.js';

const PROMOTION_PIECES: PieceType[] = ['q', 'r', 'b', 'n'];

interface PromotionPickerProps {
  onPick: (type: string) => void;
  onCancel: () => void;
}

/** Escolha da peça de promoção (clicar fora cancela). */
export function PromotionPicker({ onPick, onCancel }: PromotionPickerProps) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="promotion" onClick={(event) => event.stopPropagation()}>
        {PROMOTION_PIECES.map((type) => (
          <button
            key={type}
            type="button"
            className="promotion__piece"
            onClick={() => onPick(type)}
          >
            <PieceIcon type={type} color="white" label={type} />
          </button>
        ))}
      </div>
    </div>
  );
}
