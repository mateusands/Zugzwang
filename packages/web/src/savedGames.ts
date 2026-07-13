import type { Difficulty, PieceColor } from './api.js';
import { isGameReview, isReviewCache, type GameReview, type ReviewCache } from './gameReview.js';

// Partidas encerradas ficam no navegador, na chave 'zugzwang:games' (a chave
// 'zugzwang:game' — partida em andamento — é outra coisa e não muda). Cada
// registro é autossuficiente: o replay navega por sans/fens sem engine nem
// rede, e o pgn fica guardado para a revisão de partida (Fase 10).

export interface SavedGameResult {
  /** Resultado do ponto de vista do jogador. */
  kind: 'win' | 'loss' | 'draw';
  /** Status final reportado pelo server ('checkmate', 'draw'...). */
  status: string;
  winner: PieceColor | null;
  resigned: boolean;
}

export interface SavedGame {
  /** Id da partida no server — chave de deduplicação do auto-save. */
  id: string;
  /** Momento do salvamento, ISO 8601. */
  savedAt: string;
  difficulty: Difficulty;
  /** Hoje o humano é sempre as brancas; campo já previsto para o futuro. */
  playerColor: PieceColor;
  result: SavedGameResult;
  /** Lances em SAN, em ordem. */
  sans: string[];
  /** Posição inicial + posição após cada ply (sans.length + 1 itens). */
  fens: string[];
  pgn: string;
  /** Resultado persistido da Fase 10; ausente em partidas antigas. */
  review?: GameReview;
  /** Progresso parcial da análise, para retomar sem voltar ao zero. */
  reviewCache?: ReviewCache;
}

/** Envelope versionado gravado no storage; `v` permite migrar o formato. */
interface SavedGamesFile {
  v: 1;
  games: SavedGame[];
}

export const SAVED_GAMES_KEY = 'zugzwang:games';
/** Mantém as N partidas mais recentes; além disso, as antigas são descartadas. */
export const SAVED_GAMES_LIMIT = 50;

/** O subconjunto de localStorage que usamos — injetável para testar sem DOM. */
export interface GamesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

// Uniões validadas por valor (não só por typeof): storage é input externo.
const RESULT_KINDS: ReadonlySet<unknown> = new Set(['win', 'loss', 'draw']);
const DIFFICULTIES: ReadonlySet<unknown> = new Set(['easy', 'medium', 'hard']);

function isSavedGame(value: unknown): value is SavedGame {
  if (typeof value !== 'object' || value === null) return false;
  const game = value as Record<string, unknown>;
  const result = game.result as Record<string, unknown> | null | undefined;
  return (
    typeof game.id === 'string' &&
    typeof game.savedAt === 'string' &&
    DIFFICULTIES.has(game.difficulty) &&
    typeof game.playerColor === 'string' &&
    typeof game.pgn === 'string' &&
    isStringArray(game.sans) &&
    isStringArray(game.fens) &&
    game.fens.length === game.sans.length + 1 &&
    (game.review === undefined || isGameReview(game.review)) &&
    (game.reviewCache === undefined || isReviewCache(game.reviewCache)) &&
    typeof result === 'object' &&
    result !== null &&
    RESULT_KINDS.has(result.kind) &&
    typeof result.status === 'string'
  );
}

/**
 * Parse the stored payload. Anything unexpected — missing key, corrupted
 * JSON, unknown envelope version, malformed entries — degrades to an empty
 * (or partial) list. Never throws: the app mount must survive bad storage.
 */
export function parseSavedGames(raw: string | null): SavedGame[] {
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<SavedGamesFile> | null;
    if (parsed === null || parsed.v !== 1 || !Array.isArray(parsed.games)) return [];
    return parsed.games.filter(isSavedGame);
  } catch {
    return [];
  }
}

export function serializeSavedGames(games: SavedGame[]): string {
  const file: SavedGamesFile = { v: 1, games };
  return JSON.stringify(file);
}

/**
 * Prepend a game to the list. A game with the same id replaces the stored
 * one in place, keeping the original savedAt (a finished game is immutable —
 * re-saving on reload must not shift its date); beyond the limit, the oldest
 * games are dropped.
 */
export function addSavedGame(games: SavedGame[], game: SavedGame): SavedGame[] {
  const existing = games.find((saved) => saved.id === game.id);
  if (existing) {
    const review = game.review ?? existing.review;
    const reviewCache = review ? undefined : (game.reviewCache ?? existing.reviewCache);
    const replacement: SavedGame = {
      ...game,
      savedAt: existing.savedAt,
      ...(review ? { review } : {}),
      ...(reviewCache ? { reviewCache } : {}),
    };
    return games.map((saved) => (saved.id === game.id ? replacement : saved));
  }
  return [game, ...games].slice(0, SAVED_GAMES_LIMIT);
}

export function removeSavedGame(games: SavedGame[], id: string): SavedGame[] {
  return games.filter((game) => game.id !== id);
}

export function setGameReview(games: SavedGame[], id: string, review: GameReview): SavedGame[] {
  return games.map((game) => {
    if (game.id !== id) return game;
    const { reviewCache: _discarded, ...finished } = game;
    return { ...finished, review };
  });
}

export function setGameReviewCache(
  games: SavedGame[],
  id: string,
  reviewCache: ReviewCache,
): SavedGame[] {
  return games.map((game) => (game.id === id && !game.review ? { ...game, reviewCache } : game));
}

export function readSavedGames(storage: GamesStorage): SavedGame[] {
  return parseSavedGames(storage.getItem(SAVED_GAMES_KEY));
}

/**
 * Persist the list. On quota errors, drop the oldest game and retry until it
 * fits; if nothing fits, give up silently (saved games are a convenience —
 * they must never break the live game).
 */
export function writeSavedGames(games: SavedGame[], storage: GamesStorage): void {
  let list = games;
  for (;;) {
    try {
      storage.setItem(SAVED_GAMES_KEY, serializeSavedGames(list));
      return;
    } catch {
      if (list.length === 0) return; // nem o envelope vazio coube: desiste
      list = list.slice(0, -1); // descarta a mais antiga (fim da lista)
    }
  }
}
