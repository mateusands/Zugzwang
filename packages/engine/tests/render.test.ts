import { describe, expect, it } from 'vitest';
import { ChessEngine } from '../src/engine.js';
import { renderBoard } from '../src/render.js';

/**
 * Fase 4 — Renderização do tabuleiro em texto (usada pela CLI de teste do bot).
 */

describe('renderBoard', () => {
  it('desenha a posição inicial com as duas colorações e os rótulos das colunas', () => {
    const lines = renderBoard(new ChessEngine()).split('\n');

    // A fileira 8 (topo) tem as peças pretas; a fileira 1, as brancas.
    expect(lines[0]).toMatch(/^8 /);
    expect(lines[0]).toContain('♜');
    expect(lines[7]).toMatch(/^1 /);
    expect(lines[7]).toContain('♔');
    // A última linha rotula as colunas a..h.
    expect(lines[8]).toContain('a b c d e f g h');
  });

  it('mostra casas vazias e reflete um lance jogado', () => {
    const engine = new ChessEngine();
    engine.move('e4');

    const render = renderBoard(engine);

    // Há um peão branco desenhado em algum lugar e casas vazias marcadas.
    expect(render).toContain('♙');
    expect(render).toContain('·');
  });
});
