/** Cliente da API de jogo. O contrato é o JSON do server (não o engine). */

export type PieceColor = 'white' | 'black';

export interface Piece {
  square: string;
  type: string;
  color: PieceColor;
}

export interface GameState {
  id: string;
  fen: string;
  turn: PieceColor;
  status: 'in_progress' | 'check' | 'checkmate' | 'stalemate' | 'draw';
  gameOver: boolean;
  winner: PieceColor | null;
  pieces: Piece[];
  legalMoves: string[];
  legalTargets: Record<string, string[]>;
  history: string[];
}

export interface BotMove {
  san: string;
  from: string;
  to: string;
}

export interface MoveResponse extends GameState {
  playerMove: string;
  botMove: BotMove | null;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface CoordinateMove {
  from: string;
  to: string;
  promotion?: string;
}

/** Lançada quando o server rejeita um lance ilegal (HTTP 400). */
export class IllegalMoveError extends Error {}

const API = '/api';

export async function createGame(difficulty: Difficulty): Promise<GameState> {
  const response = await fetch(`${API}/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ difficulty }),
  });
  if (!response.ok) throw new Error('Não foi possível criar a partida.');
  return response.json() as Promise<GameState>;
}

export async function sendMove(id: string, move: CoordinateMove): Promise<MoveResponse> {
  const response = await fetch(`${API}/games/${id}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ move }),
  });
  if (response.status === 400) throw new IllegalMoveError('Lance ilegal.');
  if (!response.ok) throw new Error('Falha ao enviar o lance.');
  return response.json() as Promise<MoveResponse>;
}
