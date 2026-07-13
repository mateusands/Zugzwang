import { describe, expect, it } from 'vitest';
import { classifyPly, computeAccuracy, type PlyReviewInput } from '../src/review.js';

function input(overrides: Partial<PlyReviewInput> = {}): PlyReviewInput {
  return {
    mover: 'white',
    sanPlayed: 'e4',
    playedMove: 'e2e4',
    bestMoveBefore: 'd2d4',
    secondBestWinPercentBefore: null,
    winPercentBeforeMover: 50,
    winPercentAfterMover: 50,
    winPercentBeforeMoverPrevPly: null,
    sacrificedPieceType: null,
    isBookMove: false,
    ...overrides,
  };
}

describe('classifyPly', () => {
  it.each([
    [2, 'excellent'],
    [2.01, 'good'],
    [5, 'good'],
    [5.01, 'inaccuracy'],
    [10, 'inaccuracy'],
    [10.01, 'mistake'],
    [20, 'mistake'],
    [20.01, 'blunder'],
  ] as const)('classifica perda de %s como %s', (loss, expected) => {
    expect(
      classifyPly(input({ winPercentBeforeMover: 60, winPercentAfterMover: 60 - loss })).class,
    ).toBe(expected);
  });

  it('clampa ganho de win% como perda zero', () => {
    expect(
      classifyPly(input({ winPercentBeforeMover: 40, winPercentAfterMover: 55 })),
    ).toMatchObject({ class: 'excellent', winPercentLost: 0 });
  });

  it('reconhece o melhor lance pela igualdade UCI', () => {
    expect(classifyPly(input({ playedMove: 'e2e4', bestMoveBefore: 'e2e4' })).class).toBe('best');
  });

  it('aplica Livro antes das demais categorias', () => {
    expect(
      classifyPly(
        input({
          isBookMove: true,
          playedMove: 'e2e4',
          bestMoveBefore: 'e2e4',
          sacrificedPieceType: 'q',
        }),
      ).class,
    ).toBe('book');
  });

  it('reconhece um bom sacrifício de peça como Brilhante', () => {
    expect(
      classifyPly(
        input({
          winPercentBeforeMover: 55,
          winPercentAfterMover: 54,
          sacrificedPieceType: 'n',
        }),
      ).class,
    ).toBe('brilliant');
  });

  it('não chama de Brilhante sacrifício de peão, posição perdida ou vantagem esmagadora', () => {
    expect(classifyPly(input({ sacrificedPieceType: 'p' })).class).not.toBe('brilliant');
    expect(
      classifyPly(input({ sacrificedPieceType: 'r', winPercentAfterMover: 30 })).class,
    ).not.toBe('brilliant');
    expect(
      classifyPly(
        input({ sacrificedPieceType: 'r', winPercentBeforeMover: 95, winPercentAfterMover: 94 }),
      ).class,
    ).not.toBe('brilliant');
  });

  it('marca Miss quando uma grande oportunidade oferecida não é aproveitada', () => {
    expect(
      classifyPly(
        input({
          winPercentBeforeMoverPrevPly: 35,
          winPercentBeforeMover: 55,
          winPercentAfterMover: 45,
        }),
      ).class,
    ).toBe('miss');
  });

  it('marca Grande quando o único melhor lance salva uma posição difícil', () => {
    expect(
      classifyPly(
        input({
          playedMove: 'e2e4',
          bestMoveBefore: 'e2e4',
          winPercentBeforeMover: 40,
          winPercentAfterMover: 48,
          secondBestWinPercentBefore: 25,
        }),
      ).class,
    ).toBe('great');
  });

  it('respeita a precedência Livro > Brilhante > Miss > Grande > Melhor', () => {
    const all = input({
      isBookMove: true,
      sacrificedPieceType: 'q',
      playedMove: 'e2e4',
      bestMoveBefore: 'e2e4',
      winPercentBeforeMoverPrevPly: 20,
      winPercentBeforeMover: 50,
      winPercentAfterMover: 49,
      secondBestWinPercentBefore: 20,
    });
    expect(classifyPly(all).class).toBe('book');
    expect(classifyPly({ ...all, isBookMove: false }).class).toBe('brilliant');
  });
});

describe('computeAccuracy', () => {
  it('devolve 100 sem perda e 0 para uma perda extrema', () => {
    expect(computeAccuracy([0, 0])).toBe(100);
    expect(computeAccuracy([1000])).toBe(0);
  });

  it('calcula a média das accuracies por lance e limita em 0..100', () => {
    const expected = (100 + (103.1668 * Math.exp(-0.04354 * 10) - 3.1669)) / 2;
    expect(computeAccuracy([0, 10])).toBeCloseTo(expected, 5);
    expect(computeAccuracy([])).toBe(0);
  });
});
