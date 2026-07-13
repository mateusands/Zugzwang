import type { EngineColor, Score } from './types.js';

export interface InfoEvaluation {
  depth: number;
  multiPv: number;
  score: Score;
  wdl?: { white: number; draw: number; black: number };
  nodes: number;
  nps: number;
  timeMs: number;
  pv: string[];
}

export function turnOfFen(fen: string): EngineColor {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

function opponent(color: EngineColor): EngineColor {
  return color === 'white' ? 'black' : 'white';
}

function numericToken(tokens: string[], index: number): number | null {
  const value = Number(tokens[index]);
  return Number.isFinite(value) ? value : null;
}

/** Parses a useful exact UCI info line and normalizes it to White's view. */
export function parseInfoLine(line: string, turn: EngineColor): InfoEvaluation | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== 'info') return null;
  if (tokens.includes('lowerbound') || tokens.includes('upperbound')) return null;

  let depth: number | null = null;
  let multiPv = 1;
  let score: Score | null = null;
  let wdl: InfoEvaluation['wdl'];
  let nodes = 0;
  let nps = 0;
  let timeMs = 0;
  let pv: string[] = [];

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === 'depth') {
      depth = numericToken(tokens, index + 1);
    } else if (token === 'multipv') {
      multiPv = numericToken(tokens, index + 1) ?? 0;
    } else if (token === 'score') {
      const kind = tokens[index + 1];
      const raw = numericToken(tokens, index + 2);
      if (raw === null) return null;
      if (kind === 'cp') {
        score = { type: 'cp', value: turn === 'white' ? raw : -raw };
      } else if (kind === 'mate') {
        score = {
          type: 'mate',
          movesToMate: Math.abs(raw),
          winner: raw > 0 ? turn : opponent(turn),
        };
      } else {
        return null;
      }
    } else if (token === 'wdl') {
      const win = numericToken(tokens, index + 1);
      const draw = numericToken(tokens, index + 2);
      const loss = numericToken(tokens, index + 3);
      if (win === null || draw === null || loss === null) return null;
      wdl =
        turn === 'white' ? { white: win, draw, black: loss } : { white: loss, draw, black: win };
    } else if (token === 'nodes') {
      nodes = numericToken(tokens, index + 1) ?? 0;
    } else if (token === 'nps') {
      nps = numericToken(tokens, index + 1) ?? 0;
    } else if (token === 'time') {
      timeMs = numericToken(tokens, index + 1) ?? 0;
    } else if (token === 'pv') {
      pv = tokens.slice(index + 1);
      break;
    }
  }

  if (
    depth === null ||
    !Number.isInteger(depth) ||
    !Number.isInteger(multiPv) ||
    multiPv < 1 ||
    score === null
  ) {
    return null;
  }

  return {
    depth,
    multiPv,
    score,
    ...(wdl ? { wdl } : {}),
    nodes,
    nps,
    timeMs,
    pv,
  };
}

export function parseBestMove(line: string): string | null | undefined {
  const match = /^bestmove\s+(\S+)/.exec(line);
  if (!match) return undefined;
  return match[1] === '(none)' ? null : (match[1] ?? null);
}

export function winPercent(score: Score): number {
  if (score.type === 'mate') return score.winner === 'white' ? 100 : 0;
  const cp = Math.min(Math.max(score.value, -1000), 1000);
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}
