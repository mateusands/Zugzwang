import { describe, expect, it } from 'vitest';
import { analysisProfileDepth, cacheSatisfies, parseAnalysisJobRequest } from '../src/quality.js';

const FEN = '8/8/8/8/8/8/4K3/7k w - - 0 1';

describe('analysis quality policy', () => {
  it('orders fast, deep and maximum by target depth', () => {
    expect(analysisProfileDepth('fast')).toBeLessThan(analysisProfileDepth('deep'));
    expect(analysisProfileDepth('deep')).toBeLessThan(analysisProfileDepth('maximum'));
  });

  it('lets a deeper MultiPV result satisfy a weaker request', () => {
    expect(cacheSatisfies({ depth: 26, multiPv: 2 }, { depth: 22, multiPv: 1 })).toBe(true);
  });

  it('never lets shallow or single-PV cache satisfy a stronger request', () => {
    expect(cacheSatisfies({ depth: 18, multiPv: 2 }, { depth: 26, multiPv: 2 })).toBe(false);
    expect(cacheSatisfies({ depth: 26, multiPv: 1 }, { depth: 22, multiPv: 2 })).toBe(false);
  });
});

describe('analysis job input', () => {
  it('accepts a bounded batch with unique keys', () => {
    expect(
      parseAnalysisJobRequest({
        profile: 'deep',
        items: [{ key: 'position-0', fen: FEN, multiPv: 2 }],
      }),
    ).toEqual({ profile: 'deep', items: [{ key: 'position-0', fen: FEN, multiPv: 2 }] });
  });

  it('rejects duplicate keys, empty batches and unknown profiles', () => {
    expect(
      parseAnalysisJobRequest({
        profile: 'fast',
        items: [
          { key: 'same', fen: FEN, multiPv: 1 },
          { key: 'same', fen: FEN, multiPv: 1 },
        ],
      }),
    ).toBeNull();
    expect(parseAnalysisJobRequest({ profile: 'deep', items: [] })).toBeNull();
    expect(
      parseAnalysisJobRequest({
        profile: 'infinite',
        items: [{ key: 'x', fen: FEN, multiPv: 1 }],
      }),
    ).toBeNull();
  });

  it('rejects malformed boards before they reach the Stockfish process', () => {
    for (const fen of [
      '8/8/8/8/8/8/8/9 w - - 0 1',
      '8/8/8/8/8/8/8/K7 w - - 0 1',
      '8/8/8/8/8/8/4K3/7k w invalid - 0 1',
    ]) {
      expect(
        parseAnalysisJobRequest({
          profile: 'fast',
          items: [{ key: 'x', fen, multiPv: 1 }],
        }),
      ).toBeNull();
    }
  });
});
