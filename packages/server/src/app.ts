import { randomUUID } from 'node:crypto';
import express, { type Express, type Request, type Response } from 'express';
import {
  ChessEngine,
  IllegalMoveError,
  chooseMove,
  type Difficulty,
  type MoveInput,
} from '@zugzwang/engine';

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

function parseDifficulty(value: unknown): Difficulty {
  return DIFFICULTIES.find((level) => level === value) ?? 'medium';
}

/** Serialisable snapshot of a game, everything the web board needs to render. */
function toState(id: string, engine: ChessEngine) {
  return {
    id,
    fen: engine.fen,
    turn: engine.turn,
    status: engine.status,
    gameOver: engine.isGameOver(),
    winner: engine.winner(),
    pieces: engine.pieces(),
    legalMoves: engine.legalMoves(),
    legalTargets: engine.legalTargets(),
    history: engine.history(),
  };
}

interface Game {
  engine: ChessEngine;
  difficulty: Difficulty;
}

/**
 * Build the Express application.
 *
 * Games are kept in memory, scoped to this app instance (so tests are
 * isolated). All chess logic goes through `@zugzwang/engine`.
 */
export function createApp(): Express {
  const app = express();
  app.use(express.json());

  const games = new Map<string, Game>();

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'zugzwang-server' });
  });

  // Start a new game (human is White, bot is Black).
  app.post('/games', (req: Request, res: Response) => {
    const id = randomUUID();
    const engine = new ChessEngine();
    games.set(id, { engine, difficulty: parseDifficulty(req.body?.difficulty) });
    res.status(201).json(toState(id, engine));
  });

  app.get('/games/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const game = id ? games.get(id) : undefined;
    if (!game || !id) {
      res.status(404).json({ error: 'game not found' });
      return;
    }
    res.json(toState(id, game.engine));
  });

  // Apply the player's move, then let the bot reply.
  app.post('/games/:id/move', (req: Request, res: Response) => {
    const { id } = req.params;
    const game = id ? games.get(id) : undefined;
    if (!game || !id) {
      res.status(404).json({ error: 'game not found' });
      return;
    }

    const move = req.body?.move as string | MoveInput | undefined;
    if (move === undefined) {
      res.status(400).json({ error: 'move is required' });
      return;
    }

    let playerMove: string;
    try {
      playerMove = game.engine.move(move).san;
    } catch (error) {
      if (error instanceof IllegalMoveError) {
        res.status(400).json({ error: 'illegal move' });
        return;
      }
      throw error;
    }

    let botMove: string | null = null;
    if (!game.engine.isGameOver() && game.engine.turn === 'black') {
      const best = chooseMove(game.engine, game.difficulty);
      if (best) {
        game.engine.move(best.san);
        botMove = best.san;
      }
    }

    res.json({ ...toState(id, game.engine), playerMove, botMove });
  });

  return app;
}
