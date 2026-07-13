import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { BoardView } from '../BoardView.js';
import { EMPTY_ANNOTATIONS } from '../annotations.js';
import { fenToPieces } from '../fen.js';
import { gameOutcome } from '../outcome.js';
import { buildGameReview, type GameReview, type ReviewCache } from '../gameReview.js';
import { clampPly } from '../replay.js';
import { getSharedEngine, useEvaluation } from '../useEvaluation.js';
import type { SavedGame } from '../savedGames.js';
import type { MoveClass } from '../review.js';
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
  const [filter, setFilter] = useState<MoveClass | null>(null);
  /** Lance selecionado na revisão; o tabuleiro fica na posição anterior a ele. */
  const [selectedReviewPly, setSelectedReviewPly] = useState<number | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const reviewRun = useRef(0);

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
    reviewRun.current += 1;
    setPly(0);
    setReviewEnabled(startInReview);
    setReview(savedGame.review ?? null);
    setReviewing(false);
    setReviewError(false);
    setFilter(null);
    setSelectedReviewPly(null);
  }, [savedGame.id, savedGame.review, startInReview]);

  useEffect(
    () => () => {
      reviewRun.current += 1;
    },
    [],
  );

  const startReview = useCallback(async () => {
    if (review || reviewing) return;
    const run = ++reviewRun.current;
    setReviewing(true);
    setReviewError(false);
    setReviewProgress({ done: 0, total: savedGame.fens.length, stage: 'quick' });
    try {
      const client = await getSharedEngine();
      const completed = await buildGameReview(
        savedGame,
        (position, request) => client.evaluate(position, request),
        (done, total, stage) => {
          if (reviewRun.current === run) setReviewProgress({ done, total, stage });
        },
        {
          cache: savedGame.reviewCache,
          onCache: (cache) => onSaveReviewCache?.(savedGame.id, cache),
        },
      );
      if (reviewRun.current !== run) return;
      setReview(completed);
      onSaveReview(savedGame.id, completed);
    } catch {
      if (reviewRun.current === run) setReviewError(true);
    } finally {
      if (reviewRun.current === run) setReviewing(false);
    }
  }, [onSaveReview, onSaveReviewCache, review, reviewing, savedGame]);

  useEffect(() => {
    if (startInReview && !review && !reviewing && !reviewError) void startReview();
  }, [review, reviewError, reviewing, startInReview, startReview]);

  const toggleReview = (enabled: boolean) => {
    setReviewEnabled(enabled);
    if (!enabled && selectedReviewPly !== null) {
      setPly(selectedReviewPly);
      setSelectedReviewPly(null);
    }
    if (enabled && !review) void startReview();
  };

  const navigateTo = useCallback(
    (next: number) => {
      setSelectedReviewPly(null);
      setPly(clampPly(next, plyCount));
    },
    [plyCount],
  );
  const selectMove = (selectedPly: number) => {
    if (reviewEnabled && review) {
      setSelectedReviewPly(selectedPly);
      setPly(clampPly(selectedPly - 1, plyCount));
    } else {
      navigateTo(selectedPly);
    }
  };

  const selectedReview =
    reviewEnabled && review && selectedReviewPly !== null
      ? review.plies[selectedReviewPly - 1]
      : undefined;
  const bestMove = selectedReview?.bestMove ?? '';
  const reviewArrows =
    bestMove.length >= 4 ? [{ path: [bestMove.slice(0, 2), bestMove.slice(2, 4)] }] : [];

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
              animatedMove={null}
              animationMs={0}
              moveSeq={0}
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
              ? `Refinando ${reviewProgress.done}/${reviewProgress.total} posições críticas…`
              : `Analisando ${reviewProgress.done}/${reviewProgress.total} posições…`
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
