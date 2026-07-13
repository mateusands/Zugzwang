// Navegação por plies. `viewPly` indexa a lista de FENs de uma partida
// (0 = posição inicial; plyCount = sans.length = posição final).
//
// Dois modos compartilham estes helpers:
// - Replay de partida salva: viewPly é número puro, limitado por clampPly.
// - Partida ao vivo: `null` representa "no presente"; stepPly entra e sai
//   desse estado (avançar além do último ply volta ao vivo).

/** Keep a ply index within the valid range [0, plyCount]. */
export function clampPly(ply: number, plyCount: number): number {
  return Math.min(Math.max(ply, 0), plyCount);
}

/**
 * Step through a live game's history. `null` means "at the present".
 * Stepping back from the present shows the previous ply; stepping forward to
 * (or past) the latest position returns to the present.
 */
export function stepPly(viewPly: number | null, delta: number, plyCount: number): number | null {
  if (viewPly === null) {
    if (delta >= 0 || plyCount === 0) return null;
    return clampPly(plyCount + delta, plyCount);
  }
  const next = viewPly + delta;
  if (next >= plyCount) return null;
  return clampPly(next, plyCount);
}

export interface MoveRow {
  number: number;
  white: string;
  whitePly: number;
  black: string | null;
  blackPly: number | null;
}

/** Group SAN moves into numbered white/black pairs for the move list. */
export function moveRows(sans: string[]): MoveRow[] {
  const rows: MoveRow[] = [];
  for (let i = 0; i < sans.length; i += 2) {
    const white = sans[i];
    if (white === undefined) break;
    const black = sans[i + 1] ?? null;
    rows.push({
      number: i / 2 + 1,
      white,
      whitePly: i + 1,
      black,
      blackPly: black === null ? null : i + 2,
    });
  }
  return rows;
}
