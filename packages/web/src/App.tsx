import { useCallback, useEffect, useState } from 'react';
import { BoardView } from './BoardView.js';
import {
  createGame,
  sendMove,
  IllegalMoveError,
  type Difficulty,
  type GameState,
  type MoveResponse,
} from './api.js';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

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

function lastBotMove(game: GameState): string | null {
  return 'botMove' in game ? (game as MoveResponse).botMove : null;
}

export function App() {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [game, setGame] = useState<GameState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startGame = useCallback(async (level: Difficulty) => {
    setError(null);
    setSelected(null);
    setGame(null);
    try {
      setGame(await createGame(level));
    } catch {
      setError('Não foi possível falar com o servidor. Ele está rodando? (pnpm dev)');
    }
  }, []);

  useEffect(() => {
    void startGame(difficulty);
    // Recomeça a partida quando a dificuldade muda.
  }, [difficulty, startGame]);

  const handleSquareClick = useCallback(
    (square: string) => {
      if (!game || game.gameOver || busy || game.turn !== 'white') return;
      const targets = game.legalTargets;

      if (selected) {
        const canMoveThere = (targets[selected] ?? []).includes(square);
        if (canMoveThere) {
          const mover = game.pieces.find((piece) => piece.square === selected);
          const promotion = mover?.type === 'p' && square[1] === '8' ? 'q' : undefined;
          setBusy(true);
          setError(null);
          sendMove(game.id, { from: selected, to: square, promotion })
            .then(setGame)
            .catch((sendError: unknown) => {
              setError(
                sendError instanceof IllegalMoveError
                  ? 'Lance ilegal.'
                  : 'Falha ao enviar o lance.',
              );
            })
            .finally(() => {
              setBusy(false);
              setSelected(null);
            });
          return;
        }
        setSelected(targets[square] ? square : null);
        return;
      }

      if (targets[square]) setSelected(square);
    },
    [game, selected, busy],
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
            pieces={game.pieces}
            selected={selected}
            targets={selected ? (game.legalTargets[selected] ?? []) : []}
            onSquareClick={handleSquareClick}
          />
          <p className="status">{busy ? 'Bot pensando…' : statusText(game)}</p>
          {lastBotMove(game) ? (
            <p className="status status--muted">Bot jogou: {lastBotMove(game)}</p>
          ) : null}
        </>
      ) : (
        <p className="status">Carregando…</p>
      )}

      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
