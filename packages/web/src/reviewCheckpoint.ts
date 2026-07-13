import type { ReviewCache } from './gameReview.js';

type CancelScheduled = () => void;
type ScheduleTask = (task: () => void) => CancelScheduled;

export interface ReviewCheckpoint {
  schedule(id: string, cache: ReviewCache): void;
  flush(): void;
}

const CHECKPOINT_DELAY_MS = 750;

function scheduleAfterDelay(task: () => void): CancelScheduled {
  const timer = setTimeout(task, CHECKPOINT_DELAY_MS);
  return () => clearTimeout(timer);
}

/** Agrupa caches por partida para evitar JSON.parse/stringify a cada posição. */
export function createReviewCheckpoint(
  write: (id: string, cache: ReviewCache) => void,
  scheduleTask: ScheduleTask = scheduleAfterDelay,
): ReviewCheckpoint {
  const pending = new Map<string, ReviewCache>();
  let cancelScheduled: CancelScheduled | null = null;

  const flush = () => {
    cancelScheduled?.();
    cancelScheduled = null;
    const updates = [...pending];
    pending.clear();
    for (const [id, cache] of updates) write(id, cache);
  };

  return {
    schedule(id, cache) {
      pending.set(id, cache);
      if (cancelScheduled) return;
      cancelScheduled = scheduleTask(() => {
        cancelScheduled = null;
        flush();
      });
    },
    flush,
  };
}
