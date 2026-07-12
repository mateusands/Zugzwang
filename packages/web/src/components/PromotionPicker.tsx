import { glyph } from '../board.js';

const PROMOTION_PIECES = ['q', 'r', 'b', 'n'];

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
            className="promotion__piece piece--white"
            onClick={() => onPick(type)}
          >
            {glyph({ square: '', type, color: 'white' })}
          </button>
        ))}
      </div>
    </div>
  );
}
