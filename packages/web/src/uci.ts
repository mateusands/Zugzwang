// Protocolo UCI (Stockfish) em funções puras — montar comandos e parsear as
// linhas de resposta. O score bruto do Stockfish é do ponto de vista do LADO
// A MOVER; aqui tudo é normalizado para o ponto de vista das BRANCAS
// (+ favorece brancas), a mesma convenção do engine do projeto.

export type EngineColor = 'white' | 'black';

/** Avaliação já normalizada para o ponto de vista das brancas. */
export type Score =
  | { type: 'cp'; value: number }
  | {
      type: 'mate';
      /** Lances até o mate; 0 = mate na mesa. */
      movesToMate: number;
      winner: EngineColor;
    };

export interface InfoEvaluation {
  depth: number;
  score: Score;
  /** Linha principal em lances UCI; pv[0] é o melhor lance. */
  pv: string[];
}

/** Lado a mover segundo o segundo campo do FEN. */
export function turnOfFen(fen: string): EngineColor {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

function opponent(color: EngineColor): EngineColor {
  return color === 'white' ? 'black' : 'white';
}

/**
 * Parse a linha `info …` do Stockfish. Devolve null quando a linha não traz
 * uma avaliação utilizável: sem score/depth, multipv secundário, ou score de
 * limite de janela (lowerbound/upperbound). `turn` é o lado a mover da
 * posição buscada — o resultado sai normalizado para as brancas.
 */
export function parseInfoLine(line: string, turn: EngineColor): InfoEvaluation | null {
  const tokens = line.split(/\s+/);
  if (tokens[0] !== 'info') return null;
  if (tokens.includes('lowerbound') || tokens.includes('upperbound')) return null;

  let depth: number | null = null;
  let score: Score | null = null;
  let pv: string[] = [];

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === 'depth') {
      depth = Number(tokens[i + 1]);
    } else if (token === 'multipv' && Number(tokens[i + 1]) !== 1) {
      return null;
    } else if (token === 'score') {
      const kind = tokens[i + 1];
      const raw = Number(tokens[i + 2]);
      if (!Number.isFinite(raw)) return null;
      if (kind === 'cp') {
        score = { type: 'cp', value: turn === 'white' ? raw : -raw };
      } else if (kind === 'mate') {
        // mate N > 0: o lado a mover mata; N <= 0: o lado a mover é matado
        // (mate 0 = já está em mate). O vencedor fica explícito.
        const winner = raw > 0 ? turn : opponent(turn);
        score = { type: 'mate', movesToMate: Math.abs(raw), winner };
      } else {
        return null;
      }
    } else if (token === 'pv') {
      pv = tokens.slice(i + 1);
      break; // pv é sempre o último campo
    }
  }

  if (depth === null || !Number.isFinite(depth) || score === null) return null;
  return { depth, score, pv };
}

/**
 * Parse a linha `bestmove …`: o lance em notação UCI, null para posição
 * terminal (`bestmove (none)`), ou undefined se a linha não é um bestmove.
 */
export function parseBestMove(line: string): string | null | undefined {
  const match = /^bestmove\s+(\S+)/.exec(line);
  if (!match) return undefined;
  return match[1] === '(none)' ? null : (match[1] ?? null);
}

export function positionCommand(fen: string): string {
  return `position fen ${fen}`;
}

export function goCommand(options: { depth: number } | { movetime: number }): string {
  return 'depth' in options ? `go depth ${options.depth}` : `go movetime ${options.movetime}`;
}

/** Nomes dos scripts do engine em /engine/, gerados pelo copy-engine.mjs. */
export interface EngineManifest {
  mt: string;
  st: string;
}

/** Valida o manifest (input externo): qualquer coisa fora do shape → null. */
export function parseEngineManifest(raw: string): EngineManifest | null {
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; mt?: unknown; st?: unknown } | null;
    if (
      parsed === null ||
      parsed.v !== 1 ||
      typeof parsed.mt !== 'string' ||
      typeof parsed.st !== 'string'
    ) {
      return null;
    }
    return { mt: parsed.mt, st: parsed.st };
  } catch {
    return null;
  }
}

/** Multi-thread exige SharedArrayBuffer (página cross-origin isolated). */
export function chooseEngineFlavor(crossOriginIsolated: boolean): 'mt' | 'st' {
  return crossOriginIsolated ? 'mt' : 'st';
}

/** Threads da busca: reserva um núcleo para a UI e limita a 4. */
export function threadCount(hardwareConcurrency: number | undefined): number {
  const cores = hardwareConcurrency ?? 2;
  return Math.min(Math.max(cores - 1, 1), 4);
}
