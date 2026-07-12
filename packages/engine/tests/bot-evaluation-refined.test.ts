import { describe, expect, it } from 'vitest';
import { ChessEngine } from '../src/engine.js';
import { evaluate } from '../src/bot.js';

/**
 * Fase 4 — Termos refinados da avaliação (estrutura de peões, segurança do rei,
 * controle de centro). Cada par de posições é escolhido para ter o MESMO valor
 * de material e de piece-square table, isolando o termo sob teste.
 */

describe('bot — avaliação refinada', () => {
  it('penaliza peões dobrados', () => {
    // e4+e3 (dobrados na coluna e) vs e4+c4 (mesmo PST somado, sem dobro).
    const doubled = new ChessEngine('4k3/8/8/8/4P3/4P3/8/4K3 w - - 0 1');
    const notDoubled = new ChessEngine('4k3/8/8/8/2P1P3/8/8/4K3 w - - 0 1');

    expect(evaluate(doubled)).toBeLessThan(evaluate(notDoubled));
  });

  it('penaliza peões isolados', () => {
    // b4+c4 se apoiam (conectados); a4+c4 são ambos isolados. PST de todos = 0.
    const connected = new ChessEngine('4k3/8/8/8/1PP5/8/8/4K3 w - - 0 1');
    const isolated = new ChessEngine('4k3/8/8/8/P1P5/8/8/4K3 w - - 0 1');

    expect(evaluate(isolated)).toBeLessThan(evaluate(connected));
  });

  it('valoriza a segurança do rei (escudo de peões)', () => {
    // Rei em g1; peões f2,g2,h2 (adjacentes, escudo) vs a2,b2,c2 (longe).
    // Soma de PST dos peões é 25 nos dois casos, isolando o escudo.
    const sheltered = new ChessEngine('4k3/8/8/8/8/8/5PPP/6K1 w - - 0 1');
    const exposed = new ChessEngine('4k3/8/8/8/8/8/PPP5/6K1 w - - 0 1');

    expect(evaluate(sheltered)).toBeGreaterThan(evaluate(exposed));
  });

  it('valoriza a ocupação do centro', () => {
    // Bispo em e4 (central) vs c4 (flanco); ambos com PST 10, isolando o centro.
    const central = new ChessEngine('4k3/8/8/8/4B3/8/8/4K3 w - - 0 1');
    const offCenter = new ChessEngine('4k3/8/8/8/2B5/8/8/4K3 w - - 0 1');

    expect(evaluate(central)).toBeGreaterThan(evaluate(offCenter));
  });
});
