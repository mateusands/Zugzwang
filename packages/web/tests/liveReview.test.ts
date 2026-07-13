import { describe, expect, it } from 'vitest';
import {
  isObsoleteLiveBatch,
  liveReviewItems,
  mergeLiveReviewResults,
  pruneLiveReviewCache,
} from '../src/liveReview.js';
import type { ReviewCache } from '../src/gameReview.js';
import type { Evaluation } from '../src/stockfishClient.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_A3 = 'rnbqkbnr/pppppppp/8/8/8/P7/1PPPPPPP/RNBQKBNR b KQkq - 0 1';
const AFTER_A6 = 'rnbqkbnr/1ppppppp/p7/8/8/P7/1PPPPPPP/RNBQKBNR w KQkq - 0 2';

function evaluation(bestMove: string): Evaluation {
  return {
    score: { type: 'cp', value: 10 },
    winPercent: 51,
    bestMove,
    depth: 18,
    secondLine: null,
  };
}

describe('live review pre-analysis', () => {
  it('requests only non-book positions that are not cached or in flight', () => {
    const cache: ReviewCache = {
      [START]: { evaluation: evaluation('a2a3'), quality: 'quick', multiPv: 1 },
    };

    expect(
      liveReviewItems(['a3', 'a6'], [START, AFTER_A3, AFTER_A6], cache, new Set([AFTER_A3])),
    ).toEqual([{ key: '2', fen: AFTER_A6, multiPv: 1 }]);
    expect(liveReviewItems(['e4', 'e5'], [START, AFTER_A3, AFTER_A6], {}, new Set())).toEqual([]);
  });

  it('merges partial results as quick cache entries', () => {
    const items = [{ key: '1', fen: AFTER_A3, multiPv: 1 as const }];
    const merged = mergeLiveReviewResults({}, items, { '1': evaluation('a7a6') });

    expect(merged[AFTER_A3]).toEqual({
      evaluation: evaluation('a7a6'),
      quality: 'quick',
      multiPv: 1,
    });
  });

  it('merges deep results with the requested MultiPV', () => {
    const items = [{ key: '0', fen: START, multiPv: 2 as const }];
    const merged = mergeLiveReviewResults({}, items, { '0': evaluation('a2a3') }, 'deep');

    expect(merged[START]).toEqual({
      evaluation: evaluation('a2a3'),
      quality: 'deep',
      multiPv: 2,
    });
  });

  it('never downgrades a deep entry when a delayed quick result arrives', () => {
    const deep = {
      [START]: { evaluation: evaluation('e2e4'), quality: 'deep' as const, multiPv: 2 as const },
    };
    const items = [{ key: '0', fen: START, multiPv: 1 as const }];

    expect(mergeLiveReviewResults(deep, items, { '0': evaluation('a2a3') }, 'quick')).toBe(deep);
  });

  it('drops cache and marks an in-flight batch obsolete after takeback', () => {
    const cache: ReviewCache = {
      [START]: { evaluation: evaluation('a2a3'), quality: 'quick', multiPv: 1 },
      [AFTER_A3]: { evaluation: evaluation('a7a6'), quality: 'quick', multiPv: 1 },
      [AFTER_A6]: { evaluation: evaluation('a2a3'), quality: 'quick', multiPv: 1 },
    };

    expect(Object.keys(pruneLiveReviewCache(cache, [START]))).toEqual([START]);
    expect(isObsoleteLiveBatch([AFTER_A3, AFTER_A6], [START])).toBe(true);
    expect(isObsoleteLiveBatch([START], [START])).toBe(false);
  });
});
