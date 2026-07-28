// Parte do UCI que só existe no navegador: montar comandos e descobrir qual
// build do Stockfish/WASM carregar.
//
// O CONTRATO do protocolo — `parseInfoLine`, `parseBestMove`, `turnOfFen` e os
// tipos `Score`/`EngineColor`/`InfoEvaluation` — mora em `@zugzwang/analysis`,
// que é a fonte da verdade compartilhada com o server. Importe de lá; não
// reimplemente aqui, ou o motor nativo e o do navegador voltam a divergir.

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
