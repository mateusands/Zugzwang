import type { AnalysisItemRequest } from '@zugzwang/analysis';
import type { ReviewCache, ReviewCacheEntry } from './gameReview.js';
import { bookPlyCount } from './openingBook.js';
import type { Evaluation } from './stockfishClient.js';

export function liveReviewItems(
  sans: string[],
  fens: string[],
  cache: ReviewCache,
  inFlight: ReadonlySet<string>,
): AnalysisItemRequest[] {
  const bookPlies = bookPlyCount(sans);
  if (bookPlies >= sans.length) return [];
  const items: AnalysisItemRequest[] = [];
  for (let index = bookPlies; index < fens.length; index += 1) {
    const fen = fens[index];
    if (!fen || cache[fen] || inFlight.has(fen)) continue;
    items.push({ key: String(index), fen, multiPv: 1 });
  }
  return items;
}

export function mergeLiveReviewResults(
  cache: ReviewCache,
  items: AnalysisItemRequest[],
  results: Record<string, Evaluation>,
  quality: ReviewCacheEntry['quality'] = 'quick',
): ReviewCache {
  let merged = cache;
  const itemByKey = new Map(items.map((item) => [item.key, item]));
  for (const [key, evaluation] of Object.entries(results)) {
    const item = itemByKey.get(key);
    if (!item) continue;
    const existing = merged[item.fen];
    if (
      existing?.evaluation === evaluation ||
      (existing?.quality === 'deep' && (quality === 'quick' || existing.multiPv >= item.multiPv))
    ) {
      continue;
    }
    if (merged === cache) merged = { ...cache };
    merged[item.fen] = { evaluation, quality, multiPv: item.multiPv };
  }
  return merged;
}

export function pruneLiveReviewCache(cache: ReviewCache, currentFens: string[]): ReviewCache {
  const current = new Set(currentFens);
  const entries = Object.entries(cache).filter(([fen]) => current.has(fen));
  if (entries.length === Object.keys(cache).length) return cache;
  return Object.fromEntries(entries);
}

export function isObsoleteLiveBatch(batchFens: string[], currentFens: string[]): boolean {
  const current = new Set(currentFens);
  return batchFens.some((fen) => !current.has(fen));
}
