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

export interface MoveClassOccurrence {
  class: MoveClass;
  count: number;
}

export const REVIEW_QUICK_MS = 120;
export const REVIEW_DEEP_MS = 400;
const MAX_DEEP_PLIES = 12;

export interface ReviewEvaluationRequest {
  limit: { movetime: number };
  multiPv: 1 | 2;
}

export type ReviewEvaluator = (
  fen: string,
  request: ReviewEvaluationRequest,
) => Promise<Evaluation | null>;

export interface BuildReviewOptions {
  cache?: ReviewCache;
  onCache?: (cache: ReviewCache) => void;
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

function finalWhiteWinPercent(game: SavedGame): number {
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
  savedGame: SavedGame,
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

function enginePositionIndices(savedGame: SavedGame, bookPlies: number): number[] {
  if (bookPlies >= savedGame.sans.length) return [];
  const finalIndex = savedGame.fens.length - 1;
  const lastEngineIndex = savedGame.result.resigned ? finalIndex : finalIndex - 1;
  return Array.from(
    { length: Math.max(0, lastEngineIndex - bookPlies + 1) },
    (_, offset) => bookPlies + offset,
  );
}

function deepCandidateIndices(
  savedGame: SavedGame,
  review: GameReview,
  evaluations: Map<number, Evaluation>,
  bookPlies: number,
): number[] {
  return review.plies
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
    .filter((candidate): candidate is { index: number; priority: number } => candidate !== null)
    .sort((a, b) => b.priority - a.priority || a.index - b.index)
    .slice(0, MAX_DEEP_PLIES)
    .map(({ index }) => index);
}

export async function buildGameReview(
  savedGame: SavedGame,
  evaluate: ReviewEvaluator,
  onProgress?: (done: number, total: number, stage: 'quick' | 'deep') => void,
  options: BuildReviewOptions = {},
): Promise<GameReview> {
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

  for (const index of quickIndices) {
    if (evaluations.has(index)) continue;
    const fen = savedGame.fens[index];
    if (!fen) throw new Error(`FEN ausente na posição ${index + 1}`);
    // Uma repetição pode ter sido avaliada numa posição anterior deste lote.
    const repeated = cache[fen];
    const evaluation =
      repeated?.evaluation ??
      (await evaluate(fen, { limit: { movetime: REVIEW_QUICK_MS }, multiPv: 1 }));
    if (!evaluation) throw new Error(`Stockfish não avaliou a posição ${index + 1}`);
    evaluations.set(index, evaluation);
    if (!repeated) {
      cache[fen] = { evaluation, quality: 'quick', multiPv: 1 };
      options.onCache?.({ ...cache });
    }
    quickDone += 1;
    onProgress?.(quickDone, quickIndices.length, 'quick');
  }

  const provisional = reviewFromEvaluations(savedGame, evaluations, bookPlies);
  const deepRequests = new Map<number, 1 | 2>();
  for (const plyIndex of deepCandidateIndices(savedGame, provisional, evaluations, bookPlies)) {
    deepRequests.set(plyIndex, 2);
    const afterIndex = plyIndex + 1;
    if (quickIndices.includes(afterIndex) && !deepRequests.has(afterIndex)) {
      deepRequests.set(afterIndex, 1);
    }
  }

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

  for (const [index, multiPv] of pendingDeep) {
    const fen = savedGame.fens[index];
    if (!fen) throw new Error(`FEN ausente na posição ${index + 1}`);
    const evaluation = await evaluate(fen, {
      limit: { movetime: REVIEW_DEEP_MS },
      multiPv,
    });
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

  return reviewFromEvaluations(savedGame, evaluations, bookPlies);
}

export function isGameReview(value: unknown): value is GameReview {
  if (typeof value !== 'object' || value === null) return false;
  const review = value as Partial<GameReview>;
  return (
    Array.isArray(review.plies) &&
    typeof review.accuracy?.white === 'number' &&
    typeof review.accuracy.black === 'number' &&
    typeof review.counts?.white === 'object' &&
    typeof review.counts.black === 'object'
  );
}

function isScore(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const score = value as Record<string, unknown>;
  return (
    (score.type === 'cp' && typeof score.value === 'number') ||
    (score.type === 'mate' &&
      typeof score.movesToMate === 'number' &&
      (score.winner === 'white' || score.winner === 'black'))
  );
}

function isEvaluation(value: unknown): value is Evaluation {
  if (typeof value !== 'object' || value === null) return false;
  const evaluation = value as Record<string, unknown>;
  return (
    isScore(evaluation.score) &&
    typeof evaluation.winPercent === 'number' &&
    (typeof evaluation.bestMove === 'string' || evaluation.bestMove === null) &&
    typeof evaluation.depth === 'number' &&
    (evaluation.secondLine === null || typeof evaluation.secondLine === 'object')
  );
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
