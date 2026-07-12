import { describe, expect, it } from 'vitest';
import { clampPly, moveRows, stepPly } from '../src/replay.js';

/**
 * Fase 8 — Navegação por plies. `viewPly` é um índice na lista de FENs
 * (0 = posição inicial; plyCount = sans.length).
 *
 * - Replay de partida salva: número puro, clampado com clampPly.
 * - Partida ao vivo: `null` representa "no presente"; stepPly entra e sai
 *   desse estado (avançar além do último ply volta ao vivo).
 */

describe('clampPly', () => {
  it('mantém um ply válido dentro do intervalo', () => {
    expect(clampPly(5, 10)).toBe(5);
  });

  it('limita nos extremos (0 e plyCount)', () => {
    expect(clampPly(99, 10)).toBe(10);
    expect(clampPly(-3, 10)).toBe(0);
  });
});

describe('stepPly — navegação na partida ao vivo', () => {
  it('recua e avança um ply a partir de uma posição passada', () => {
    expect(stepPly(5, -1, 10)).toBe(4);
    expect(stepPly(5, +1, 10)).toBe(6);
  });

  it('não recua além da posição inicial', () => {
    expect(stepPly(0, -1, 10)).toBe(0);
  });

  it('sai do presente para o último ply anterior ao recuar', () => {
    // Dado o modo ao vivo (null = presente), recuar mostra o ply anterior.
    expect(stepPly(null, -1, 10)).toBe(9);
  });

  it('volta ao presente ao avançar a partir do penúltimo ply', () => {
    expect(stepPly(9, +1, 10)).toBeNull();
  });

  it('avançar no presente continua no presente', () => {
    expect(stepPly(null, +1, 10)).toBeNull();
  });

  it('sem lances jogados, não há passado para navegar', () => {
    expect(stepPly(null, -1, 0)).toBeNull();
  });
});

describe('moveRows', () => {
  it('agrupa os lances em pares numerados de brancas e pretas', () => {
    expect(moveRows(['e4', 'e5', 'Nf3'])).toEqual([
      { number: 1, white: 'e4', whitePly: 1, black: 'e5', blackPly: 2 },
      { number: 2, white: 'Nf3', whitePly: 3, black: null, blackPly: null },
    ]);
  });

  it('sem lances, não há linhas', () => {
    expect(moveRows([])).toEqual([]);
  });
});
