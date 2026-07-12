import type { Outcome } from '../outcome.js';

interface EndScreenProps {
  outcome: Outcome;
  onRematch: () => void;
  onNewBot: () => void;
}

/** Tela de finalização da partida (vitória / derrota / empate). */
export function EndScreen({ outcome, onRematch, onNewBot }: EndScreenProps) {
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="endscreen__card">
        <h2 className={`endscreen__title endscreen__title--${outcome.kind}`}>{outcome.title}</h2>
        <p className="endscreen__reason">{outcome.reason}</p>
        <div className="endscreen__actions">
          <button type="button" className="button--primary" onClick={onRematch}>
            Revanche
          </button>
          <button type="button" onClick={onNewBot}>
            Novo bot
          </button>
        </div>
      </div>
    </div>
  );
}
