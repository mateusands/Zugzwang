interface ReplayControlsProps {
  /** Posição exibida, em plies (0 = inicial, plyCount = final/presente). */
  ply: number;
  plyCount: number;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
  /** No modo ao vivo, volta ao presente; só aparece quando fornecido. */
  onLive?: () => void;
}

/** Controles de navegação pelo histórico: |◀ ◀ ▶ ▶| + contador de lances. */
export function ReplayControls({
  ply,
  plyCount,
  onFirst,
  onPrev,
  onNext,
  onLast,
  onLive,
}: ReplayControlsProps) {
  const atStart = ply === 0;
  const atEnd = ply === plyCount;

  return (
    <div className="replay-controls">
      <button type="button" onClick={onFirst} disabled={atStart} aria-label="Primeiro lance">
        |◀
      </button>
      <button type="button" onClick={onPrev} disabled={atStart} aria-label="Lance anterior">
        ◀
      </button>
      <span className="replay-controls__counter">
        Lance {ply} de {plyCount}
      </span>
      <button type="button" onClick={onNext} disabled={atEnd} aria-label="Próximo lance">
        ▶
      </button>
      <button type="button" onClick={onLast} disabled={atEnd} aria-label="Último lance">
        ▶|
      </button>
      {onLive ? (
        <button type="button" className="button--primary" onClick={onLive}>
          Ao vivo
        </button>
      ) : null}
    </div>
  );
}
