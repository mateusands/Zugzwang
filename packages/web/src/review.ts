import type { PieceColor } from './api.js';

export type MoveClass =
  | 'book'
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'miss';

export const MOVE_CLASSES: readonly MoveClass[] = [
  'book',
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
  'miss',
];

export const MOVE_CLASS_LABELS: Record<MoveClass, string> = {
  book: 'Livro',
  brilliant: 'Brilhante',
  great: 'Grande',
  best: 'Melhor',
  excellent: 'Excelente',
  good: 'Bom',
  inaccuracy: 'Imprecisão',
  mistake: 'Erro',
  blunder: 'Capivarada',
  miss: 'Miss',
};

export const MOVE_CLASS_ICONS: Record<MoveClass, string> = {
  book: '📖',
  brilliant: '!!',
  great: '!',
  best: '★',
  excellent: '✓',
  good: '●',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
  miss: '×',
};

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface PlyReviewInput {
  mover: PieceColor;
  sanPlayed: string;
  /** Lance realmente jogado, em UCI. */
  playedMove: string;
  /** Primeira linha do Stockfish antes do lance, em UCI. */
  bestMoveBefore: string;
  /** Win% do mover se ele escolhesse a segunda linha. */
  secondBestWinPercentBefore: number | null;
  winPercentBeforeMover: number;
  winPercentAfterMover: number;
  /** Win% do mover antes do lance anterior do adversário. */
  winPercentBeforeMoverPrevPly: number | null;
  sacrificedPieceType: PieceType | null;
  isBookMove: boolean;
}

export interface PlyReview {
  mover: PieceColor;
  sanPlayed: string;
  playedMove: string;
  bestMove: string;
  class: MoveClass;
  winPercentLost: number;
}

export const REVIEW_THRESHOLDS = {
  excellent: 2,
  good: 5,
  inaccuracy: 10,
  mistake: 20,
  brilliantMaxBefore: 90,
  brilliantMinAfter: 40,
  missGift: 15,
  uniqueMoveGap: 15,
  difficultPositionMax: 50,
} as const;

function ordinaryClass(
  loss: number,
): Exclude<MoveClass, 'book' | 'brilliant' | 'great' | 'best' | 'miss'> {
  if (loss <= REVIEW_THRESHOLDS.excellent) return 'excellent';
  if (loss <= REVIEW_THRESHOLDS.good) return 'good';
  if (loss <= REVIEW_THRESHOLDS.inaccuracy) return 'inaccuracy';
  if (loss <= REVIEW_THRESHOLDS.mistake) return 'mistake';
  return 'blunder';
}

export function classifyPly(input: PlyReviewInput): PlyReview {
  const winPercentLost = Math.max(0, input.winPercentBeforeMover - input.winPercentAfterMover);
  const isBest = input.playedMove === input.bestMoveBefore;
  const gift =
    input.winPercentBeforeMoverPrevPly === null
      ? 0
      : input.winPercentBeforeMover - input.winPercentBeforeMoverPrevPly;
  const uniqueMoveGap =
    input.secondBestWinPercentBefore === null
      ? 0
      : input.winPercentAfterMover - input.secondBestWinPercentBefore;

  let moveClass: MoveClass;
  if (input.isBookMove) {
    moveClass = 'book';
  } else if (
    winPercentLost <= REVIEW_THRESHOLDS.excellent &&
    input.sacrificedPieceType !== null &&
    input.sacrificedPieceType !== 'p' &&
    input.winPercentBeforeMover < REVIEW_THRESHOLDS.brilliantMaxBefore &&
    input.winPercentAfterMover >= REVIEW_THRESHOLDS.brilliantMinAfter
  ) {
    moveClass = 'brilliant';
  } else if (gift >= REVIEW_THRESHOLDS.missGift && winPercentLost > REVIEW_THRESHOLDS.good) {
    moveClass = 'miss';
  } else if (
    isBest &&
    input.winPercentBeforeMover <= REVIEW_THRESHOLDS.difficultPositionMax &&
    uniqueMoveGap >= REVIEW_THRESHOLDS.uniqueMoveGap
  ) {
    moveClass = 'great';
  } else if (isBest) {
    moveClass = 'best';
  } else {
    moveClass = ordinaryClass(winPercentLost);
  }

  return {
    mover: input.mover,
    sanPlayed: input.sanPlayed,
    playedMove: input.playedMove,
    bestMove: input.bestMoveBefore,
    class: moveClass,
    winPercentLost,
  };
}

function accuracyOfLoss(loss: number): number {
  const normalizedLoss = Math.max(0, loss);
  if (normalizedLoss === 0) return 100;
  return Math.min(Math.max(103.1668 * Math.exp(-0.04354 * normalizedLoss) - 3.1669, 0), 100);
}

export function computeAccuracy(perMoveLoss: number[]): number {
  if (perMoveLoss.length === 0) return 0;
  return perMoveLoss.reduce((sum, loss) => sum + accuracyOfLoss(loss), 0) / perMoveLoss.length;
}
