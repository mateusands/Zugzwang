import { describe, expect, it } from 'vitest';
import { gameOutcome } from '../src/outcome.js';

describe('gameOutcome', () => {
  it('vitória do jogador por xeque-mate', () => {
    expect(gameOutcome('checkmate', 'white', false)).toMatchObject({
      kind: 'win',
      reason: 'por xeque-mate',
    });
  });

  it('derrota do jogador por xeque-mate', () => {
    expect(gameOutcome('checkmate', 'black', false).kind).toBe('loss');
  });

  it('afogamento é empate', () => {
    expect(gameOutcome('stalemate', null, false)).toMatchObject({
      kind: 'draw',
      reason: 'por afogamento',
    });
  });

  it('empate genérico', () => {
    expect(gameOutcome('draw', null, false).kind).toBe('draw');
  });

  it('desistência conta como derrota, independentemente do status', () => {
    expect(gameOutcome('in_progress', null, true)).toMatchObject({
      kind: 'loss',
      reason: 'por desistência',
    });
  });
});
