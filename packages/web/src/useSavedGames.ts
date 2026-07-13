import { useCallback, useState } from 'react';
import {
  addSavedGame,
  readSavedGames,
  removeSavedGame,
  setGameReview,
  setGameReviewCache,
  writeSavedGames,
  type SavedGame,
} from './savedGames.js';
import type { GameReview } from './gameReview.js';
import type { ReviewCache } from './gameReview.js';

/**
 * Estado e ações da lista de partidas salvas (localStorage). A leitura
 * acontece ao abrir a lista, para refletir o que outras abas gravaram.
 */
export function useSavedGames() {
  const [savedGames, setSavedGames] = useState<SavedGame[]>([]);
  const [showList, setShowList] = useState(false);

  const openList = useCallback(() => {
    setSavedGames(readSavedGames(localStorage));
    setShowList(true);
  }, []);

  const closeList = useCallback(() => setShowList(false), []);

  // Updater puro: o efeito colateral (gravar) fica fora do setState.
  const deleteGame = useCallback(
    (id: string) => {
      const list = removeSavedGame(savedGames, id);
      setSavedGames(list);
      writeSavedGames(list, localStorage);
    },
    [savedGames],
  );

  /** Grava uma partida encerrada (idempotente: dedupe por id, savedAt estável). */
  const saveFinished = useCallback((saved: SavedGame) => {
    writeSavedGames(addSavedGame(readSavedGames(localStorage), saved), localStorage);
  }, []);

  const saveReview = useCallback((id: string, review: GameReview) => {
    const list = setGameReview(readSavedGames(localStorage), id, review);
    writeSavedGames(list, localStorage);
    setSavedGames(list);
  }, []);

  /** Persiste progresso parcial sem re-render a cada posição analisada. */
  const saveReviewCache = useCallback((id: string, reviewCache: ReviewCache) => {
    const list = setGameReviewCache(readSavedGames(localStorage), id, reviewCache);
    writeSavedGames(list, localStorage);
  }, []);

  return {
    savedGames,
    showList,
    openList,
    closeList,
    deleteGame,
    saveFinished,
    saveReview,
    saveReviewCache,
  };
}
