import { FILES } from './board.js';

/** Uma seta desenhada pelo usuário: o caminho de casas percorrido pelo mouse. */
export interface Arrow {
  path: string[];
  /** Setas do usuário usam annotation; sugestões do motor usam best. */
  tone?: 'annotation' | 'best';
}

export interface Annotations {
  arrows: Arrow[];
  highlights: string[];
}

export const EMPTY_ANNOTATIONS: Annotations = { arrows: [], highlights: [] };

/** Toggle a square highlight (right-click on a square). */
export function toggleHighlight(highlights: string[], square: string): string[] {
  return highlights.includes(square)
    ? highlights.filter((current) => current !== square)
    : [...highlights, square];
}

/**
 * Toggle an arrow identified by its start/end squares (right-click drag).
 * Drawing again between the same two squares removes the arrow, regardless of
 * the path taken; direction matters.
 */
export function toggleArrow(arrows: Arrow[], path: string[]): Arrow[] {
  const from = path[0];
  const to = path[path.length - 1];
  const sameEnds = (arrow: Arrow) =>
    arrow.path[0] === from && arrow.path[arrow.path.length - 1] === to;
  return arrows.some(sameEnds) ? arrows.filter((arrow) => !sameEnds(arrow)) : [...arrows, { path }];
}

function fileIndex(square: string): number {
  return FILES.indexOf(square[0] as (typeof FILES)[number]);
}

function renderRow(square: string): number {
  return 8 - Number(square[1]); // rank 8 → row 0 (top)
}

/** Centre of a square in an 8x8 coordinate space (for the SVG overlay). */
export function squareCenter(square: string): { x: number; y: number } {
  return { x: fileIndex(square) + 0.5, y: renderRow(square) + 0.5 };
}

interface Point {
  x: number;
  y: number;
}

/** Remove pontos intermediários colineares (mantém só as dobras). */
function collapseCollinear(points: Point[]): Point[] {
  return points.filter((point, index) => {
    if (index === 0 || index === points.length - 1) return true;
    const prev = points[index - 1] as Point;
    const next = points[index + 1] as Point;
    // Produto vetorial zero = os três pontos estão alinhados.
    const cross = (point.x - prev.x) * (next.y - prev.y) - (point.y - prev.y) * (next.x - prev.x);
    return cross !== 0;
  });
}

/**
 * Polyline of an arrow, in the 8x8 space: follows the squares the mouse
 * travelled through (only the bends are kept). A direct two-square knight jump
 * (no intermediate squares) bends in the classic L — long leg first.
 */
export function arrowPolyline(path: string[]): Point[] {
  const squares = path.filter((square, index) => index === 0 || square !== path[index - 1]);

  if (squares.length === 2) {
    const [from, to] = squares as [string, string];
    const start = squareCenter(from);
    const end = squareCenter(to);
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    const isKnight = (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
    if (isKnight) {
      const corner = dx > dy ? { x: end.x, y: start.y } : { x: start.x, y: end.y };
      return [start, corner, end];
    }
    return [start, end];
  }

  return collapseCollinear(squares.map(squareCenter));
}
