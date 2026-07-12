import type { Difficulty, PieceColor } from './api.js';

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

function isSavedGame(value: unknown): value is SavedGame {
  if (typeof value !== 'object' || value === null) return false;
  const game = value as Record<string, unknown>;
  const result = game.result as Record<string, unknown> | null | undefined;
  return (
    typeof game.id === 'string' &&
    typeof game.savedAt === 'string' &&
    typeof game.difficulty === 'string' &&
    typeof game.playerColor === 'string' &&
    typeof game.pgn === 'string' &&
    isStringArray(game.sans) &&
    isStringArray(game.fens) &&
    typeof result === 'object' &&
    result !== null &&
    typeof result.kind === 'string' &&
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
 * one in place (keeps the auto-save idempotent); beyond the limit, the
 * oldest games are dropped.
 */
export function addSavedGame(games: SavedGame[], game: SavedGame): SavedGame[] {
  const existing = games.findIndex((saved) => saved.id === game.id);
  if (existing >= 0) {
    return games.map((saved, index) => (index === existing ? game : saved));
  }
  return [game, ...games].slice(0, SAVED_GAMES_LIMIT);
}

export function removeSavedGame(games: SavedGame[], id: string): SavedGame[] {
  return games.filter((game) => game.id !== id);
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
  while (list.length > 0) {
    try {
      storage.setItem(SAVED_GAMES_KEY, serializeSavedGames(list));
      return;
    } catch {
      list = list.slice(0, -1); // descarta a mais antiga (fim da lista)
    }
  }
}
