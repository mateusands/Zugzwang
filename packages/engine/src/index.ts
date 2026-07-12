export {
  ChessEngine,
  IllegalMoveError,
  type PlayerColor,
  type PieceType,
  type PlacedPiece,
  type PromotionPiece,
  type CastleSide,
  type GameStatus,
  type MoveInput,
  type MoveResult,
} from './engine.js';

export {
  evaluate,
  evaluatePosition,
  findBestMove,
  chooseMove,
  difficultyDepth,
  analyzeGame,
  type Difficulty,
  type MoveAnalysis,
} from './bot.js';
export { renderBoard } from './render.js';
