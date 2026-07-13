import { describe, expect, it } from 'vitest';
import { parseBestMove, parseInfoLine, turnOfFen } from '../src/uci.js';

const WHITE_TO_MOVE = '8/8/8/8/8/8/4K3/7k w - - 0 1';
const BLACK_TO_MOVE = '8/8/8/8/8/8/4K3/7k b - - 0 1';

describe('shared UCI protocol', () => {
  it('normalizes cp and WDL to White when Black is to move', () => {
    const parsed = parseInfoLine(
      'info depth 22 multipv 1 score cp 40 wdl 600 250 150 nodes 9000 nps 3000 time 3000 pv h1g1',
      'black',
    );

    expect(parsed).toEqual({
      depth: 22,
      multiPv: 1,
      score: { type: 'cp', value: -40 },
      wdl: { white: 150, draw: 250, black: 600 },
      nodes: 9000,
      nps: 3000,
      timeMs: 3000,
      pv: ['h1g1'],
    });
  });

  it('keeps MultiPV lines separate and ignores bound scores', () => {
    expect(
      parseInfoLine('info depth 26 multipv 2 score cp 15 nodes 50 time 2 pv e2e4', 'white'),
    ).toMatchObject({ depth: 26, multiPv: 2, pv: ['e2e4'] });
    expect(parseInfoLine('info depth 26 score cp 15 lowerbound pv e2e4', 'white')).toBeNull();
  });

  it('represents mate zero with an explicit winner', () => {
    expect(parseInfoLine('info depth 0 score mate 0', 'white')?.score).toEqual({
      type: 'mate',
      movesToMate: 0,
      winner: 'black',
    });
  });

  it('reads turn and bestmove without chess rules', () => {
    expect(turnOfFen(WHITE_TO_MOVE)).toBe('white');
    expect(turnOfFen(BLACK_TO_MOVE)).toBe('black');
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4');
    expect(parseBestMove('bestmove (none)')).toBeNull();
  });
});
