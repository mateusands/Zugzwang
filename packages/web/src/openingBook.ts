/**
 * Pequeno repertório curado de linhas populares. O objetivo não é substituir
 * uma base de aberturas, apenas reconhecer o trecho teórico mais comum no MVP.
 */
const OPENING_LINES: readonly (readonly string[])[] = [
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'],
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4', 'exd4'],
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Na5'],
  ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'],
  ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'g6', 'Nc3', 'Bg7'],
  ['e4', 'c5', 'Nf3', 'e6', 'd4', 'cxd4', 'Nxd4', 'Nc6', 'Nc3', 'Qc7'],
  ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6', 'e5', 'Nfd7', 'f4', 'c5'],
  ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5', 'Ng3', 'Bg6'],
  ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qd8', 'd4', 'Nf6'],
  ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O'],
  ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'dxc4', 'a4', 'Bf5'],
  ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O'],
  ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4', 'e3', 'O-O', 'Bd3', 'd5'],
  ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'd5', 'g3', 'Be7', 'Bg2', 'O-O'],
  ['c4', 'e5', 'Nc3', 'Nf6', 'Nf3', 'Nc6', 'g3', 'Bb4', 'Bg2', 'O-O'],
  ['Nf3', 'd5', 'g3', 'Nf6', 'Bg2', 'g6', 'O-O', 'Bg7', 'd3', 'O-O'],
  ['e4', 'e5', 'f4', 'exf4', 'Nf3', 'g5', 'h4', 'g4'],
  ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6', 'Be3', 'Bg7', 'Qd2', 'c6'],
] as const;

export function bookPlyCount(sans: string[]): number {
  let count = 0;
  for (let ply = 0; ply < sans.length; ply += 1) {
    const prefix = sans.slice(0, ply + 1);
    const matches = OPENING_LINES.some(
      (line) => prefix.length <= line.length && prefix.every((san, index) => line[index] === san),
    );
    if (!matches) break;
    count = ply + 1;
  }
  return count;
}
