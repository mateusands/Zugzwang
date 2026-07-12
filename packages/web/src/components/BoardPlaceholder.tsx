/**
 * A static 8x8 board used as a visual placeholder. No game logic yet — the
 * interactive board will be wired to `@zugzwang/engine` in a later phase.
 */
const FILES = 8;
const RANKS = 8;

export function BoardPlaceholder() {
  const squares = Array.from({ length: FILES * RANKS }, (_, index) => {
    const file = index % FILES;
    const rank = Math.floor(index / FILES);
    const isLight = (file + rank) % 2 === 0;
    return { index, isLight };
  });

  return (
    <div className="board" role="img" aria-label="Tabuleiro de xadrez (placeholder)">
      {squares.map(({ index, isLight }) => (
        <div key={index} className={`board__square board__square--${isLight ? 'light' : 'dark'}`} />
      ))}
    </div>
  );
}
