import { describe, expect, it } from 'vitest';
import { fenToPieces } from '../src/fen.js';

/**
 * Fase 8 — Converter o campo de peças de um FEN na lista de peças que o
 * tabuleiro renderiza. É transcodificação de formato (sem regra de xadrez):
 * a web usa isso para mostrar posições passadas sem consultar o engine.
 */

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function pieceAt(fen: string, square: string) {
  return fenToPieces(fen).find((piece) => piece.square === square);
}

describe('fenToPieces', () => {
  it('converte a posição inicial em 32 peças nas casas corretas', () => {
    const pieces = fenToPieces(INITIAL_FEN);

    expect(pieces).toHaveLength(32);
    expect(pieceAt(INITIAL_FEN, 'a1')).toEqual({ square: 'a1', type: 'r', color: 'white' });
    expect(pieceAt(INITIAL_FEN, 'e7')).toEqual({ square: 'e7', type: 'p', color: 'black' });
    expect(pieceAt(INITIAL_FEN, 'd8')).toEqual({ square: 'd8', type: 'q', color: 'black' });
    expect(pieceAt(INITIAL_FEN, 'e1')).toEqual({ square: 'e1', type: 'k', color: 'white' });
  });

  it('posiciona corretamente uma posição de meio de jogo (após 1.e4 e5)', () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';

    expect(pieceAt(fen, 'e4')).toEqual({ square: 'e4', type: 'p', color: 'white' });
    expect(pieceAt(fen, 'e5')).toEqual({ square: 'e5', type: 'p', color: 'black' });
    expect(pieceAt(fen, 'e2')).toBeUndefined();
    expect(fenToPieces(fen)).toHaveLength(32);
  });

  it('ignora os campos do FEN além do primeiro (vez, roque, en passant...)', () => {
    const onlyBoard = fenToPieces('8/8/8/8/8/8/8/4K3');
    const fullFen = fenToPieces('8/8/8/8/8/8/8/4K3 w - - 0 1');

    expect(fullFen).toEqual(onlyBoard);
    expect(fullFen).toEqual([{ square: 'e1', type: 'k', color: 'white' }]);
  });

  it('devolve lista vazia para FEN malformado, sem lançar', () => {
    // 7 fileiras
    expect(fenToPieces('8/8/8/8/8/8/4K3 w - - 0 1')).toEqual([]);
    // caractere inválido
    expect(fenToPieces('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNX w KQkq - 0 1')).toEqual([]);
    // fileira com mais de 8 colunas
    expect(fenToPieces('rnbqkbnr/ppppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1')).toEqual([]);
    // string vazia
    expect(fenToPieces('')).toEqual([]);
  });
});
