import { useCallback, useEffect, useState } from 'react';
import { BoardView, type AnimatedMove } from './BoardView.js';
import { applyLocalMove } from './board.js';
import {
  createGame,
  sendMove,
  IllegalMoveError,
  type BotMove,
  type Difficulty,
  type GameState,
  type MoveResponse,
  type Piece,
} from './api.js';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/** Slide durations: o lance do jogador é rápido; o do bot, mais lento. */
const PLAYER_SLIDE_MS = 220;
const BOT_SLIDE_MS = 480;

/** What the board renders — updated optimistically, then from the server. */
interface BoardState {
  pieces: Piece[];
  animatedMove: AnimatedMove | null;
  animationMs: number;
  seq: number;
}

function statusText(game: GameState): string {
  if (game.gameOver) {
    if (game.status === 'checkmate') {
      return `Xeque-mate — ${game.winner === 'white' ? 'você venceu!' : 'o bot venceu.'}`;
    }
    if (game.status === 'stalemate') return 'Afogamento — empate.';
    return 'Empate.';
  }
  const check = game.status === 'check' ? ' — xeque!' : '';
  return (game.turn === 'white' ? 'Sua vez' : 'Vez do bot') + check;
}

function botMoveOf(game: GameState): BotMove | null {
  return 'botMove' in game ? (game as MoveResponse).botMove : null;
}

export function App() {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [game, setGame] = useState<GameState | null>(null);
  const [board, setBoard] = useState<BoardState>({
    pieces: [],
    animatedMove: null,
    animationMs: PLAYER_SLIDE_MS,
    seq: 0,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startGame = useCallback(async (level: Difficulty) => {
    setError(null);
    setSelected(null);
    setGame(null);
    try {
      const state = await createGame(level);
      setGame(state);
      setBoard({ pieces: state.pieces, animatedMove: null, animationMs: PLAYER_SLIDE_MS, seq: 0 });
    } catch {
      setError('Não foi possível falar com o servidor. Ele está rodando? (pnpm dev)');
    }
  }, []);

  useEffect(() => {
    void startGame(difficulty);
    // Recomeça a partida quando a dificuldade muda.
  }, [difficulty, startGame]);

  const playMove = useCallback(
    (from: string, to: string, promotion: string | undefined) => {
      if (!game) return;

      // Otimista: mostra o lance do jogador na hora, antes do bot pensar.
      setBoard((prev) => ({
        pieces: applyLocalMove(prev.pieces, from, to),
        animatedMove: { from, to },
        animationMs: PLAYER_SLIDE_MS,
        seq: prev.seq + 1,
      }));
      setBusy(true);
      setError(null);
      setSelected(null);

      sendMove(game.id, { from, to, promotion })
        .then((response) => {
          setGame(response);
          const bot = response.botMove;
          setBoard((prev) => ({
            pieces: response.pieces,
            animatedMove: bot ? { from: bot.from, to: bot.to } : null,
            animationMs: BOT_SLIDE_MS,
            seq: prev.seq + 1,
          }));
        })
        .catch((sendError: unknown) => {
          setError(
            sendError instanceof IllegalMoveError ? 'Lance ilegal.' : 'Falha ao enviar o lance.',
          );
          // Desfaz o render otimista, voltando ao estado anterior do servidor.
          setBoard((prev) => ({
            pieces: game.pieces,
            animatedMove: null,
            animationMs: PLAYER_SLIDE_MS,
            seq: prev.seq + 1,
          }));
        })
        .finally(() => setBusy(false));
    },
    [game],
  );

  const handleSquareClick = useCallback(
    (square: string) => {
      if (!game || game.gameOver || busy || game.turn !== 'white') return;
      const targets = game.legalTargets;

      if (selected) {
        if ((targets[selected] ?? []).includes(square)) {
          const mover = game.pieces.find((piece) => piece.square === selected);
          const promotion = mover?.type === 'p' && square[1] === '8' ? 'q' : undefined;
          playMove(selected, square, promotion);
          return;
        }
        setSelected(targets[square] ? square : null);
        return;
      }

      if (targets[square]) setSelected(square);
    },
    [game, selected, busy, playMove],
  );

  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">Zugzwang</h1>
        <p className="app__tagline">Xadrez contra o bot — você joga de brancas.</p>
      </header>

      <div className="controls">
        <label>
          Dificuldade{' '}
          <select
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value as Difficulty)}
          >
            {DIFFICULTIES.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void startGame(difficulty)}>
          Nova partida
        </button>
      </div>

      {game ? (
        <>
          <BoardView
            pieces={board.pieces}
            selected={selected}
            targets={selected ? (game.legalTargets[selected] ?? []) : []}
            onSquareClick={handleSquareClick}
            animatedMove={board.animatedMove}
            animationMs={board.animationMs}
            moveSeq={board.seq}
          />
          <p className="status">{busy ? 'Bot pensando…' : statusText(game)}</p>
          {botMoveOf(game) ? (
            <p className="status status--muted">Bot jogou: {botMoveOf(game)?.san}</p>
          ) : null}
        </>
      ) : (
        <p className="status">Carregando…</p>
      )}

      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
