import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { ChessEngine, IllegalMoveError, findBestMove, renderBoard } from '../src/index.js';

/**
 * CLI simples para jogar contra o bot no terminal (você joga de brancas).
 *
 * Uso: `pnpm --filter @zugzwang/engine play`
 * Profundidade da busca via env `BOT_DEPTH` (padrão 3).
 *
 * É apenas glue de I/O sobre funções já testadas do engine — sem lógica de
 * xadrez própria.
 */

const DEPTH = Number(process.env.BOT_DEPTH ?? 3);

function describeResult(engine: ChessEngine): string {
  if (engine.isCheckmate()) return `xeque-mate — ${engine.winner()} vence`;
  if (engine.isStalemate()) return 'afogamento (empate)';
  if (engine.isDraw()) return 'empate';
  return 'partida encerrada';
}

async function main(): Promise<void> {
  const engine = new ChessEngine();
  const rl = createInterface({ input, output });

  console.log('Zugzwang — você joga de brancas contra o bot (profundidade ' + DEPTH + ').');
  console.log('Digite lances em notação algébrica (ex.: e4, Nf3, O-O). "sair" encerra.\n');

  while (!engine.isGameOver()) {
    console.log(renderBoard(engine) + '\n');

    if (engine.turn === 'white') {
      const answer = (await rl.question('Seu lance: ')).trim();
      if (answer === 'sair' || answer === 'quit') break;
      try {
        engine.move(answer);
      } catch (error) {
        if (error instanceof IllegalMoveError) {
          console.log(`Lance ilegal. Legais: ${engine.legalMoves().join(', ')}\n`);
        } else {
          throw error;
        }
      }
    } else {
      const best = findBestMove(engine, DEPTH);
      if (!best) break;
      engine.move(best.san);
      console.log(`Bot joga: ${best.san}\n`);
    }
  }

  console.log(renderBoard(engine));
  console.log(`\nFim: ${describeResult(engine)}`);
  rl.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
