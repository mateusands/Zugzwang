import { describe, expect, it } from 'vitest';
import { ChessEngine, IllegalMoveError } from '../src/engine.js';

/**
 * Fase 2 — Lances especiais e flags do resultado do lance. Cada cenário monta a
 * posição exata via FEN (fixture) e testa comportamento observável de fora.
 */

describe('ChessEngine — roque', () => {
  it('executa o roque pequeno quando é permitido', () => {
    // Dado rei e torre nas casas iniciais com direito a roque
    const engine = new ChessEngine('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');

    // Quando as brancas rocam pequeno
    const move = engine.move('O-O');

    // Então o rei vai para g1 e é marcado como roque do lado do rei
    expect(move.castle).toBe('kingside');
    expect(move.to).toBe('g1');
    expect(engine.turn).toBe('black');
  });

  it('executa o roque grande quando é permitido', () => {
    const engine = new ChessEngine('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');

    const move = engine.move('O-O-O');

    expect(move.castle).toBe('queenside');
    expect(move.to).toBe('c1');
  });

  it('proíbe o roque enquanto o rei está em xeque', () => {
    // Dado o rei branco em xeque por uma torre na coluna e
    const engine = new ChessEngine('r3k2r/8/8/8/4r3/8/8/R3K2R w KQkq - 0 1');

    // Então o roque não está entre os lances legais e é rejeitado
    expect(engine.movesFrom('e1')).not.toContain('O-O');
    expect(() => engine.move('O-O')).toThrow(IllegalMoveError);
  });
});

describe('ChessEngine — en passant', () => {
  it('executa a captura en passant e remove o peão capturado', () => {
    // Dado que as pretas acabaram de jogar f7-f5, com a casa f6 disponível
    const engine = new ChessEngine('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3');

    // Quando o peão branco de e5 captura en passant em f6
    const move = engine.move({ from: 'e5', to: 'f6' });

    // Então é captura en passant de um peão, e o peão de e5 chega em f6
    expect(move.isEnPassant).toBe(true);
    expect(move.isCapture).toBe(true);
    expect(move.captured).toBe('p');
    expect(move.to).toBe('f6');
  });

  it('só permite en passant no lance imediatamente seguinte (o direito expira)', () => {
    const engine = new ChessEngine('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3');

    // Quando um lance qualquer é intercalado antes da captura
    engine.move('a3');
    engine.move('a6');

    // Então a captura en passant deixa de ser legal
    expect(() => engine.move({ from: 'e5', to: 'f6' })).toThrow(IllegalMoveError);
  });
});

describe('ChessEngine — promoção de peão', () => {
  it('promove o peão a dama', () => {
    const engine = new ChessEngine('8/P7/8/8/8/8/8/k6K w - - 0 1');

    const move = engine.move({ from: 'a7', to: 'a8', promotion: 'q' });

    expect(move.promotion).toBe('q');
    expect(move.piece).toBe('p');
    expect(move.san).toContain('=Q');
  });

  it('permite subpromoção (a cavalo)', () => {
    const engine = new ChessEngine('8/P7/8/8/8/8/8/k6K w - - 0 1');

    const move = engine.move({ from: 'a7', to: 'a8', promotion: 'n' });

    expect(move.promotion).toBe('n');
    expect(move.san).toContain('=N');
  });

  it('rejeita a promoção quando a peça de promoção não é informada', () => {
    const engine = new ChessEngine('8/P7/8/8/8/8/8/k6K w - - 0 1');

    expect(() => engine.move({ from: 'a7', to: 'a8' })).toThrow(IllegalMoveError);
  });
});

describe('ChessEngine — flags de captura no resultado do lance', () => {
  it('marca captura simples e o tipo da peça capturada', () => {
    // Dado 1.e4 d5 2.exd5 — as brancas capturam um peão
    const engine = new ChessEngine();
    engine.move('e4');
    engine.move('d5');

    const capture = engine.move('exd5');

    expect(capture.isCapture).toBe(true);
    expect(capture.captured).toBe('p');
    expect(capture.isEnPassant).toBe(false);
  });
});
