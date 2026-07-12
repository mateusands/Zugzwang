import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { BoardView, type AnimatedMove } from './BoardView.js';
import { applyLocalMove, glyph } from './board.js';
import {
  EMPTY_ANNOTATIONS,
  toggleArrow,
  toggleHighlight,
  type Annotations,
} from './annotations.js';
import { pickSound, playSound } from './sounds.js';
import { gameOutcome } from './outcome.js';
import { capturedPieces } from './material.js';
import { fenToPieces } from './fen.js';
import { clampPly, stepPly } from './replay.js';
import { usePieceDrag } from './usePieceDrag.js';
import { CapturedRow } from './components/CapturedRow.js';
import { PromotionPicker } from './components/PromotionPicker.js';
import { ConfirmDialog } from './components/ConfirmDialog.js';
import { EndScreen } from './components/EndScreen.js';
import { MoveList } from './components/MoveList.js';
import { ReplayControls } from './components/ReplayControls.js';
import { SavedGamesDialog } from './components/SavedGamesDialog.js';
import {
  addSavedGame,
  readSavedGames,
  removeSavedGame,
  writeSavedGames,
  type SavedGame,
} from './savedGames.js';
import {
  createGame,
  getGame,
  sendMove,
  takeback,
  IllegalMoveError,
  type BotMove,
  type Difficulty,
  type GameState,
  type MoveResponse,
  type Piece,
} from './api.js';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const STORAGE_KEY = 'zugzwang:game';

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

interface PendingPromotion {
  from: string;
  to: string;
  isCapture: boolean;
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

// Tabuleiro do replay é só leitura: handlers inertes, estáveis entre renders.
function noopSquarePointer(_square: string, _event: ReactPointerEvent) {}
function noopSquareButton(_square: string, _button: number) {}
function noopSquare(_square: string) {}

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
  const [showHints, setShowHints] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(soundOn);
  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);
  const [resigned, setResigned] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [annotations, setAnnotations] = useState<Annotations>(EMPTY_ANNOTATIONS);
  /** Ply exibido ao navegar o histórico; null = no presente (jogo normal). */
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [savedGames, setSavedGames] = useState<SavedGame[]>([]);
  const [showSavedGames, setShowSavedGames] = useState(false);
  /** Partida salva sendo revista; a partida ao vivo (game) fica intocada. */
  const [replayGame, setReplayGame] = useState<SavedGame | null>(null);
  const [replayPly, setReplayPly] = useState(0);
  /** Caminho de casas percorrido com o botão direito pressionado. */
  const rightPath = useRef<string[] | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const startGame = useCallback(async (level: Difficulty) => {
    setError(null);
    setSelected(null);
    setResigned(false);
    setAnnotations(EMPTY_ANNOTATIONS);
    setViewPly(null);
    setGame(null);
    try {
      const state = await createGame(level);
      setDifficulty(level);
      setGame(state);
      setBoard({ pieces: state.pieces, animatedMove: null, animationMs: PLAYER_SLIDE_MS, seq: 0 });
    } catch {
      setError('Não foi possível falar com o servidor. Ele está rodando? (pnpm dev)');
    }
  }, []);

  // Restaura a partida em andamento ao recarregar a página.
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setRestoring(false);
      return;
    }
    let saved: { id: string; difficulty: Difficulty; resigned: boolean };
    try {
      saved = JSON.parse(raw) as typeof saved;
    } catch {
      setRestoring(false);
      return;
    }
    getGame(saved.id)
      .then((state) => {
        setDifficulty(saved.difficulty);
        setResigned(saved.resigned);
        setGame(state);
        setBoard({
          pieces: state.pieces,
          animatedMove: null,
          animationMs: PLAYER_SLIDE_MS,
          seq: 0,
        });
      })
      .catch(() => localStorage.removeItem(STORAGE_KEY))
      .finally(() => setRestoring(false));
  }, []);

  // Persiste a partida atual (id + dificuldade + desistência).
  useEffect(() => {
    if (restoring) return;
    if (game) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: game.id, difficulty, resigned }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [game, difficulty, resigned, restoring]);

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
          if (soundOnRef.current) {
            playSound(pickSound(response.status, bot?.san.includes('x') ?? false));
          }
        })
        .catch((sendError: unknown) => {
          setError(
            sendError instanceof IllegalMoveError ? 'Lance ilegal.' : 'Falha ao enviar o lance.',
          );
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

  const commitMove = useCallback(
    (from: string, to: string, promotion: string | undefined, isCapture: boolean) => {
      // Som imediato do lance do jogador (o do bot vem com a resposta).
      if (soundOnRef.current) playSound(pickSound('in_progress', isCapture));
      playMove(from, to, promotion);
    },
    [playMove],
  );

  const attemptMove = useCallback(
    (from: string, to: string) => {
      if (!game || !(game.legalTargets[from] ?? []).includes(to)) return;
      const mover = game.pieces.find((piece) => piece.square === from);
      // Peão em diagonal para casa vazia só é legal como en passant — é captura.
      const isCapture =
        game.pieces.some((piece) => piece.square === to) ||
        (mover?.type === 'p' && from[0] !== to[0]);
      // Peão chegando na última fileira: pergunta para qual peça promover.
      if (mover?.type === 'p' && to[1] === '8') {
        setSelected(null);
        setPendingPromotion({ from, to, isCapture });
        return;
      }
      commitMove(from, to, undefined, isCapture);
    },
    [game, commitMove],
  );

  const promote = useCallback(
    (type: string) => {
      if (!pendingPromotion) return;
      commitMove(pendingPromotion.from, pendingPromotion.to, type, pendingPromotion.isCapture);
      setPendingPromotion(null);
    },
    [pendingPromotion, commitMove],
  );

  // Arraste: ao soltar, decide o lance (drop inválido devolve a peça).
  const handleDrop = useCallback(
    (from: string, to: string | null) => {
      if (to && to !== from && game && (game.legalTargets[from] ?? []).includes(to)) {
        attemptMove(from, to);
        setSelected(null);
      } else if (to !== from) {
        setSelected(null); // drop inválido: a peça volta e desmarca
      }
      // to === from → mantém selecionado (vira clique-clique)
    },
    [game, attemptMove],
  );

  const { drag, pos: dragPos, beginDrag, cancelDrag } = usePieceDrag(boardRef, handleDrop);

  const over = !!game && (game.gameOver || resigned);
  const viewing = viewPly !== null;

  // Auto-save: partida encerrada (mate/empate/desistência) vai para o
  // localStorage. Dedupe por id torna o effect idempotente (re-render,
  // StrictMode, reload de partida já encerrada).
  useEffect(() => {
    if (!game || !over) return;
    const outcome = gameOutcome(game.status, game.winner, resigned);
    const saved: SavedGame = {
      id: game.id,
      savedAt: new Date().toISOString(),
      difficulty,
      playerColor: 'white',
      result: { kind: outcome.kind, status: game.status, winner: game.winner, resigned },
      sans: game.history,
      fens: game.fens,
      pgn: game.pgn,
    };
    writeSavedGames(addSavedGame(readSavedGames(localStorage), saved), localStorage);
  }, [game, over, resigned, difficulty]);

  const openSavedGames = useCallback(() => {
    setSavedGames(readSavedGames(localStorage));
    setShowSavedGames(true);
  }, []);

  const startReplay = useCallback((saved: SavedGame) => {
    setShowSavedGames(false);
    setSelected(null);
    setReplayGame(saved);
    setReplayPly(0);
  }, []);

  const deleteSavedGame = useCallback((id: string) => {
    setSavedGames((current) => {
      const list = removeSavedGame(current, id);
      writeSavedGames(list, localStorage);
      return list;
    });
  }, []);
  const playable =
    !!game && !over && !busy && game.turn === 'white' && !pendingPromotion && !viewing;
  const plyCount = game?.history.length ?? 0;

  // Navegação pelo histórico da partida ao vivo (null = presente). O server
  // nunca puxa o usuário para o presente — só ação explícita dele.
  const goToPly = useCallback(
    (ply: number | null) => {
      setSelected(null);
      cancelDrag();
      setViewPly(ply === null ? null : clampPly(ply, plyCount));
    },
    [cancelDrag, plyCount],
  );

  const stepView = useCallback(
    (delta: number) => {
      setSelected(null);
      cancelDrag();
      setViewPly((prev) => stepPly(prev, delta, plyCount));
    },
    [cancelDrag, plyCount],
  );

  // Teclado: ← → navegam, Home vai ao início, End volta ao presente (na
  // partida ao vivo) ou à posição final (no replay de uma partida salva).
  useEffect(() => {
    if (!game && !replayGame) return;
    const handler = (event: KeyboardEvent) => {
      if (pendingPromotion || confirmResign || showSavedGames) return;

      if (replayGame) {
        const count = replayGame.sans.length;
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          setReplayPly((ply) => clampPly(ply - 1, count));
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          setReplayPly((ply) => clampPly(ply + 1, count));
        } else if (event.key === 'Home') {
          event.preventDefault();
          setReplayPly(0);
        } else if (event.key === 'End') {
          event.preventDefault();
          setReplayPly(count);
        }
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        stepView(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        stepView(+1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        if (plyCount > 0) goToPly(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        goToPly(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    game,
    replayGame,
    showSavedGames,
    pendingPromotion,
    confirmResign,
    stepView,
    goToPly,
    plyCount,
  ]);

  const resign = useCallback(() => {
    setSelected(null);
    cancelDrag();
    setConfirmResign(false);
    setResigned(true);
  }, [cancelDrag]);

  const handleTakeback = useCallback(() => {
    if (!game) return;
    setSelected(null);
    cancelDrag();
    setAnnotations(EMPTY_ANNOTATIONS);
    takeback(game.id)
      .then((state) => {
        setGame(state);
        setBoard((prev) => ({
          pieces: state.pieces,
          animatedMove: null,
          animationMs: PLAYER_SLIDE_MS,
          seq: prev.seq + 1,
        }));
      })
      .catch(() => setError('Falha ao desfazer.'));
  }, [game, cancelDrag]);

  const handleSquarePointerDown = useCallback(
    (square: string, event: ReactPointerEvent) => {
      if (event.button !== 0) return; // botão direito é anotação (mouse handlers)
      if (!playable || !game) return;

      if (selected && (game.legalTargets[selected] ?? []).includes(square)) {
        attemptMove(selected, square);
        setSelected(null);
        return;
      }

      const piece = game.pieces.find((current) => current.square === square);
      if (piece && game.legalTargets[square]) {
        setSelected(square);
        beginDrag(square, piece, event);
      } else {
        setSelected(null);
      }
    },
    [game, selected, playable, attemptMove, beginDrag],
  );

  // Anotações: botão direito desenha (seta seguindo o caminho do mouse, ou
  // destaque ao clicar numa casa só); botão esquerdo limpa.
  const handleSquareMouseDown = useCallback((square: string, button: number) => {
    if (button === 2) {
      rightPath.current = [square];
    } else if (button === 0) {
      setAnnotations(EMPTY_ANNOTATIONS);
    }
  }, []);

  const handleSquareMouseEnter = useCallback((square: string) => {
    const path = rightPath.current;
    if (path && path[path.length - 1] !== square) path.push(square);
  }, []);

  const handleSquareMouseUp = useCallback((square: string, button: number) => {
    if (button !== 2) return;
    const path = rightPath.current;
    rightPath.current = null;
    if (!path) return;
    if (path[path.length - 1] !== square) path.push(square);
    setAnnotations((prev) =>
      path.length === 1
        ? { ...prev, highlights: toggleHighlight(prev.highlights, square) }
        : { ...prev, arrows: toggleArrow(prev.arrows, path) },
    );
  }, []);

  const outcome = game && over ? gameOutcome(game.status, game.winner, resigned) : null;

  // Replay de partida salva: tudo derivado do registro, sem engine nem rede.
  const replayCount = replayGame?.sans.length ?? 0;
  const replayFen = replayGame?.fens[clampPly(replayPly, replayCount)] ?? null;
  const replayOutcome = replayGame
    ? gameOutcome(replayGame.result.status, replayGame.result.winner, replayGame.result.resigned)
    : null;

  // Ao navegar o histórico, o tabuleiro mostra a posição do ply escolhido
  // (derivada do FEN); no presente, o estado otimista/animado de sempre.
  const viewedFen =
    game && viewPly !== null ? (game.fens[clampPly(viewPly, plyCount)] ?? game.fen) : null;
  const displayedPieces = viewedFen ? fenToPieces(viewedFen) : board.pieces;
  const captured = capturedPieces(displayedPieces);

  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">Zugzwang</h1>
        <p className="app__tagline">Xadrez contra o bot — você joga de brancas.</p>
      </header>

      {restoring ? (
        <p className="status">Carregando…</p>
      ) : replayGame ? (
        <>
          <div className="controls">
            <button type="button" onClick={() => setReplayGame(null)}>
              Voltar
            </button>
            <button type="button" onClick={openSavedGames}>
              Partidas
            </button>
          </div>

          <div className="board-area">
            <BoardView
              boardRef={boardRef}
              pieces={replayFen ? fenToPieces(replayFen) : []}
              selected={null}
              targets={[]}
              movable={[]}
              onSquarePointerDown={noopSquarePointer}
              onSquareMouseDown={noopSquareButton}
              onSquareMouseUp={noopSquareButton}
              onSquareMouseEnter={noopSquare}
              highlights={EMPTY_ANNOTATIONS.highlights}
              arrows={EMPTY_ANNOTATIONS.arrows}
              dragFrom={null}
              animatedMove={null}
              animationMs={PLAYER_SLIDE_MS}
              moveSeq={0}
              showHints={false}
            />
          </div>

          <ReplayControls
            ply={replayPly}
            plyCount={replayCount}
            onFirst={() => setReplayPly(0)}
            onPrev={() => setReplayPly((ply) => clampPly(ply - 1, replayCount))}
            onNext={() => setReplayPly((ply) => clampPly(ply + 1, replayCount))}
            onLast={() => setReplayPly(replayCount)}
          />

          <MoveList sans={replayGame.sans} currentPly={replayPly} onSelect={setReplayPly} />

          {replayOutcome ? (
            <p className="status status--muted">
              {replayOutcome.title} {replayOutcome.reason} · {replayGame.difficulty}
            </p>
          ) : null}
        </>
      ) : !game ? (
        <div className="start">
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
          <button
            type="button"
            className="button--primary"
            onClick={() => void startGame(difficulty)}
          >
            Jogar
          </button>
          <button type="button" onClick={openSavedGames}>
            Partidas
          </button>
        </div>
      ) : (
        <>
          <div className="controls">
            <button
              type="button"
              onClick={handleTakeback}
              disabled={!playable || game.history.length === 0}
            >
              Desfazer
            </button>
            <button type="button" onClick={() => setConfirmResign(true)} disabled={over}>
              Desistir
            </button>
            <button type="button" onClick={openSavedGames}>
              Partidas
            </button>
            <label className="controls__toggle">
              <input
                type="checkbox"
                checked={showHints}
                onChange={(event) => setShowHints(event.target.checked)}
              />{' '}
              Dicas
            </label>
            <label className="controls__toggle">
              <input
                type="checkbox"
                checked={soundOn}
                onChange={(event) => setSoundOn(event.target.checked)}
              />{' '}
              Som
            </label>
          </div>

          <CapturedRow
            pieces={captured.byBlack}
            color="white"
            lead={captured.advantage < 0 ? -captured.advantage : 0}
          />

          <div className="board-area">
            <BoardView
              boardRef={boardRef}
              pieces={displayedPieces}
              selected={selected}
              targets={selected ? (game.legalTargets[selected] ?? []) : []}
              movable={playable ? Object.keys(game.legalTargets) : []}
              onSquarePointerDown={handleSquarePointerDown}
              onSquareMouseDown={handleSquareMouseDown}
              onSquareMouseUp={handleSquareMouseUp}
              onSquareMouseEnter={handleSquareMouseEnter}
              highlights={annotations.highlights}
              arrows={annotations.arrows}
              dragFrom={drag?.from ?? null}
              animatedMove={viewing ? null : board.animatedMove}
              animationMs={board.animationMs}
              moveSeq={board.seq}
              showHints={showHints}
            />

            {pendingPromotion ? (
              <PromotionPicker onPick={promote} onCancel={() => setPendingPromotion(null)} />
            ) : null}

            {confirmResign ? (
              <ConfirmDialog
                text="Tem certeza de que deseja abandonar?"
                confirmLabel="Desistir"
                onConfirm={resign}
                onCancel={() => setConfirmResign(false)}
              />
            ) : null}

            {outcome ? (
              <EndScreen
                outcome={outcome}
                onRematch={() => void startGame(difficulty)}
                onNewBot={() => setGame(null)}
              />
            ) : null}
          </div>

          <CapturedRow
            pieces={captured.byWhite}
            color="black"
            lead={captured.advantage > 0 ? captured.advantage : 0}
          />

          {plyCount > 0 ? (
            <ReplayControls
              ply={viewPly ?? plyCount}
              plyCount={plyCount}
              onFirst={() => goToPly(0)}
              onPrev={() => stepView(-1)}
              onNext={() => stepView(+1)}
              onLast={() => goToPly(null)}
              onLive={viewing ? () => goToPly(null) : undefined}
            />
          ) : null}

          <MoveList
            sans={game.history}
            currentPly={viewPly ?? plyCount}
            onSelect={(ply) => goToPly(ply === plyCount ? null : ply)}
          />

          {viewing ? (
            <p className="status status--muted">
              Vendo o lance {viewPly} de {plyCount} — o jogo continua ao vivo.
            </p>
          ) : null}
          {!over && !viewing ? (
            <p className="status">{busy ? 'Bot pensando…' : statusText(game)}</p>
          ) : null}
          {!over && !viewing && botMoveOf(game) ? (
            <p className="status status--muted">Bot jogou: {botMoveOf(game)?.san}</p>
          ) : null}
        </>
      )}

      {error ? <p className="error">{error}</p> : null}

      {showSavedGames ? (
        <SavedGamesDialog
          games={savedGames}
          onReplay={startReplay}
          onDelete={deleteSavedGame}
          onClose={() => setShowSavedGames(false)}
        />
      ) : null}

      {drag && dragPos ? (
        <div
          className={`drag-piece piece--${drag.piece.color}`}
          aria-hidden="true"
          style={{
            left: dragPos.x,
            top: dragPos.y,
            width: drag.cell,
            height: drag.cell,
            fontSize: drag.cell * 0.8,
          }}
        >
          {glyph(drag.piece)}
        </div>
      ) : null}
    </main>
  );
}
