import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { BoardView } from '../BoardView.js';
import { EMPTY_ANNOTATIONS } from '../annotations.js';
import { fenToPieces } from '../fen.js';
import { gameOutcome } from '../outcome.js';
import { clampPly } from '../replay.js';
import type { SavedGame } from '../savedGames.js';
import { MoveList } from './MoveList.js';
import { ReplayControls } from './ReplayControls.js';

interface ReplayScreenProps {
  savedGame: SavedGame;
  /** Pausa o teclado enquanto um dialog está aberto por cima. */
  suspendKeys: boolean;
  onBack: () => void;
  onOpenList: () => void;
}

// Tabuleiro do replay é só leitura: handlers inertes, estáveis entre renders.
function noopSquarePointer(_square: string, _event: ReactPointerEvent) {}
function noopSquareButton(_square: string, _button: number) {}
function noopSquare(_square: string) {}

/** Revisão de uma partida salva: navegação lance a lance, sem engine nem rede. */
export function ReplayScreen({ savedGame, suspendKeys, onBack, onOpenList }: ReplayScreenProps) {
  const [ply, setPly] = useState(0);
  const boardRef = useRef<HTMLDivElement>(null);

  const plyCount = savedGame.sans.length;
  const fen = savedGame.fens[clampPly(ply, plyCount)] ?? null;
  const outcome = gameOutcome(
    savedGame.result.status,
    savedGame.result.winner,
    savedGame.result.resigned,
  );

  // Recomeça do início ao trocar de partida.
  useEffect(() => setPly(0), [savedGame.id]);

  // Teclado: ← → navegam, Home vai ao início, End à posição final.
  useEffect(() => {
    if (suspendKeys) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setPly((current) => clampPly(current - 1, plyCount));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setPly((current) => clampPly(current + 1, plyCount));
      } else if (event.key === 'Home') {
        event.preventDefault();
        setPly(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        setPly(plyCount);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [suspendKeys, plyCount]);

  return (
    <>
      <div className="controls">
        <button type="button" onClick={onBack}>
          Voltar
        </button>
        <button type="button" onClick={onOpenList}>
          Partidas
        </button>
      </div>

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
          arrows={EMPTY_ANNOTATIONS.arrows}
          dragFrom={null}
          animatedMove={null}
          animationMs={0}
          moveSeq={0}
          showHints={false}
        />
      </div>

      <ReplayControls
        ply={ply}
        plyCount={plyCount}
        onFirst={() => setPly(0)}
        onPrev={() => setPly((current) => clampPly(current - 1, plyCount))}
        onNext={() => setPly((current) => clampPly(current + 1, plyCount))}
        onLast={() => setPly(plyCount)}
      />

      <MoveList sans={savedGame.sans} currentPly={ply} onSelect={setPly} />

      <p className="status status--muted">
        {outcome.title} {outcome.reason} · {savedGame.difficulty}
      </p>
    </>
  );
}
