import { describe, expect, it } from 'vitest';
import { bookPlyCount } from '../src/openingBook.js';

describe('bookPlyCount', () => {
  it('reconhece uma linha conhecida lance a lance', () => {
    expect(bookPlyCount(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'])).toBe(5);
  });

  it('encerra o livro na divergência e não volta depois', () => {
    expect(bookPlyCount(['e4', 'e5', 'Nh3', 'Nc6', 'Bb5'])).toBe(2);
  });

  it('devolve zero para uma partida fora do dataset', () => {
    expect(bookPlyCount(['a3', 'a6', 'h3'])).toBe(0);
  });
});
