import { describe, expect, it } from 'vitest';
import { pickSound } from '../src/sounds.js';

describe('pickSound', () => {
  it('escolhe o som pela prioridade: mate > xeque > captura > lance', () => {
    expect(pickSound('checkmate', false)).toBe('checkmate');
    // Xeque tem prioridade sobre captura.
    expect(pickSound('check', true)).toBe('check');
    expect(pickSound('in_progress', true)).toBe('capture');
    expect(pickSound('in_progress', false)).toBe('move');
  });
});
