import { describe, expect, it } from 'vitest';
import { TranspositionTable, adaptiveDepth, orderMoves } from '../src/bot.js';

/**
 * Fase 4 — Peças internas da busca: ordenação de lances, profundidade
 * adaptativa e tabela de transposição.
 */

describe('orderMoves', () => {
  it('prioriza mate > promoção > captura > xeque > lance quieto', () => {
    const ordered = orderMoves(['a3', 'Nf3', 'exd5', 'Qh5+', 'e8=Q', 'Rf8#']);

    // Mate primeiro; promoção antes de captura; captura antes de xeque simples.
    expect(ordered[0]).toBe('Rf8#');
    expect(ordered.indexOf('e8=Q')).toBeLessThan(ordered.indexOf('exd5'));
    expect(ordered.indexOf('exd5')).toBeLessThan(ordered.indexOf('Qh5+'));
    // Lances quietos ficam por último.
    expect(ordered.slice(-2)).toEqual(expect.arrayContaining(['a3', 'Nf3']));
  });

  it('não perde nem duplica lances', () => {
    const input = ['a3', 'exd5', 'Rf8#'];

    expect(orderMoves(input).sort()).toEqual([...input].sort());
  });
});

describe('adaptiveDepth', () => {
  it('aprofunda a busca quando restam poucas peças (final)', () => {
    expect(adaptiveDepth(6, 3)).toBeGreaterThan(3);
  });

  it('mantém a profundidade base no meio-jogo cheio', () => {
    expect(adaptiveDepth(28, 3)).toBe(3);
  });
});

describe('TranspositionTable', () => {
  it('guarda e recupera uma entrada por posição', () => {
    const tt = new TranspositionTable();

    tt.set('fen-a', 3, 120, 'EXACT');

    expect(tt.get('fen-a')).toEqual({ depth: 3, score: 120, flag: 'EXACT' });
    expect(tt.get('desconhecida')).toBeUndefined();
  });

  it('prefere a entrada buscada em maior profundidade', () => {
    const tt = new TranspositionTable();

    tt.set('fen-a', 5, 200, 'LOWER');
    tt.set('fen-a', 2, 10, 'EXACT'); // mais rasa: não deve sobrescrever

    expect(tt.get('fen-a')?.depth).toBe(5);
    expect(tt.get('fen-a')?.score).toBe(200);
  });
});
