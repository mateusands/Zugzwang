import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ReplayScreen } from './components/ReplayScreen.js';
import { SavedGamesDialog } from './components/SavedGamesDialog.js';
import { EvalBar } from './components/EvalBar.js';
import { useSavedGames } from './useSavedGames.js';
import { useEvaluation } from './useEvaluation.js';
import { createReviewAnalysisStrategy } from './reviewAnalysis.js';
import { readSavedGames, type SavedGame } from './savedGames.js';
import {
  buildGameReview,
  isReviewCache,
  pendingDeepReviewItems,
  type GameReview,
  type ReviewCache,
} from './gameReview.js';
import { analyzePositionBatch, checkAnalysisBackend } from './analysisApi.js';
import {
  isObsoleteLiveBatch,
  liveReviewItems,
  mergeLiveReviewResults,
  pruneLiveReviewCache,
} from './liveReview.js';
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

interface LiveAnalysisBatch {
  fens: string[];
  controller: AbortController;
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
  const [showEval, setShowEval] = useState(true);
  /** Ply exibido ao navegar o histórico; null = no presente (jogo normal). */
  const [viewPly, setViewPly] = useState<number | null>(null);
  const saved = useSavedGames();
  /** Partida salva sendo revista; a partida ao vivo (game) fica intocada. */
  const [replayGame, setReplayGame] = useState<SavedGame | null>(null);
  const [replayStartsInReview, setReplayStartsInReview] = useState(false);
  const [endReview, setEndReview] = useState<GameReview | null>(null);
  const [endReviewing, setEndReviewing] = useState(false);
  const [endReviewProgress, setEndReviewProgress] = useState<{
    done: number;
    total: number;
    stage: 'quick' | 'deep';
  }>({ done: 0, total: 0, stage: 'quick' });
  const [endReviewError, setEndReviewError] = useState(false);
  const [liveReviewCache, setLiveReviewCache] = useState<ReviewCache>({});
  const endReviewRun = useRef(0);
  const endReviewAbort = useRef<AbortController | null>(null);
  const liveReviewCacheRef = useRef<ReviewCache>({});
  const liveAnalysisBatches = useRef(new Map<number, LiveAnalysisBatch>());
  const liveAnalysisInFlight = useRef(new Set<string>());
  const liveAnalysisSequence = useRef(0);
  const liveAnalysisGameId = useRef<string | null>(null);
  const liveGameFens = useRef<string[]>([]);
  /** Caminho de casas percorrido com o botão direito pressionado. */
  const rightPath = useRef<string[] | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  liveReviewCacheRef.current = liveReviewCache;
  liveGameFens.current = game?.fens ?? [];

  const cancelLiveAnalysis = useCallback(() => {
    for (const batch of liveAnalysisBatches.current.values()) batch.controller.abort();
    liveAnalysisBatches.current.clear();
    liveAnalysisInFlight.current.clear();
  }, []);

  const startGame = useCallback(
    async (level: Difficulty) => {
      endReviewAbort.current?.abort();
      endReviewAbort.current = null;
      endReviewRun.current += 1;
      setError(null);
      setSelected(null);
      setResigned(false);
      setAnnotations(EMPTY_ANNOTATIONS);
      setViewPly(null);
      setEndReview(null);
      setEndReviewing(false);
      setEndReviewError(false);
      setEndReviewProgress({ done: 0, total: 0, stage: 'quick' });
      cancelLiveAnalysis();
      liveAnalysisGameId.current = null;
      setLiveReviewCache({});
      setReplayGame(null);
      setReplayStartsInReview(false);
      setGame(null);
      try {
        const state = await createGame(level);
        setDifficulty(level);
        setGame(state);
        setBoard({
          pieces: state.pieces,
          animatedMove: null,
          animationMs: PLAYER_SLIDE_MS,
          seq: 0,
        });
      } catch {
        setError('Não foi possível falar com o servidor. Ele está rodando? (pnpm dev)');
      }
    },
    [cancelLiveAnalysis],
  );

  // Restaura a partida em andamento ao recarregar a página.
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setRestoring(false);
      return;
    }
    let stored: {
      id: string;
      difficulty: Difficulty;
      resigned: boolean;
      reviewCache?: unknown;
    };
    try {
      stored = JSON.parse(raw) as typeof stored;
    } catch {
      setRestoring(false);
      return;
    }
    getGame(stored.id)
      .then((state) => {
        setDifficulty(stored.difficulty);
        setResigned(stored.resigned);
        setLiveReviewCache(isReviewCache(stored.reviewCache) ? stored.reviewCache : {});
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

  // Persiste a partida atual e o trabalho Stockfish já concluído em segundo plano.
  useEffect(() => {
    if (restoring) return;
    if (game) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          id: game.id,
          difficulty,
          resigned,
          ...(Object.keys(liveReviewCache).length > 0 ? { reviewCache: liveReviewCache } : {}),
        }),
      );
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [game, difficulty, resigned, liveReviewCache, restoring]);

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

  // Usa o tempo entre lances para preparar a passagem rápida da revisão.
  // Jobs continuam em voo entre renders; takeback cancela somente lotes que
  // contenham posições removidas da linha atual.
  useEffect(() => {
    if (!game) {
      cancelLiveAnalysis();
      liveAnalysisGameId.current = null;
      return;
    }
    if (liveAnalysisGameId.current !== game.id) {
      cancelLiveAnalysis();
      liveAnalysisGameId.current = game.id;
    }

    for (const [batchId, batch] of liveAnalysisBatches.current) {
      if (!isObsoleteLiveBatch(batch.fens, game.fens)) continue;
      batch.controller.abort();
      for (const fen of batch.fens) liveAnalysisInFlight.current.delete(fen);
      liveAnalysisBatches.current.delete(batchId);
    }
    setLiveReviewCache((current) => pruneLiveReviewCache(current, game.fens));

    if (over) {
      cancelLiveAnalysis();
      return;
    }

    const quickItems = liveReviewItems(
      game.history,
      game.fens,
      liveReviewCacheRef.current,
      liveAnalysisInFlight.current,
    );
    const reviewSource = {
      sans: game.history,
      fens: game.fens,
      // Uma linha em andamento precisa da avaliação de sua posição atual.
      result: {
        kind: 'draw' as const,
        status: 'in_progress',
        resigned: true,
        winner: null,
      },
    };
    const initialDeepItems =
      quickItems.length === 0
        ? pendingDeepReviewItems(reviewSource, liveReviewCacheRef.current).filter(
            (item) => !liveAnalysisInFlight.current.has(item.fen),
          )
        : [];
    if (quickItems.length === 0 && initialDeepItems.length === 0) return;

    const controller = new AbortController();
    const batchId = ++liveAnalysisSequence.current;
    const trackBatch = (fens: string[]) => {
      const previous = liveAnalysisBatches.current.get(batchId);
      for (const fen of previous?.fens ?? []) liveAnalysisInFlight.current.delete(fen);
      if (fens.length === 0) {
        liveAnalysisBatches.current.delete(batchId);
        return;
      }
      for (const fen of fens) liveAnalysisInFlight.current.add(fen);
      liveAnalysisBatches.current.set(batchId, { fens, controller });
    };
    const mergeResults = (
      items: typeof quickItems,
      results: Parameters<typeof mergeLiveReviewResults>[2],
      quality: 'quick' | 'deep',
    ) => {
      if (controller.signal.aborted) return liveReviewCacheRef.current;
      const next = pruneLiveReviewCache(
        mergeLiveReviewResults(liveReviewCacheRef.current, items, results, quality),
        liveGameFens.current,
      );
      liveReviewCacheRef.current = next;
      setLiveReviewCache(next);
      return next;
    };
    trackBatch((quickItems.length > 0 ? quickItems : initialDeepItems).map((item) => item.fen));

    void checkAnalysisBackend(controller.signal)
      .then(async (backend) => {
        if (!backend.available || controller.signal.aborted) return null;
        let cache = liveReviewCacheRef.current;
        if (quickItems.length > 0) {
          const results = await analyzePositionBatch(quickItems, 'fast', {
            signal: controller.signal,
            onResults: (partial) => {
              cache = mergeResults(quickItems, partial, 'quick');
            },
          });
          cache = mergeResults(quickItems, results, 'quick');
          trackBatch([]);
        }
        if (controller.signal.aborted) return null;

        const deepItems = (
          quickItems.length > 0 ? pendingDeepReviewItems(reviewSource, cache) : initialDeepItems
        ).filter((item) => !liveAnalysisInFlight.current.has(item.fen));
        if (deepItems.length === 0) return null;
        trackBatch(deepItems.map((item) => item.fen));

        // Um item profundo por job reserva o outro processo Stockfish para a
        // posição fast do próximo lance.
        for (const item of deepItems) {
          if (controller.signal.aborted) break;
          const results = await analyzePositionBatch([item], 'deep', {
            signal: controller.signal,
            onResults: (partial) => {
              cache = mergeResults([item], partial, 'deep');
            },
          });
          cache = mergeResults([item], results, 'deep');
        }
        return null;
      })
      .catch(() => undefined)
      .finally(() => {
        trackBatch([]);
      });
  }, [cancelLiveAnalysis, game, over]);

  useEffect(() => () => cancelLiveAnalysis(), [cancelLiveAnalysis]);

  const finishedSavedGame = useMemo<SavedGame | null>(() => {
    if (!game || !over) return null;
    const finishedOutcome = gameOutcome(game.status, game.winner, resigned);
    return {
      id: game.id,
      savedAt: new Date().toISOString(),
      difficulty,
      playerColor: 'white',
      result: {
        kind: finishedOutcome.kind,
        status: game.status,
        winner: game.winner,
        resigned,
      },
      sans: game.history,
      fens: game.fens,
      pgn: game.pgn,
      ...(Object.keys(liveReviewCache).length > 0 ? { reviewCache: liveReviewCache } : {}),
    };
  }, [difficulty, game, liveReviewCache, over, resigned]);

  // Auto-save: partida encerrada (mate/empate/desistência) vai para o
  // localStorage. Dedupe por id e savedAt estável tornam o effect idempotente
  // (re-render, StrictMode, reload de partida já encerrada).
  const { saveFinished, saveReview, saveReviewCache } = saved;
  useEffect(() => {
    if (finishedSavedGame) saveFinished(finishedSavedGame);
  }, [finishedSavedGame, saveFinished]);

  // A tela de fim já prepara a revisão para mostrar o top 3 e para que o
  // botão abra o replay instantaneamente, sem uma segunda análise.
  useEffect(() => {
    if (!finishedSavedGame) return;
    endReviewAbort.current?.abort();
    endReviewAbort.current = null;
    const stored = readSavedGames(localStorage).find(
      (savedGame) => savedGame.id === finishedSavedGame.id,
    );
    if (stored?.review) {
      endReviewRun.current += 1;
      setEndReview(stored.review);
      setEndReviewing(false);
      setEndReviewError(false);
      return;
    }

    const gameWithCache: SavedGame = stored?.reviewCache
      ? { ...finishedSavedGame, reviewCache: stored.reviewCache }
      : finishedSavedGame;

    const run = ++endReviewRun.current;
    const controller = new AbortController();
    endReviewAbort.current = controller;
    setEndReview(null);
    setEndReviewing(true);
    setEndReviewError(false);
    setEndReviewProgress({ done: 0, total: finishedSavedGame.fens.length, stage: 'quick' });
    void createReviewAnalysisStrategy(controller.signal)
      .then((strategy) => {
        if (controller.signal.aborted) {
          throw new DOMException('game review cancelled', 'AbortError');
        }
        return buildGameReview(
          gameWithCache,
          strategy.evaluate,
          (done, total, stage) => {
            if (endReviewRun.current === run) setEndReviewProgress({ done, total, stage });
          },
          {
            cache: gameWithCache.reviewCache,
            onCache: (cache) => {
              if (!controller.signal.aborted) saveReviewCache(finishedSavedGame.id, cache);
            },
            signal: controller.signal,
            ...(strategy.batchEvaluate ? { batchEvaluate: strategy.batchEvaluate } : {}),
          },
        );
      })
      .then((completed) => {
        if (controller.signal.aborted || endReviewRun.current !== run) return;
        saveReview(finishedSavedGame.id, completed);
        setEndReview(completed);
      })
      .catch(() => {
        if (!controller.signal.aborted && endReviewRun.current === run) setEndReviewError(true);
      })
      .finally(() => {
        if (endReviewAbort.current === controller) endReviewAbort.current = null;
        if (!controller.signal.aborted && endReviewRun.current === run) setEndReviewing(false);
      });
    return () => {
      controller.abort();
      if (endReviewAbort.current === controller) endReviewAbort.current = null;
    };
  }, [finishedSavedGame, saveReview, saveReviewCache]);

  const startReplay = useCallback(
    (savedGame: SavedGame, startInReview = false) => {
      saved.closeList();
      setSelected(null);
      setReplayStartsInReview(startInReview);
      setReplayGame(savedGame);
    },
    [saved],
  );
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

  // Teclado da partida ao vivo: ← → navegam, Home vai ao início, End volta
  // ao presente. (O replay de partida salva tem o próprio teclado, no
  // ReplayScreen — quando ele está aberto, este effect fica de fora.)
  const { showList } = saved;
  useEffect(() => {
    if (!game || replayGame) return;
    const handler = (event: KeyboardEvent) => {
      if (pendingPromotion || confirmResign || showList) return;
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
  }, [game, replayGame, showList, pendingPromotion, confirmResign, stepView, goToPly, plyCount]);

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

  // Ao navegar o histórico, o tabuleiro mostra a posição do ply escolhido
  // (derivada do FEN); no presente, o estado otimista/animado de sempre.
  const viewedFen =
    game && viewPly !== null ? (game.fens[clampPly(viewPly, plyCount)] ?? game.fen) : null;
  const displayedPieces = viewedFen ? fenToPieces(viewedFen) : board.pieces;
  const captured = capturedPieces(displayedPieces);

  // Avalia a posição exibida (a do ply navegado, ou a atual da partida).
  const evaluation = useEvaluation(
    game ? (viewedFen ?? game.fen) : null,
    showEval && !!game && !endReviewing,
  );

  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">Zugzwang</h1>
        <p className="app__tagline">Xadrez contra o bot — você joga de brancas.</p>
      </header>

      {restoring ? (
        <p className="status">Carregando…</p>
      ) : replayGame ? (
        <ReplayScreen
          savedGame={replayGame}
          startInReview={replayStartsInReview}
          suspendKeys={saved.showList}
          onBack={() => {
            setReplayGame(null);
            setReplayStartsInReview(false);
          }}
          onOpenList={saved.openList}
          onSaveReview={saved.saveReview}
          onSaveReviewCache={saved.saveReviewCache}
        />
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
          <button type="button" onClick={saved.openList}>
            Partidas
          </button>
        </div>
      ) : (
        <div className="game-layout">
          <MoveList
            sans={game.history}
            currentPly={viewPly ?? plyCount}
            onSelect={(ply) => goToPly(ply === plyCount ? null : ply)}
          />

          <div className="game-layout__main">
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
              <button type="button" onClick={saved.openList}>
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
              <label className="controls__toggle">
                <input
                  type="checkbox"
                  checked={showEval}
                  onChange={(event) => setShowEval(event.target.checked)}
                />{' '}
                Avaliação
              </label>
            </div>

            <CapturedRow
              pieces={captured.byBlack}
              color="white"
              lead={captured.advantage < 0 ? -captured.advantage : 0}
            />

            <div className="board-row">
              <EvalBar
                evaluation={evaluation.evaluation}
                thinking={evaluation.thinking}
                error={evaluation.error}
                hidden={!showEval}
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
                    review={endReview}
                    reviewing={endReviewing}
                    reviewProgress={endReviewProgress}
                    reviewStage={endReviewProgress.stage}
                    reviewError={endReviewError}
                    onReview={() => {
                      if (!finishedSavedGame) return;
                      const storedGame = readSavedGames(localStorage).find(
                        (savedGame) => savedGame.id === finishedSavedGame.id,
                      );
                      const replaySource = storedGame?.reviewCache
                        ? { ...finishedSavedGame, reviewCache: storedGame.reviewCache }
                        : finishedSavedGame;
                      startReplay(
                        endReview ? { ...replaySource, review: endReview } : replaySource,
                        true,
                      );
                    }}
                    onRematch={() => void startGame(difficulty)}
                    onNewBot={() => {
                      endReviewAbort.current?.abort();
                      endReviewAbort.current = null;
                      endReviewRun.current += 1;
                      setEndReview(null);
                      setEndReviewing(false);
                      setEndReviewError(false);
                      setGame(null);
                    }}
                  />
                ) : null}
              </div>
            </div>

            <CapturedRow
              pieces={captured.byWhite}
              color="black"
              lead={captured.advantage > 0 ? captured.advantage : 0}
            />

            {/* Slot sempre presente: os controles nascem invisíveis e o
                tabuleiro não se move quando o primeiro lance os revela. */}
            <div className={`replay-slot${plyCount === 0 ? ' replay-slot--hidden' : ''}`}>
              <ReplayControls
                ply={viewPly ?? plyCount}
                plyCount={plyCount}
                onFirst={() => goToPly(0)}
                onPrev={() => stepView(-1)}
                onNext={() => stepView(+1)}
                onLast={() => goToPly(null)}
                onLive={viewing ? () => goToPly(null) : undefined}
              />
            </div>

            {/* Duas linhas de status com altura reservada — nada desloca. */}
            <p className="status">
              {viewing
                ? `Vendo o lance ${viewPly} de ${plyCount} — o jogo continua ao vivo.`
                : over
                  ? ''
                  : busy
                    ? 'Bot pensando…'
                    : statusText(game)}
            </p>
            <p className="status status--muted">
              {!over && !viewing && botMoveOf(game) ? `Bot jogou: ${botMoveOf(game)?.san}` : ''}
            </p>
          </div>
        </div>
      )}

      {error ? <p className="error">{error}</p> : null}

      {saved.showList ? (
        <SavedGamesDialog
          games={saved.savedGames}
          onReplay={startReplay}
          onDelete={saved.deleteGame}
          onClose={saved.closeList}
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

      <footer className="app__footer">
        Análise por{' '}
        <a href="https://stockfishchess.org" target="_blank" rel="noreferrer">
          Stockfish
        </a>{' '}
        (
        <a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noreferrer">
          stockfish.js
        </a>
        , GPLv3)
      </footer>
    </main>
  );
}
