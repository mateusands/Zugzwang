import { useState } from 'react';
import { gameOutcome } from '../outcome.js';
import type { SavedGame } from '../savedGames.js';
import { ConfirmDialog } from './ConfirmDialog.js';

interface SavedGamesDialogProps {
  games: SavedGame[];
  onReplay: (game: SavedGame) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Lista de partidas salvas: rever (replay), apagar ou fechar. */
export function SavedGamesDialog({ games, onReplay, onDelete, onClose }: SavedGamesDialogProps) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <div className="overlay overlay--screen" role="dialog" aria-modal="true">
      <div className="saved-games">
        <h2 className="saved-games__title">Partidas salvas</h2>

        {games.length === 0 ? (
          <p className="saved-games__empty">Nenhuma partida salva ainda.</p>
        ) : (
          <ul className="saved-games__list">
            {games.map((game) => {
              const outcome = gameOutcome(
                game.result.status,
                game.result.winner,
                game.result.resigned,
              );
              return (
                <li key={game.id} className="saved-games__item">
                  <button
                    type="button"
                    className="saved-games__game"
                    onClick={() => onReplay(game)}
                    title="Rever a partida"
                  >
                    <span className={`saved-games__result saved-games__result--${outcome.kind}`}>
                      {outcome.title}
                    </span>
                    <span className="saved-games__meta">
                      {outcome.reason} · {game.sans.length} lances · {game.difficulty}
                    </span>
                    <span className="saved-games__date">{formatDate(game.savedAt)}</span>
                  </button>
                  <button
                    type="button"
                    className="saved-games__delete"
                    aria-label="Apagar partida"
                    onClick={() => setConfirmDelete(game.id)}
                  >
                    🗑
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="saved-games__actions">
          <button type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>

      {confirmDelete !== null ? (
        <ConfirmDialog
          text="Apagar esta partida?"
          confirmLabel="Apagar"
          onConfirm={() => {
            onDelete(confirmDelete);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      ) : null}
    </div>
  );
}
