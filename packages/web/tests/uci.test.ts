import { describe, expect, it } from 'vitest';
import {
  chooseEngineFlavor,
  goCommand,
  parseBestMove,
  parseEngineManifest,
  parseInfoLine,
  positionCommand,
  threadCount,
  turnOfFen,
} from '../src/uci.js';

/**
 * Fase 9 — Protocolo UCI (Stockfish) em funções puras.
 *
 * O score bruto do Stockfish é do ponto de vista do LADO A MOVER; o parser
 * normaliza para o ponto de vista das BRANCAS (+ favorece brancas), a mesma
 * convenção do engine do projeto. Mate carrega o vencedor explícito, porque
 * `score mate 0` (lado a mover já está em mate) não cabe num inteiro assinado.
 */

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const BLACK_TO_MOVE = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

describe('turnOfFen', () => {
  it('lê o lado a mover do segundo campo do FEN', () => {
    expect(turnOfFen(START_FEN)).toBe('white');
    expect(turnOfFen(BLACK_TO_MOVE)).toBe('black');
  });
});

describe('parseInfoLine', () => {
  it('parseia score cp com profundidade e linha principal', () => {
    const line =
      'info depth 12 seldepth 18 multipv 1 score cp 35 nodes 500000 nps 900000 time 550 pv e2e4 e7e5';

    expect(parseInfoLine(line, 'white')).toEqual({
      depth: 12,
      multiPv: 1,
      score: { type: 'cp', value: 35 },
      pv: ['e2e4', 'e7e5'],
    });
  });

  it('normaliza o score para o ponto de vista das brancas quando é a vez das pretas', () => {
    const line = 'info depth 12 multipv 1 score cp 35 pv e7e5';

    expect(parseInfoLine(line, 'black')?.score).toEqual({ type: 'cp', value: -35 });
  });

  it('normaliza WDL para as brancas e expõe Expected Points sem custo de busca extra', () => {
    expect(
      parseInfoLine('info depth 14 score cp 20 wdl 500 300 200 pv e2e4', 'white')?.wdl,
    ).toEqual({ white: 500, draw: 300, black: 200 });
    expect(
      parseInfoLine('info depth 14 score cp 20 wdl 500 300 200 pv e7e5', 'black')?.wdl,
    ).toEqual({ white: 200, draw: 300, black: 500 });
  });

  it('mate positivo é do lado a mover; negativo, do adversário', () => {
    expect(parseInfoLine('info depth 10 score mate 3 pv h5f7', 'white')?.score).toEqual({
      type: 'mate',
      movesToMate: 3,
      winner: 'white',
    });
    expect(parseInfoLine('info depth 10 score mate 3 pv h4f2', 'black')?.score).toEqual({
      type: 'mate',
      movesToMate: 3,
      winner: 'black',
    });
    expect(parseInfoLine('info depth 10 score mate -2 pv e8f8', 'white')?.score).toEqual({
      type: 'mate',
      movesToMate: 2,
      winner: 'black',
    });
  });

  it('mate 0 significa que o lado a mover já está em mate', () => {
    // Dado o mate na mesa com as brancas a mover, o vencedor são as pretas.
    expect(parseInfoLine('info depth 0 score mate 0', 'white')?.score).toEqual({
      type: 'mate',
      movesToMate: 0,
      winner: 'black',
    });
  });

  it('preserva o índice de linhas multipv secundárias e ignora limites de janela', () => {
    expect(parseInfoLine('info depth 12 multipv 2 score cp 20 pv d2d4', 'white')).toEqual({
      depth: 12,
      multiPv: 2,
      score: { type: 'cp', value: 20 },
      pv: ['d2d4'],
    });
    expect(parseInfoLine('info depth 12 score cp 35 lowerbound pv e2e4', 'white')).toBeNull();
    expect(parseInfoLine('info depth 12 score cp 35 upperbound pv e2e4', 'white')).toBeNull();
  });

  it('ignora linhas info sem score e linhas que não são info', () => {
    expect(parseInfoLine('info depth 12 currmove e2e4 currmovenumber 1', 'white')).toBeNull();
    expect(parseInfoLine('Stockfish 17 by the Stockfish developers', 'white')).toBeNull();
    expect(parseInfoLine('readyok', 'white')).toBeNull();
    expect(parseInfoLine('', 'white')).toBeNull();
  });

  it('linha com score mas sem pv parseia com pv vazio', () => {
    expect(parseInfoLine('info depth 5 score cp -10', 'white')).toEqual({
      depth: 5,
      multiPv: 1,
      score: { type: 'cp', value: -10 },
      pv: [],
    });
  });
});

describe('parseBestMove', () => {
  it('extrai o melhor lance, com ou sem ponder', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4');
    expect(parseBestMove('bestmove g1f3')).toBe('g1f3');
  });

  it('posição terminal devolve null; linha alheia devolve undefined', () => {
    expect(parseBestMove('bestmove (none)')).toBeNull();
    expect(parseBestMove('info depth 5 score cp 0')).toBeUndefined();
  });
});

describe('builders de comando', () => {
  it('monta position e go', () => {
    expect(positionCommand(START_FEN)).toBe(`position fen ${START_FEN}`);
    expect(goCommand({ depth: 18 })).toBe('go depth 18');
    expect(goCommand({ movetime: 800 })).toBe('go movetime 800');
  });
});

describe('parseEngineManifest', () => {
  it('aceita o manifest gerado pelo copy-engine', () => {
    const raw = JSON.stringify({ v: 1, mt: 'sf-lite.js', st: 'sf-lite-single.js' });

    expect(parseEngineManifest(raw)).toEqual({ mt: 'sf-lite.js', st: 'sf-lite-single.js' });
  });

  it('rejeita JSON corrompido, versão desconhecida ou campos faltando', () => {
    expect(parseEngineManifest('{oops')).toBeNull();
    expect(parseEngineManifest(JSON.stringify({ v: 2, mt: 'a.js', st: 'b.js' }))).toBeNull();
    expect(parseEngineManifest(JSON.stringify({ v: 1, mt: 'a.js' }))).toBeNull();
    expect(parseEngineManifest(JSON.stringify({ v: 1, mt: 1, st: 'b.js' }))).toBeNull();
  });
});

describe('escolha de flavor e threads', () => {
  it('usa multi-thread só em página cross-origin isolated', () => {
    expect(chooseEngineFlavor(true)).toBe('mt');
    expect(chooseEngineFlavor(false)).toBe('st');
  });

  it('reserva um núcleo para a UI e limita a 4 threads', () => {
    expect(threadCount(8)).toBe(4);
    expect(threadCount(4)).toBe(3);
    expect(threadCount(2)).toBe(1);
    expect(threadCount(1)).toBe(1);
    expect(threadCount(undefined)).toBe(1);
  });
});
