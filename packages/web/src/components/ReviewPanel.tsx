import { MOVE_CLASSES, MOVE_CLASS_ICONS, MOVE_CLASS_LABELS, type MoveClass } from '../review.js';
import type { GameReview } from '../gameReview.js';

interface ReviewPanelProps {
  review: GameReview;
  selectedPly: number;
  filter: MoveClass | null;
  onFilter: (filter: MoveClass | null) => void;
}

export function ReviewPanel({ review, selectedPly, filter, onFilter }: ReviewPanelProps) {
  const selected = selectedPly > 0 ? review.plies[selectedPly - 1] : undefined;
  return (
    <aside className="review-panel" aria-label="Revisão da partida">
      <div className="review-panel__accuracy">
        <div>
          <span>Brancas</span>
          <strong>{review.accuracy.white.toFixed(1)}%</strong>
        </div>
        <div>
          <span>Pretas</span>
          <strong>{review.accuracy.black.toFixed(1)}%</strong>
        </div>
      </div>

      <div className="review-panel__classes">
        {MOVE_CLASSES.map((moveClass) => {
          const white = review.counts.white[moveClass];
          const black = review.counts.black[moveClass];
          if (white + black === 0) return null;
          return (
            <button
              key={moveClass}
              type="button"
              className={
                filter === moveClass ? 'review-class review-class--active' : 'review-class'
              }
              aria-pressed={filter === moveClass}
              onClick={() => onFilter(filter === moveClass ? null : moveClass)}
            >
              <span>{white}</span>
              <span className={`review-badge review-badge--${moveClass}`}>
                {MOVE_CLASS_ICONS[moveClass]} {MOVE_CLASS_LABELS[moveClass]}
              </span>
              <span>{black}</span>
            </button>
          );
        })}
      </div>

      {selected ? (
        <div className="review-panel__detail">
          <strong>{MOVE_CLASS_LABELS[selected.class]}</strong>
          <span>Jogado: {selected.sanPlayed}</span>
          <span>Melhor: {selected.bestMove || '—'}</span>
          <span>Perda: {selected.winPercentLost.toFixed(1)}%</span>
        </div>
      ) : (
        <p className="review-panel__hint">Selecione um lance para ver os detalhes.</p>
      )}
    </aside>
  );
}
