import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { BoardView, type AnimatedMove, type MoveFeedback } from '../BoardView.js';
import { EMPTY_ANNOTATIONS } from '../annotations.js';
import { fenToPieces } from '../fen.js';
import { gameOutcome } from '../outcome.js';
import {
  buildGameReview,
  moveUciFromFens,
  type GameReview,
  type ReviewCache,
} from '../gameReview.js';
import { clampPly } from '../replay.js';
import { useEvaluation } from '../useEvaluation.js';
import { createReviewAnalysisStrategy } from '../reviewAnalysis.js';
import type { SavedGame } from '../savedGames.js';
import { MOVE_CLASS_ICONS, MOVE_CLASS_LABELS, type MoveClass } from '../review.js';
import { MoveList } from './MoveList.js';
import { ReplayControls } from './ReplayControls.js';
import { EvalBar } from './EvalBar.js';
import { ReviewPanel } from './ReviewPanel.js';

interface ReplayScreenProps {
  savedGame: SavedGame;
  /** Abre diretamente no modo de revisão (atalho vindo da tela de fim). */
  startInReview?: boolean;
  /** Pausa o teclado enquanto um dialog está aberto por cima. */
  suspendKeys: boolean;
  onBack: () => void;
  onOpenList: () => void;
  onSaveReview: (id: string, review: GameReview) => void;
  onSaveReviewCache?: (id: string, cache: ReviewCache) => void;
}

// Tabuleiro do replay é só leitura: handlers inertes, estáveis entre renders.
function noopSquarePointer(_square: string, _event: ReactPointerEvent) {}
function noopSquareButton(_square: string, _button: number) {}
function noopSquare(_square: string) {}

const REVIEW_SLIDE_MS = 320;

function moveFromUci(uci: string): AnimatedMove | null {
  if (!/^[a-h][1-8][a-h][1-8]/.test(uci)) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

/** Revisão de uma partida salva: navegação lance a lance, sem engine nem rede. */
export function ReplayScreen({
  savedGame,
  startInReview = false,
  suspendKeys,
  onBack,
  onOpenList,
  onSaveReview,
  onSaveReviewCache,
}: ReplayScreenProps) {
  const [ply, setPly] = useState(0);
  const [showEval, setShowEval] = useState(true);
  const [reviewEnabled, setReviewEnabled] = useState(startInReview);
  const [review, setReview] = useState<GameReview | null>(savedGame.review ?? null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewProgress, setReviewProgress] = useState<{
    done: number;
    total: number;
    stage: 'quick' | 'deep';
  }>({ done: 0, total: 0, stage: 'quick' });
  const [reviewError, setReviewError] = useState(false);
  const [reviewSource, setReviewSource] = useState<'checking' | 'server' | 'browser'>('checking');
  const [filter, setFilter] = useState<MoveClass | null>(null);
  /** Lance selecionado na revisão; o tabuleiro anima até a posição posterior. */
  const [selectedReviewPly, setSelectedReviewPly] = useState<number | null>(null);
  const [reviewMoveSeq, setReviewMoveSeq] = useState(0);
  const [replayAnimation, setReplayAnimation] = useState<AnimatedMove | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const reviewRun = useRef(0);
  const reviewAbort = useRef<AbortController | null>(null);
  const animationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const plyCount = savedGame.sans.length;
  const fen = savedGame.fens[clampPly(ply, plyCount)] ?? null;
  const evaluation = useEvaluation(fen, showEval && !reviewing);
  const outcome = gameOutcome(
    savedGame.result.status,
    savedGame.result.winner,
    savedGame.result.resigned,
  );

  // Recomeça do início ao trocar de partida.
  useEffect(() => {
    reviewAbort.current?.abort();
    reviewAbort.current = null;
    if (animationTimer.current) clearTimeout(animationTimer.current);
    animationTimer.current = null;
    reviewRun.current += 1;
    setPly(0);
    setReviewEnabled(startInReview);
    setReview(savedGame.review ?? null);
    setReviewing(false);
    setReviewError(false);
    setReviewSource('checking');
    setFilter(null);
    setSelectedReviewPly(null);
    setReviewMoveSeq(0);
    setReplayAnimation(null);
  }, [savedGame.id, savedGame.review, startInReview]);

  useEffect(
    () => () => {
      reviewAbort.current?.abort();
      reviewAbort.current = null;
      if (animationTimer.current) clearTimeout(animationTimer.current);
      reviewRun.current += 1;
    },
    [],
  );

  const startReview = useCallback(async () => {
    if (review || reviewing) return;
    reviewAbort.current?.abort();
    const controller = new AbortController();
    reviewAbort.current = controller;
    const run = ++reviewRun.current;
    setReviewing(true);
    setReviewError(false);
    setReviewSource('checking');
    setReviewProgress({ done: 0, total: savedGame.fens.length, stage: 'quick' });
    try {
      const strategy = await createReviewAnalysisStrategy(controller.signal);
      if (controller.signal.aborted) return;
      setReviewSource(strategy.source);
      const completed = await buildGameReview(
        savedGame,
        strategy.evaluate,
        (done, total, stage) => {
          if (reviewRun.current === run) setReviewProgress({ done, total, stage });
        },
        {
          cache: savedGame.reviewCache,
          onCache: (cache) => {
            if (!controller.signal.aborted) onSaveReviewCache?.(savedGame.id, cache);
          },
          signal: controller.signal,
          ...(strategy.batchEvaluate ? { batchEvaluate: strategy.batchEvaluate } : {}),
        },
      );
      if (controller.signal.aborted || reviewRun.current !== run) return;
      setReview(completed);
      onSaveReview(savedGame.id, completed);
    } catch {
      if (!controller.signal.aborted && reviewRun.current === run) setReviewError(true);
    } finally {
      if (reviewAbort.current === controller) reviewAbort.current = null;
      if (!controller.signal.aborted && reviewRun.current === run) setReviewing(false);
    }
  }, [onSaveReview, onSaveReviewCache, review, reviewing, savedGame]);

  useEffect(() => {
    if (startInReview && !review && !reviewing && !reviewError) void startReview();
  }, [review, reviewError, reviewing, startInReview, startReview]);

  const toggleReview = (enabled: boolean) => {
    setReviewEnabled(enabled);
    if (!enabled && reviewing) {
      reviewAbort.current?.abort();
      reviewAbort.current = null;
      reviewRun.current += 1;
      setReviewing(false);
    }
    if (!enabled && selectedReviewPly !== null) {
      setPly(selectedReviewPly);
      setSelectedReviewPly(null);
    }
    if (enabled && !review) void startReview();
  };

  const moveAtPly = useCallback(
    (movePly: number): AnimatedMove | null => {
      if (movePly < 1 || movePly > plyCount) return null;
      const reviewedMove = review?.plies[movePly - 1]?.playedMove;
      if (reviewedMove) return moveFromUci(reviewedMove);
      const before = savedGame.fens[movePly - 1];
      const after = savedGame.fens[movePly];
      const san = savedGame.sans[movePly - 1];
      if (!before || !after || !san) return null;
      try {
        return moveFromUci(moveUciFromFens(before, after, san));
      } catch {
        return null;
      }
    },
    [plyCount, review, savedGame.fens, savedGame.sans],
  );

  const playAnimation = useCallback((move: AnimatedMove | null) => {
    if (animationTimer.current) clearTimeout(animationTimer.current);
    setReplayAnimation(move);
    if (!move) return;
    setReviewMoveSeq((current) => current + 1);
    animationTimer.current = setTimeout(() => {
      animationTimer.current = null;
      setReplayAnimation(null);
    }, REVIEW_SLIDE_MS);
  }, []);

  const navigateTo = useCallback(
    (next: number) => {
      const target = clampPly(next, plyCount);
      if (target === ply) return;
      const forward = target > ply;
      const traversedPly = forward ? target : target + 1;
      const traversedMove = moveAtPly(traversedPly);
      playAnimation(
        !forward && traversedMove
          ? { from: traversedMove.to, to: traversedMove.from }
          : traversedMove,
      );
      setPly(target);
      setSelectedReviewPly(reviewEnabled && review && target > 0 ? target : null);
    },
    [moveAtPly, playAnimation, ply, plyCount, review, reviewEnabled],
  );
  const selectMove = (selectedPly: number) => {
    if (reviewEnabled && review) {
      setSelectedReviewPly(selectedPly);
      setPly(clampPly(selectedPly, plyCount));
      playAnimation(moveAtPly(selectedPly));
    } else {
      navigateTo(selectedPly);
    }
  };

  const selectedReview =
    reviewEnabled && review && selectedReviewPly !== null
      ? review.plies[selectedReviewPly - 1]
      : undefined;
  const bestMove = selectedReview?.bestMove ?? '';
  const selectedPlayedMove = selectedReview ? moveFromUci(selectedReview.playedMove) : null;
  const moveFeedback: MoveFeedback | null =
    selectedReview && selectedPlayedMove
      ? {
          ...selectedPlayedMove,
          moveClass: selectedReview.class,
          icon: MOVE_CLASS_ICONS[selectedReview.class],
          label: MOVE_CLASS_LABELS[selectedReview.class],
        }
      : null;
  const suggestedMove = moveFromUci(bestMove);
  const reviewArrows =
    suggestedMove && bestMove.slice(0, 4) !== selectedReview?.playedMove.slice(0, 4)
      ? [{ path: [suggestedMove.from, suggestedMove.to], tone: 'best' as const }]
      : [];

  // Teclado: ← → navegam, Home vai ao início, End à posição final.
  useEffect(() => {
    if (suspendKeys) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        navigateTo(ply - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        navigateTo(ply + 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        navigateTo(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        navigateTo(plyCount);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [suspendKeys, ply, plyCount, navigateTo]);

  return (
    <div className="game-layout">
      <MoveList
        sans={savedGame.sans}
        currentPly={selectedReviewPly ?? ply}
        onSelect={selectMove}
        reviews={reviewEnabled && review ? review.plies : undefined}
        filter={reviewEnabled ? filter : null}
      />

      <div className="game-layout__main">
        <div className="controls">
          <button type="button" onClick={onBack}>
            Voltar
          </button>
          <button type="button" onClick={onOpenList}>
            Partidas
          </button>
          <label className="controls__toggle">
            <input
              type="checkbox"
              checked={showEval}
              onChange={(event) => setShowEval(event.target.checked)}
            />{' '}
            Avaliação
          </label>
          <label className="controls__toggle">
            <input
              type="checkbox"
              checked={reviewEnabled}
              onChange={(event) => toggleReview(event.target.checked)}
            />{' '}
            Revisar partida
          </label>
        </div>

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
              pieces={fen ? fenToPieces(fen) : []}
              selected={null}
              targets={[]}
              movable={[]}
              onSquarePointerDown={noopSquarePointer}
              onSquareMouseDown={noopSquareButton}
              onSquareMouseUp={noopSquareButton}
              onSquareMouseEnter={noopSquare}
              highlights={EMPTY_ANNOTATIONS.highlights}
              arrows={reviewArrows}
              dragFrom={null}
              animatedMove={replayAnimation}
              animationMs={REVIEW_SLIDE_MS}
              moveSeq={reviewMoveSeq}
              moveFeedback={moveFeedback}
              showHints={false}
            />
          </div>
        </div>

        <ReplayControls
          ply={ply}
          plyCount={plyCount}
          onFirst={() => navigateTo(0)}
          onPrev={() => navigateTo(ply - 1)}
          onNext={() => navigateTo(ply + 1)}
          onLast={() => navigateTo(plyCount)}
        />

        <p className="status status--muted">
          {reviewing
            ? reviewProgress.stage === 'deep'
              ? `Refinando ${reviewProgress.done}/${reviewProgress.total} posições críticas ${reviewSource === 'server' ? 'no servidor' : 'no navegador'}…`
              : `Analisando ${reviewProgress.done}/${reviewProgress.total} posições ${reviewSource === 'server' ? 'no servidor' : reviewSource === 'browser' ? 'no navegador' : ''}…`
            : reviewError
              ? 'Não foi possível revisar a partida.'
              : `${outcome.title} ${outcome.reason} · ${savedGame.difficulty}`}
        </p>
      </div>

      {reviewEnabled && review ? (
        <ReviewPanel
          review={review}
          selectedPly={selectedReviewPly ?? 0}
          filter={filter}
          onFilter={setFilter}
        />
      ) : null}
    </div>
  );
}
