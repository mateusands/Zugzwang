import { describe, expect, it } from 'vitest';
import { ChessEngine } from '../src/engine.js';

/**
 * Fase 2 — Detecção de fim de jogo. Cada cenário monta a posição-limite exata
 * via FEN (fixture) em vez de jogar a partida inteira.
 */

describe('ChessEngine — detecção de fim de jogo', () => {
  it('reconhece xeque sem ser xeque-mate (o rei ainda tem fuga)', () => {
    // Dado um rei branco em xeque por uma torre na coluna e, com casas de fuga
    const engine = new ChessEngine('4r1k1/8/8/8/8/8/8/4K3 w - - 0 1');

    // Então está em xeque, mas o jogo continua
    expect(engine.isCheck()).toBe(true);
    expect(engine.status).toBe('check');
    expect(engine.isCheckmate()).toBe(false);
    expect(engine.isGameOver()).toBe(false);
  });

  it('reconhece xeque-mate (mate do bobo) e aponta o vencedor', () => {
    // Dado o mate do bobo
    const engine = new ChessEngine();
    engine.move('f3');
    engine.move('e5');
    engine.move('g4');

    // Quando as pretas dão o mate
    const mate = engine.move('Qh4#');

    // Então é xeque-mate, fim de jogo, e as pretas venceram
    expect(mate.checkmate).toBe(true);
    expect(engine.isCheckmate()).toBe(true);
    expect(engine.status).toBe('checkmate');
    expect(engine.isGameOver()).toBe(true);
    expect(engine.winner()).toBe('black');
  });

  it('reconhece afogamento (stalemate) — sem lance legal e sem xeque', () => {
    // Dado o rei preto afogado no canto
    const engine = new ChessEngine('7k/8/6Q1/6K1/8/8/8/8 b - - 0 1');

    expect(engine.isCheck()).toBe(false);
    expect(engine.isStalemate()).toBe(true);
    expect(engine.status).toBe('stalemate');
    expect(engine.isGameOver()).toBe(true);
    expect(engine.winner()).toBeNull();
  });

  it('reconhece empate por material insuficiente (rei contra rei)', () => {
    const engine = new ChessEngine('7k/8/8/8/8/8/8/7K w - - 0 1');

    expect(engine.isInsufficientMaterial()).toBe(true);
    expect(engine.isDraw()).toBe(true);
    expect(engine.isGameOver()).toBe(true);
    expect(engine.winner()).toBeNull();
  });

  it('reconhece empate por tríplice repetição', () => {
    // Dado cavalos indo e voltando até repetir a posição 3 vezes
    const engine = new ChessEngine();
    for (let i = 0; i < 2; i++) {
      engine.move('Nf3');
      engine.move('Nf6');
      engine.move('Ng1');
      engine.move('Ng8');
    }

    expect(engine.isThreefoldRepetition()).toBe(true);
    expect(engine.isDraw()).toBe(true);
  });
});
