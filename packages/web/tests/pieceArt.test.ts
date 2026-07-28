import { describe, expect, it } from 'vitest';
import { PIECE_TYPES, pieceArt } from '../src/pieceArt.js';
import type { PieceColor } from '../src/api.js';

/**
 * Spec: as peças passam a ser desenhadas em SVG (conjunto Cburnett,
 * vendorizado em `pieceArt.ts`) no lugar dos glifos Unicode, que ficavam
 * chapados e dependiam da fonte instalada na máquina do jogador.
 *
 * A arte é dado puro — string de marcação — para o componente só embutir. O
 * `viewBox` de todas é 0 0 45 45, o do conjunto original.
 */

const COLORS: PieceColor[] = ['white', 'black'];

describe('pieceArt', () => {
  it('deve ter arte própria para cada uma das 12 combinações de tipo e cor', () => {
    const arts = COLORS.flatMap((color) => PIECE_TYPES.map((type) => pieceArt(type, color)));

    expect(arts).toHaveLength(12);
    expect(arts.every((art) => art.length > 0)).toBe(true);
    expect(new Set(arts).size).toBe(12);
  });

  it('deve desenhar o rei branco claro e o preto escuro', () => {
    expect(pieceArt('k', 'white')).toContain('#fff');
    expect(pieceArt('k', 'black')).toContain('#000');
  });

  it('não deve referenciar nenhum recurso externo', () => {
    const arts = COLORS.flatMap((color) => PIECE_TYPES.map((type) => pieceArt(type, color)));

    for (const art of arts) {
      expect(art).not.toMatch(/https?:\/\//);
      expect(art).not.toMatch(/<(script|image|use)\b/);
    }
  });
});
