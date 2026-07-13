import { describe, expect, it } from 'vitest';
import { formatScore, winPercent } from '../src/winprob.js';
import type { Score } from '../src/uci.js';

/**
 * Fase 9 — Centipawns → probabilidade de vitória das brancas.
 * Fórmula do lichess: Win% = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1),
 * com cp limitado a ±1000. Mate é certeza: 0 ou 100.
 */

const cp = (value: number): Score => ({ type: 'cp', value });
const mate = (winner: 'white' | 'black', movesToMate: number): Score => ({
  type: 'mate',
  movesToMate,
  winner,
});

describe('winPercent', () => {
  it('posição igual dá exatamente 50%', () => {
    expect(winPercent(cp(0))).toBe(50);
  });

  it('é simétrica: vantagem de um lado espelha a do outro', () => {
    for (const value of [50, 130, 400]) {
      expect(winPercent(cp(value)) + winPercent(cp(-value))).toBeCloseTo(100, 6);
    }
  });

  it('um peão de vantagem (~100cp) dá cerca de 59%', () => {
    expect(winPercent(cp(100))).toBeCloseTo(59.1, 1);
  });

  it('satura em ±1000cp (clamp)', () => {
    expect(winPercent(cp(5000))).toBe(winPercent(cp(1000)));
    expect(winPercent(cp(-5000))).toBe(winPercent(cp(-1000)));
  });

  it('mate é certeza absoluta, mesmo com mate na mesa', () => {
    expect(winPercent(mate('white', 5))).toBe(100);
    expect(winPercent(mate('black', 3))).toBe(0);
    expect(winPercent(mate('black', 0))).toBe(0);
  });
});

describe('formatScore', () => {
  it('formata centipawns em peões com sinal', () => {
    expect(formatScore(cp(130))).toBe('+1.3');
    expect(formatScore(cp(-50))).toBe('−0.5');
    expect(formatScore(cp(0))).toBe('0.0');
  });

  it('formata mate com o lado vencedor', () => {
    expect(formatScore(mate('white', 5))).toBe('M5');
    expect(formatScore(mate('black', 3))).toBe('−M3');
    expect(formatScore(mate('white', 0))).toBe('M0');
    expect(formatScore(mate('black', 0))).toBe('−M0');
  });
});
