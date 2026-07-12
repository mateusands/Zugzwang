import { useCallback, useEffect, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { orderedSquares } from './board.js';
import type { Piece } from './api.js';

const ALL_SQUARES = new Set(orderedSquares());

export interface DragState {
  from: string;
  piece: Piece;
  /** Board cell size in px, to size the floating piece. */
  cell: number;
}

/** Square under the given screen point, or null when outside the board. */
function squareFromPoint(x: number, y: number): string | null {
  const element = document.elementFromPoint(x, y);
  const button = element?.closest('[data-square]');
  const square = button instanceof HTMLElement ? (button.dataset.square ?? null) : null;
  return square && ALL_SQUARES.has(square) ? square : null;
}

/**
 * Arraste de peça baseado em pointer events: a peça flutuante segue o cursor
 * e, ao soltar, `onDrop(from, to)` decide o lance (`to` é null fora do
 * tabuleiro). O chamador renderiza a peça flutuante com `drag` + `pos`.
 */
export function usePieceDrag(
  boardRef: RefObject<HTMLDivElement | null>,
  onDrop: (from: string, to: string | null) => void,
) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const beginDrag = useCallback(
    (from: string, piece: Piece, event: ReactPointerEvent) => {
      const rect = boardRef.current?.getBoundingClientRect();
      setDrag({ from, piece, cell: rect ? rect.width / 8 : 0 });
      setPos({ x: event.clientX, y: event.clientY });
      event.preventDefault();
    },
    [boardRef],
  );

  const cancelDrag = useCallback(() => {
    setDrag(null);
    setPos(null);
  }, []);

  useEffect(() => {
    if (!drag) return;
    const onMove = (event: PointerEvent) => setPos({ x: event.clientX, y: event.clientY });
    const onUp = (event: PointerEvent) => {
      onDrop(drag.from, squareFromPoint(event.clientX, event.clientY));
      setDrag(null);
      setPos(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, onDrop]);

  return { drag, pos, beginDrag, cancelDrag };
}
