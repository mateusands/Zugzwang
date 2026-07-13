import { fenToPieces } from './fen.js';
import { bookPlyCount } from './openingBook.js';
import {
  MOVE_CLASSES,
  classifyPly,
  computeAccuracy,
  type MoveClass,
  type PieceType,
  type PlyReview,
} from './review.js';
import { turnOfFen } from './uci.js';
import type { Piece, PieceColor } from './api.js';
import type { SavedGame } from './savedGames.js';
import type { Evaluation } from './stockfishClient.js';
import type { AnalysisItemRequest, AnalysisProfile } from '@zugzwang/analysis';

export type MoveCounts = Record<MoveClass, number>;

export interface GameReview {
  plies: PlyReview[];
  accuracy: Record<PieceColor, number>;
  counts: Record<PieceColor, MoveCounts>;
}

export interface ReviewCacheEntry {
  evaluation: Evaluation;
  quality: 'quick' | 'deep';
  multiPv: 1 | 2;
}

/** Avaliações parciais serializáveis, indexadas pelo FEN completo. */
export type ReviewCache = Record<string, ReviewCacheEntry>;

export type ReviewPositionSource = Pick<SavedGame, 'sans' | 'fens' | 'result'>;

export interface MoveClassOccurrence {
  class: MoveClass;
  count: number;
}

export const REVIEW_QUICK_MS = 120;
export const REVIEW_DEEP_MS = 400;
export const REVIEW_MAX_DEEP_PLIES = 4;

export interface DeepReviewCandidate {
  index: number;
  priority: number;
}

export function prioritizeDeepCandidates(candidates: DeepReviewCandidate[]): number[] {
  return [...candidates]
    .sort((a, b) => b.priority - a.priority || a.index - b.index)
    .slice(0, REVIEW_MAX_DEEP_PLIES)
    .map(({ index }) => index);
}

export interface ReviewEvaluationRequest {
  limit: { movetime: number };
  multiPv: 1 | 2;
  signal?: AbortSignal;
}

export type ReviewEvaluator = (
  fen: string,
  request: ReviewEvaluationRequest,
) => Promise<Evaluation | null>;

export type ReviewBatchEvaluator = (
  items: AnalysisItemRequest[],
  profile: AnalysisProfile,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
  onResults?: (results: Record<string, Evaluation>) => void,
) => Promise<Record<string, Evaluation>>;

export interface BuildReviewOptions {
  cache?: ReviewCache;
  onCache?: (cache: ReviewCache) => void;
  signal?: AbortSignal;
  batchEvaluate?: ReviewBatchEvaluator;
}

function throwIfReviewAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('game review cancelled', 'AbortError');
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function emptyMoveCounts(): MoveCounts {
  return Object.fromEntries(MOVE_CLASSES.map((moveClass) => [moveClass, 0])) as MoveCounts;
}

/** Top agregado das duas cores; empates respeitam a ordem canônica. */
export function topMoveClasses(review: GameReview, limit = 3): MoveClassOccurrence[] {
  return MOVE_CLASSES.map((moveClass, order) => ({
    class: moveClass,
    count: review.counts.white[moveClass] + review.counts.black[moveClass],
    order,
  }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, Math.max(0, limit))
    .map(({ class: moveClass, count }) => ({ class: moveClass, count }));
}

function samePiece(a: Piece | undefined, b: Piece | undefined): boolean {
  return !!a && !!b && a.color === b.color && a.type === b.type;
}

function promotionOfSan(san: string): string {
  return /=([QRBN])/.exec(san)?.[1]?.toLowerCase() ?? '';
}

/** Deriva o lance UCI apenas pelo diff das posições, sem replicar regras. */
export function moveUciFromFens(beforeFen: string, afterFen: string, san: string): string {
  const mover = turnOfFen(beforeFen);
  const before = fenToPieces(beforeFen);
  const after = fenToPieces(afterFen);
  const beforeBySquare = new Map(before.map((piece) => [piece.square, piece]));
  const afterBySquare = new Map(after.map((piece) => [piece.square, piece]));
  const fromCandidates = before.filter(
    (piece) => piece.color === mover && !samePiece(piece, afterBySquare.get(piece.square)),
  );
  const toCandidates = after.filter(
    (piece) => piece.color === mover && !samePiece(piece, beforeBySquare.get(piece.square)),
  );
  const promotion = promotionOfSan(san);

  let from: Piece | undefined;
  let to: Piece | undefined;
  if (san.startsWith('O-O')) {
    from = fromCandidates.find((piece) => piece.type === 'k');
    to = toCandidates.find((piece) => piece.type === 'k');
  } else if (promotion) {
    from = fromCandidates.find((piece) => piece.type === 'p');
    to = toCandidates.find((piece) => piece.type === promotion);
  } else {
    from = fromCandidates[0];
    to = toCandidates[0];
  }

  if (!from || !to) throw new Error(`não foi possível derivar UCI para ${san}`);
  return `${from.square}${to.square}${promotion}`;
}

function moverWinPercent(whiteWinPercent: number, mover: PieceColor): number {
  return mover === 'white' ? whiteWinPercent : 100 - whiteWinPercent;
}

function finalWhiteWinPercent(game: ReviewPositionSource): number {
  if (game.result.winner === 'white') return 100;
  if (game.result.winner === 'black') return 0;
  return 50;
}

function sacrificedPiece(
  afterFen: string,
  playedMove: string,
  opponentBestMove: string | null,
): PieceType | null {
  if (!opponentBestMove || opponentBestMove.slice(2, 4) !== playedMove.slice(2, 4)) return null;
  const destination = playedMove.slice(2, 4);
  const piece = fenToPieces(afterFen).find((current) => current.square === destination);
  if (!piece || !['p', 'n', 'b', 'r', 'q', 'k'].includes(piece.type)) return null;
  return piece.type as PieceType;
}

function reviewFromEvaluations(
  savedGame: ReviewPositionSource,
  evaluations: Map<number, Evaluation>,
  bookPlies: number,
): GameReview {
  const whiteWinPercent = savedGame.fens.map((_, index) => {
    const evaluation = evaluations.get(index);
    if (evaluation) return evaluation.winPercent;
    if (index === savedGame.fens.length - 1 && !savedGame.result.resigned) {
      return finalWhiteWinPercent(savedGame);
    }
    return undefined;
  });
  const plies: PlyReview[] = savedGame.sans.map((sanPlayed, index) => {
    const beforeFen = savedGame.fens[index];
    const afterFen = savedGame.fens[index + 1];
    if (!beforeFen || !afterFen) {
      throw new Error(`dados incompletos no lance ${index + 1}`);
    }
    const mover = turnOfFen(beforeFen);
    const playedMove = moveUciFromFens(beforeFen, afterFen, sanPlayed);
    if (index < bookPlies) {
      return classifyPly({
        mover,
        sanPlayed,
        playedMove,
        bestMoveBefore: '',
        secondBestWinPercentBefore: null,
        winPercentBeforeMover: 50,
        winPercentAfterMover: 50,
        winPercentBeforeMoverPrevPly: null,
        sacrificedPieceType: null,
        isBookMove: true,
      });
    }

    const beforeEvaluation = evaluations.get(index);
    const beforeWhite = whiteWinPercent[index];
    const afterWhite = whiteWinPercent[index + 1];
    if (!beforeEvaluation || beforeWhite === undefined || afterWhite === undefined) {
      throw new Error(`Stockfish não avaliou a posição ${index + 1}`);
    }
    const second = beforeEvaluation.secondLine;
    const previousWhite = index > 0 ? whiteWinPercent[index - 1] : undefined;
    return classifyPly({
      mover,
      sanPlayed,
      playedMove,
      bestMoveBefore: beforeEvaluation.bestMove ?? '',
      secondBestWinPercentBefore: second ? moverWinPercent(second.winPercent, mover) : null,
      winPercentBeforeMover: moverWinPercent(beforeWhite, mover),
      winPercentAfterMover: moverWinPercent(afterWhite, mover),
      winPercentBeforeMoverPrevPly:
        previousWhite === undefined ? null : moverWinPercent(previousWhite, mover),
      sacrificedPieceType: sacrificedPiece(
        afterFen,
        playedMove,
        evaluations.get(index + 1)?.bestMove ?? null,
      ),
      isBookMove: false,
    });
  });

  const counts = { white: emptyMoveCounts(), black: emptyMoveCounts() };
  const losses: Record<PieceColor, number[]> = { white: [], black: [] };
  for (const ply of plies) {
    counts[ply.mover][ply.class] += 1;
    losses[ply.mover].push(ply.winPercentLost);
  }
  return {
    plies,
    counts,
    accuracy: {
      white: computeAccuracy(losses.white),
      black: computeAccuracy(losses.black),
    },
  };
}

function enginePositionIndices(savedGame: ReviewPositionSource, bookPlies: number): number[] {
  if (bookPlies >= savedGame.sans.length) return [];
  const finalIndex = savedGame.fens.length - 1;
  const lastEngineIndex = savedGame.result.resigned ? finalIndex : finalIndex - 1;
  return Array.from(
    { length: Math.max(0, lastEngineIndex - bookPlies + 1) },
    (_, offset) => bookPlies + offset,
  );
}

function deepCandidateIndices(
  savedGame: ReviewPositionSource,
  review: GameReview,
  evaluations: Map<number, Evaluation>,
  bookPlies: number,
): number[] {
  const candidates = review.plies
    .map((ply, index) => {
      if (index < bookPlies) return null;
      const beforeFen = savedGame.fens[index];
      const afterFen = savedGame.fens[index + 1];
      const before = evaluations.get(index);
      if (!beforeFen || !afterFen || !before) return null;
      const mover = turnOfFen(beforeFen);
      const beforeMover = moverWinPercent(before.winPercent, mover);
      const possibleUnique = ply.playedMove === ply.bestMove && beforeMover <= 50;
      const tactical = /[x+#=]/.test(ply.sanPlayed);
      const sacrifice = sacrificedPiece(
        afterFen,
        ply.playedMove,
        evaluations.get(index + 1)?.bestMove ?? null,
      );
      if (ply.winPercentLost < 5 && !possibleUnique && !tactical && !sacrifice) return null;
      return {
        index,
        priority:
          ply.winPercentLost * 10 +
          (tactical ? 30 : 0) +
          (possibleUnique ? 20 : 0) +
          (sacrifice ? 40 : 0),
      };
    })
    .filter((candidate): candidate is DeepReviewCandidate => candidate !== null);
  return prioritizeDeepCandidates(candidates);
}

function deepReviewItems(
  savedGame: ReviewPositionSource,
  cache: ReviewCache,
): AnalysisItemRequest[] {
  const bookPlies = bookPlyCount(savedGame.sans);
  const quickIndices = enginePositionIndices(savedGame, bookPlies);
  const evaluations = new Map<number, Evaluation>();
  for (const index of quickIndices) {
    const fen = savedGame.fens[index];
    const cached = fen ? cache[fen] : undefined;
    if (!cached) return [];
    evaluations.set(index, cached.evaluation);
  }

  const provisional = reviewFromEvaluations(savedGame, evaluations, bookPlies);
  const requests = new Map<number, 1 | 2>();
  for (const plyIndex of deepCandidateIndices(savedGame, provisional, evaluations, bookPlies)) {
    requests.set(plyIndex, 2);
    const afterIndex = plyIndex + 1;
    if (quickIndices.includes(afterIndex) && !requests.has(afterIndex)) {
      requests.set(afterIndex, 1);
    }
  }
  return [...requests].map(([index, multiPv]) => ({
    key: String(index),
    fen: savedGame.fens[index] ?? '',
    multiPv,
  }));
}

/** Refinamentos que ainda agregam qualidade ao cache da linha atual. */
export function pendingDeepReviewItems(
  savedGame: ReviewPositionSource,
  cache: ReviewCache,
): AnalysisItemRequest[] {
  return deepReviewItems(savedGame, cache).filter((item) => {
    const cached = cache[item.fen];
    return cached?.quality !== 'deep' || cached.multiPv < item.multiPv;
  });
}

export async function buildGameReview(
  savedGame: SavedGame,
  evaluate: ReviewEvaluator,
  onProgress?: (done: number, total: number, stage: 'quick' | 'deep') => void,
  options: BuildReviewOptions = {},
): Promise<GameReview> {
  throwIfReviewAborted(options.signal);
  const cache: ReviewCache = { ...(options.cache ?? savedGame.reviewCache ?? {}) };
  const evaluations = new Map<number, Evaluation>();
  const bookPlies = bookPlyCount(savedGame.sans);
  const quickIndices = enginePositionIndices(savedGame, bookPlies);
  let quickDone = 0;

  for (const index of quickIndices) {
    const fen = savedGame.fens[index];
    const cached = fen ? cache[fen] : undefined;
    if (cached) {
      evaluations.set(index, cached.evaluation);
      quickDone += 1;
    }
  }
  onProgress?.(quickDone, quickIndices.length, 'quick');

  const pendingQuick = quickIndices.filter((index) => !evaluations.has(index));
  let quickBatch: Record<string, Evaluation> | null = null;
  if (options.batchEvaluate && pendingQuick.length > 0) {
    try {
      quickBatch = await options.batchEvaluate(
        pendingQuick.map((index) => ({
          key: String(index),
          fen: savedGame.fens[index] ?? '',
          multiPv: 1,
        })),
        'fast',
        (done) => onProgress?.(quickDone + done, quickIndices.length, 'quick'),
        options.signal,
        (results) => {
          let changed = false;
          for (const [key, evaluation] of Object.entries(results)) {
            const index = Number(key);
            const fen = savedGame.fens[index];
            if (!fen || cache[fen]) continue;
            cache[fen] = { evaluation, quality: 'quick', multiPv: 1 };
            changed = true;
          }
          if (changed) options.onCache?.({ ...cache });
        },
      );
    } catch (error) {
      if (isAbortError(error) || options.signal?.aborted) throw error;
      quickBatch = null;
    }
  }

  for (const index of pendingQuick) {
    throwIfReviewAborted(options.signal);
    const fen = savedGame.fens[index];
    if (!fen) throw new Error(`FEN ausente na posição ${index + 1}`);
    // Uma repetição pode ter sido avaliada numa posição anterior deste lote.
    const repeated = cache[fen];
    const evaluation =
      repeated?.evaluation ??
      quickBatch?.[String(index)] ??
      (await evaluate(fen, {
        limit: { movetime: REVIEW_QUICK_MS },
        multiPv: 1,
        ...(options.signal ? { signal: options.signal } : {}),
      }));
    throwIfReviewAborted(options.signal);
    if (!evaluation) throw new Error(`Stockfish não avaliou a posição ${index + 1}`);
    evaluations.set(index, evaluation);
    if (!repeated) {
      cache[fen] = { evaluation, quality: 'quick', multiPv: 1 };
      options.onCache?.({ ...cache });
    }
    quickDone += 1;
    onProgress?.(quickDone, quickIndices.length, 'quick');
  }

  const deepRequests = new Map(
    deepReviewItems(savedGame, cache).map((item) => [Number(item.key), item.multiPv]),
  );

  let deepDone = 0;
  const pendingDeep = [...deepRequests].filter(([index, multiPv]) => {
    const fen = savedGame.fens[index];
    const cached = fen ? cache[fen] : undefined;
    if (cached?.quality === 'deep' && cached.multiPv >= multiPv) {
      evaluations.set(index, cached.evaluation);
      deepDone += 1;
      return false;
    }
    return true;
  });
  if (deepRequests.size > 0) onProgress?.(deepDone, deepRequests.size, 'deep');

  let deepBatch: Record<string, Evaluation> | null = null;
  if (options.batchEvaluate && pendingDeep.length > 0) {
    try {
      deepBatch = await options.batchEvaluate(
        pendingDeep.map(([index, multiPv]) => ({
          key: String(index),
          fen: savedGame.fens[index] ?? '',
          multiPv,
        })),
        'deep',
        (done) => onProgress?.(deepDone + done, deepRequests.size, 'deep'),
        options.signal,
        (results) => {
          let changed = false;
          for (const [key, evaluation] of Object.entries(results)) {
            const index = Number(key);
            const fen = savedGame.fens[index];
            const requestedMultiPv = deepRequests.get(index);
            if (!fen || !requestedMultiPv) continue;
            const existing = cache[fen];
            if (existing?.quality === 'deep' && existing.multiPv >= requestedMultiPv) continue;
            cache[fen] = { evaluation, quality: 'deep', multiPv: requestedMultiPv };
            changed = true;
          }
          if (changed) options.onCache?.({ ...cache });
        },
      );
    } catch (error) {
      if (isAbortError(error) || options.signal?.aborted) throw error;
      deepBatch = null;
    }
  }

  for (const [index, multiPv] of pendingDeep) {
    throwIfReviewAborted(options.signal);
    const fen = savedGame.fens[index];
    if (!fen) throw new Error(`FEN ausente na posição ${index + 1}`);
    const evaluation =
      deepBatch?.[String(index)] ??
      (await evaluate(fen, {
        limit: { movetime: REVIEW_DEEP_MS },
        multiPv,
        ...(options.signal ? { signal: options.signal } : {}),
      }));
    throwIfReviewAborted(options.signal);
    if (!evaluation) throw new Error(`Stockfish não aprofundou a posição ${index + 1}`);
    evaluations.set(index, evaluation);
    const existing = cache[fen];
    if (!existing || existing.quality !== 'deep' || existing.multiPv <= multiPv) {
      cache[fen] = { evaluation, quality: 'deep', multiPv };
      options.onCache?.({ ...cache });
    }
    deepDone += 1;
    onProgress?.(deepDone, deepRequests.size, 'deep');
  }

  throwIfReviewAborted(options.signal);
  return reviewFromEvaluations(savedGame, evaluations, bookPlies);
}

export function isGameReview(value: unknown): value is GameReview {
  if (typeof value !== 'object' || value === null) return false;
  const review = value as Record<string, unknown>;
  const accuracy = review.accuracy;
  const counts = review.counts;
  return (
    Array.isArray(review.plies) &&
    review.plies.every(isPlyReview) &&
    isAccuracy(accuracy) &&
    typeof counts === 'object' &&
    counts !== null &&
    isMoveCounts((counts as Record<string, unknown>).white) &&
    isMoveCounts((counts as Record<string, unknown>).black)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isAccuracy(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const accuracy = value as Record<string, unknown>;
  return (
    isFiniteNumber(accuracy.white) &&
    accuracy.white >= 0 &&
    accuracy.white <= 100 &&
    isFiniteNumber(accuracy.black) &&
    accuracy.black >= 0 &&
    accuracy.black <= 100
  );
}

function isMoveCounts(value: unknown): value is MoveCounts {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const counts = value as Record<string, unknown>;
  return MOVE_CLASSES.every(
    (moveClass) =>
      Number.isInteger(counts[moveClass]) &&
      typeof counts[moveClass] === 'number' &&
      counts[moveClass] >= 0,
  );
}

function isPlyReview(value: unknown): value is PlyReview {
  if (typeof value !== 'object' || value === null) return false;
  const ply = value as Record<string, unknown>;
  return (
    (ply.mover === 'white' || ply.mover === 'black') &&
    typeof ply.sanPlayed === 'string' &&
    typeof ply.playedMove === 'string' &&
    typeof ply.bestMove === 'string' &&
    MOVE_CLASSES.includes(ply.class as MoveClass) &&
    isFiniteNumber(ply.winPercentLost) &&
    ply.winPercentLost >= 0
  );
}

function isScore(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const score = value as Record<string, unknown>;
  return (
    (score.type === 'cp' && isFiniteNumber(score.value)) ||
    (score.type === 'mate' &&
      isFiniteNumber(score.movesToMate) &&
      (score.winner === 'white' || score.winner === 'black'))
  );
}

function isEvaluationLine(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const evaluation = value as Record<string, unknown>;
  return (
    isScore(evaluation.score) &&
    isFiniteNumber(evaluation.winPercent) &&
    evaluation.winPercent >= 0 &&
    evaluation.winPercent <= 100 &&
    (typeof evaluation.bestMove === 'string' || evaluation.bestMove === null) &&
    isFiniteNumber(evaluation.depth) &&
    evaluation.depth >= 0
  );
}

function isEvaluation(value: unknown): value is Evaluation {
  if (!isEvaluationLine(value)) return false;
  const evaluation = value as Record<string, unknown>;
  return evaluation.secondLine === null || isEvaluationLine(evaluation.secondLine);
}

export function isReviewCache(value: unknown): value is ReviewCache {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const cached = entry as Record<string, unknown>;
    return (
      (cached.quality === 'quick' || cached.quality === 'deep') &&
      (cached.multiPv === 1 || cached.multiPv === 2) &&
      isEvaluation(cached.evaluation)
    );
  });
}
