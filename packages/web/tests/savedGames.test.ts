import { describe, expect, it } from 'vitest';
import {
  addSavedGame,
  parseSavedGames,
  readSavedGames,
  removeSavedGame,
  setGameReview,
  setGameReviewCache,
  SAVED_GAMES_KEY,
  SAVED_GAMES_LIMIT,
  serializeSavedGames,
  writeSavedGames,
  type GamesStorage,
  type SavedGame,
} from '../src/savedGames.js';
import { emptyMoveCounts, type GameReview, type ReviewCache } from '../src/gameReview.js';

/**
 * Fase 8 — Armazenamento de partidas encerradas no navegador.
 * Envelope versionado ({ v: 1, games }) na chave 'zugzwang:games';
 * dados corrompidos ou de versão desconhecida degradam para lista vazia
 * (o app nunca pode quebrar no mount por causa do storage).
 */

function sampleGame(id: string, savedAt = '2026-07-12T12:00:00.000Z'): SavedGame {
  return {
    id,
    savedAt,
    difficulty: 'medium',
    playerColor: 'white',
    result: { kind: 'win', status: 'checkmate', winner: 'white', resigned: false },
    sans: ['e4', 'e5'],
    fens: ['fen0', 'fen1', 'fen2'],
    pgn: '1. e4 e5',
  };
}

function sampleReview(): GameReview {
  return {
    plies: [],
    accuracy: { white: 0, black: 0 },
    counts: { white: emptyMoveCounts(), black: emptyMoveCounts() },
  };
}

function sampleCache(): ReviewCache {
  return {
    fen0: {
      quality: 'quick',
      multiPv: 1,
      evaluation: {
        score: { type: 'cp', value: 20 },
        winPercent: 52,
        bestMove: 'e2e4',
        depth: 12,
        secondLine: null,
      },
    },
  };
}

/** Storage em memória para os testes (Vitest roda em node, sem localStorage). */
function fakeStorage(initial: Record<string, string> = {}): GamesStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe('parseSavedGames', () => {
  it('chave inexistente resulta em lista vazia', () => {
    expect(parseSavedGames(null)).toEqual([]);
  });

  it('JSON corrompido resulta em lista vazia, sem lançar', () => {
    expect(parseSavedGames('{oops')).toEqual([]);
  });

  it('versão desconhecida do envelope resulta em lista vazia', () => {
    expect(parseSavedGames(JSON.stringify({ v: 2, games: [sampleGame('a')] }))).toEqual([]);
  });

  it('filtra entradas inválidas, preservando as válidas', () => {
    const valid = sampleGame('a');
    const invalid = { ...sampleGame('b'), fens: undefined };
    const raw = JSON.stringify({ v: 1, games: [valid, invalid] });

    expect(parseSavedGames(raw)).toEqual([valid]);
  });

  it('filtra entradas com dificuldade ou resultado fora dos valores conhecidos', () => {
    const tamperedDifficulty = { ...sampleGame('a'), difficulty: 'impossible' };
    const tamperedKind = {
      ...sampleGame('b'),
      result: { ...sampleGame('b').result, kind: 'weird' },
    };
    const raw = JSON.stringify({ v: 1, games: [tamperedDifficulty, tamperedKind] });

    expect(parseSavedGames(raw)).toEqual([]);
  });

  it('filtra entradas que quebram o invariante fens = sans + 1', () => {
    const truncated = { ...sampleGame('a'), fens: ['fen0', 'fen1'] }; // sans tem 2 lances

    expect(parseSavedGames(JSON.stringify({ v: 1, games: [truncated] }))).toEqual([]);
  });

  it('round-trip serialize → parse preserva a lista', () => {
    const games = [{ ...sampleGame('a'), reviewCache: sampleCache() }, sampleGame('b')];

    expect(parseSavedGames(serializeSavedGames(games))).toEqual(games);
  });
});

describe('addSavedGame', () => {
  it('adiciona a partida mais recente na frente da lista', () => {
    const list = addSavedGame([sampleGame('old')], sampleGame('new'));

    expect(list.map((game) => game.id)).toEqual(['new', 'old']);
  });

  it('substituir uma partida já salva não duplica (auto-save idempotente)', () => {
    const list = addSavedGame([sampleGame('a'), sampleGame('b')], sampleGame('a'));

    expect(list.map((game) => game.id)).toEqual(['a', 'b']);
    expect(list).toHaveLength(2);
  });

  it('regravar uma partida preserva o savedAt original (reload não muda a data)', () => {
    // Dado uma partida salva no fim do jogo
    const original = sampleGame('a', '2026-07-12T12:00:00.000Z');
    // Quando o auto-save roda de novo (F5 com a partida encerrada restaurada)
    const resaved = sampleGame('a', '2026-07-13T09:30:00.000Z');
    const list = addSavedGame([original], resaved);

    // Então a data de término registrada não muda
    expect(list[0]?.savedAt).toBe('2026-07-12T12:00:00.000Z');
  });

  it('regravar após F5 preserva uma revisão já persistida', () => {
    const review = sampleReview();
    const original = { ...sampleGame('a'), review };

    const list = addSavedGame([original], sampleGame('a'));

    expect(list[0]?.review).toBe(review);
  });

  it('regravar após F5 preserva o cache parcial de análise', () => {
    const reviewCache = sampleCache();
    const original = { ...sampleGame('a'), reviewCache };

    const list = addSavedGame([original], sampleGame('a'));

    expect(list[0]?.reviewCache).toBe(reviewCache);
  });

  it('descarta a partida mais antiga ao passar do limite', () => {
    const full = Array.from({ length: SAVED_GAMES_LIMIT }, (_, i) => sampleGame(`g${i}`));

    const list = addSavedGame(full, sampleGame('newest'));

    expect(list).toHaveLength(SAVED_GAMES_LIMIT);
    expect(list[0]?.id).toBe('newest');
    // A última da lista original (mais antiga) saiu.
    expect(list.some((game) => game.id === `g${SAVED_GAMES_LIMIT - 1}`)).toBe(false);
  });
});

describe('removeSavedGame', () => {
  it('remove a partida pelo id, preservando as demais', () => {
    const list = removeSavedGame([sampleGame('a'), sampleGame('b')], 'a');

    expect(list.map((game) => game.id)).toEqual(['b']);
  });

  it('id inexistente não altera a lista', () => {
    const original = [sampleGame('a')];

    expect(removeSavedGame(original, 'x')).toEqual(original);
  });
});

describe('setGameReview', () => {
  it('associa a revisão pelo id preservando os demais campos e partidas', () => {
    const review = sampleReview();
    const original = [sampleGame('a'), sampleGame('b')];

    const updated = setGameReview(original, 'a', review);

    expect(updated[0]).toEqual({ ...original[0], review });
    expect(updated[1]).toBe(original[1]);
  });

  it('ao finalizar a revisão remove o cache parcial para não duplicar dados', () => {
    const original = [{ ...sampleGame('a'), reviewCache: sampleCache() }];

    const updated = setGameReview(original, 'a', sampleReview());

    expect(updated[0]?.review).toEqual(sampleReview());
    expect(updated[0]?.reviewCache).toBeUndefined();
  });
});

describe('setGameReviewCache', () => {
  it('persiste progresso parcial pelo id sem alterar as outras partidas', () => {
    const original = [sampleGame('a'), sampleGame('b')];
    const reviewCache = sampleCache();

    const updated = setGameReviewCache(original, 'a', reviewCache);

    expect(updated[0]).toEqual({ ...original[0], reviewCache });
    expect(updated[1]).toBe(original[1]);
  });
});

describe('readSavedGames / writeSavedGames', () => {
  it('lê as partidas gravadas no storage', () => {
    const games = [sampleGame('a')];
    const storage = fakeStorage({ [SAVED_GAMES_KEY]: serializeSavedGames(games) });

    expect(readSavedGames(storage)).toEqual(games);
  });

  it('grava e lê de volta (round-trip pelo storage)', () => {
    const storage = fakeStorage();
    const games = [sampleGame('a'), sampleGame('b')];

    writeSavedGames(games, storage);

    expect(readSavedGames(storage)).toEqual(games);
  });

  it('gravar uma lista vazia persiste (apagar a última partida não ressuscita a anterior)', () => {
    const storage = fakeStorage({ [SAVED_GAMES_KEY]: serializeSavedGames([sampleGame('a')]) });

    writeSavedGames([], storage);

    expect(readSavedGames(storage)).toEqual([]);
  });

  it('com a quota cheia, descarta as mais antigas até caber', () => {
    // Dado um storage que rejeita as duas primeiras gravações por falta de espaço
    let failures = 2;
    const storage = fakeStorage();
    const failing: GamesStorage = {
      getItem: storage.getItem,
      setItem: (key, value) => {
        if (failures > 0) {
          failures -= 1;
          throw new DOMException('quota', 'QuotaExceededError');
        }
        storage.setItem(key, value);
      },
    };
    const games = [sampleGame('a'), sampleGame('b'), sampleGame('c')];

    // Quando gravo a lista
    writeSavedGames(games, failing);

    // Então as duas mais antigas foram descartadas e o restante foi gravado
    expect(readSavedGames(storage).map((game) => game.id)).toEqual(['a']);
  });

  it('se nada couber, desiste silenciosamente sem lançar', () => {
    const failing: GamesStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    };

    expect(() => writeSavedGames([sampleGame('a')], failing)).not.toThrow();
  });
});
