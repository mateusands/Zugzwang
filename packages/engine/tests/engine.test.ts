import { describe, expect, it } from 'vitest';
import { ChessEngine, IllegalMoveError } from '../src/engine.js';

describe('ChessEngine', () => {
  it('starts a new game in the standard initial position with white to move', () => {
    const engine = new ChessEngine();

    expect(engine.turn).toBe('white');
    expect(engine.status).toBe('in_progress');
    expect(engine.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });

  it('applies a legal move and passes the turn to the other side', () => {
    const engine = new ChessEngine();

    const result = engine.move({ from: 'e2', to: 'e4' });

    expect(result.san).toBe('e4');
    expect(result.color).toBe('white');
    expect(engine.turn).toBe('black');
    expect(engine.history()).toEqual(['e4']);
  });

  it('rejects an illegal move by throwing IllegalMoveError', () => {
    const engine = new ChessEngine();

    // A rook cannot leap out of the corner on move one.
    expect(() => engine.move({ from: 'a1', to: 'a4' })).toThrow(IllegalMoveError);
    // The rejected move must not affect the board or the turn.
    expect(engine.turn).toBe('white');
    expect(engine.history()).toEqual([]);
  });

  it("detects the fastest checkmate (Fool's mate)", () => {
    const engine = new ChessEngine();

    engine.move('f3');
    engine.move('e5');
    engine.move('g4');
    engine.move('Qh4#');

    expect(engine.status).toBe('checkmate');
    expect(engine.isGameOver()).toBe(true);
  });
});
