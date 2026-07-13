import { topMoveClasses, type GameReview } from '../gameReview.js';
import type { Outcome } from '../outcome.js';
import { MOVE_CLASS_ICONS, MOVE_CLASS_LABELS } from '../review.js';

interface EndScreenProps {
  outcome: Outcome;
  review: GameReview | null;
  reviewing: boolean;
  reviewProgress: { done: number; total: number };
  reviewStage?: 'quick' | 'deep';
  reviewError: boolean;
  onReview: () => void;
  onRematch: () => void;
  onNewBot: () => void;
}

/** Tela de finalização da partida (vitória / derrota / empate). */
export function EndScreen({
  outcome,
  review,
  reviewing,
  reviewProgress,
  reviewStage = 'quick',
  reviewError,
  onReview,
  onRematch,
  onNewBot,
}: EndScreenProps) {
  const topClasses = review ? topMoveClasses(review) : [];
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="endscreen__card">
        <h2 className={`endscreen__title endscreen__title--${outcome.kind}`}>{outcome.title}</h2>
        <p className="endscreen__reason">{outcome.reason}</p>

        <div className="endscreen__summary" aria-live="polite">
          {reviewing ? (
            <p className="endscreen__progress">
              {reviewStage === 'deep' ? 'Refinando' : 'Analisando'} {reviewProgress.done}/
              {reviewProgress.total} {reviewStage === 'deep' ? 'posições críticas…' : 'posições…'}
            </p>
          ) : reviewError ? (
            <p className="endscreen__progress endscreen__progress--error">
              O resumo não pôde ser calculado agora.
            </p>
          ) : topClasses.length > 0 ? (
            <ol className="endscreen__top" aria-label="Classificações mais frequentes">
              {topClasses.map((item) => (
                <li
                  key={item.class}
                  className={`endscreen__top-item endscreen__top-item--${item.class}`}
                >
                  <strong>{item.count}</strong>
                  <span className="endscreen__top-icon">{MOVE_CLASS_ICONS[item.class]}</span>
                  <span>{MOVE_CLASS_LABELS[item.class]}</span>
                </li>
              ))}
            </ol>
          ) : review ? (
            <p className="endscreen__progress">Partida sem lances para classificar.</p>
          ) : null}
        </div>

        <div className="endscreen__actions">
          <button
            type="button"
            className="button--primary endscreen__review"
            onClick={onReview}
            disabled={reviewing}
          >
            Revisar partida
          </button>
          <div className="endscreen__secondary-actions">
            <button type="button" onClick={onRematch}>
              Revanche
            </button>
            <button type="button" onClick={onNewBot}>
              Novo bot
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
