import { describe, expect, it, vi } from 'vitest';
import { createReviewCheckpoint } from '../src/reviewCheckpoint.js';
import type { ReviewCache } from '../src/gameReview.js';

const CACHE_A = { a: {} } as unknown as ReviewCache;
const CACHE_B = { b: {} } as unknown as ReviewCache;

describe('createReviewCheckpoint', () => {
  it('agrupa atualizações da mesma partida e grava apenas a mais recente', () => {
    const write = vi.fn();
    let scheduled: (() => void) | null = null;
    const checkpoint = createReviewCheckpoint(write, (task) => {
      scheduled = task;
      return () => {
        scheduled = null;
      };
    });

    checkpoint.schedule('game', CACHE_A);
    checkpoint.schedule('game', CACHE_B);
    expect(write).not.toHaveBeenCalled();

    if (!scheduled) throw new Error('checkpoint não agendado');
    (scheduled as () => void)();
    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith('game', CACHE_B);
  });

  it('flush persiste todas as partidas pendentes imediatamente', () => {
    const write = vi.fn();
    const checkpoint = createReviewCheckpoint(write, () => vi.fn());

    checkpoint.schedule('a', CACHE_A);
    checkpoint.schedule('b', CACHE_B);
    checkpoint.flush();

    expect(write.mock.calls).toEqual([
      ['a', CACHE_A],
      ['b', CACHE_B],
    ]);
  });
});
