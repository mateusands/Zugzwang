import { createInterface } from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  ChessEngine,
  IllegalMoveError,
  analyzeGame,
  chooseMove,
  renderBoard,
  type Difficulty,
} from '../src/index.js';

/**
 * CLI para jogar contra o bot no terminal (você joga de brancas).
 *
 * Uso: `pnpm --filter @zugzwang/engine play`
 *
 * É glue de I/O sobre funções já testadas do engine — sem lógica de xadrez
 * própria. As linhas são consumidas por um iterador assíncrono, que funciona
 * tanto no terminal quanto com entrada redirecionada.
 */

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];
const DEFAULT_SAVE_FILE = 'partida.pgn';

function describeResult(engine: ChessEngine): string {
  if (engine.isCheckmate()) return `xeque-mate — ${engine.winner()} vence`;
  if (engine.isStalemate()) return 'afogamento (empate)';
  if (engine.isDraw()) return 'empate';
  return 'partida encerrada';
}

function printHelp(): void {
  console.log(
    [
      'Comandos:',
      '  <lance>            joga em SAN (ex.: e4, Nf3, O-O)',
      '  desfazer           desfaz seu último lance e a resposta do bot',
      `  salvar [arquivo]   salva a partida em PGN (padrão ${DEFAULT_SAVE_FILE})`,
      '  carregar [arquivo] carrega uma partida de um PGN',
      '  analisar           analisa a partida e aponta erros',
      '  ajuda              mostra esta ajuda',
      '  sair               encerra',
    ].join('\n'),
  );
}

function printAnalysis(engine: ChessEngine): void {
  if (engine.history().length === 0) return;
  const blunders = analyzeGame(engine.pgn()).filter((entry) => entry.isBlunder);
  console.log('\n— Análise pós-jogo —');
  if (blunders.length === 0) {
    console.log('Nenhum erro grave detectado.');
    return;
  }
  for (const entry of blunders) {
    const dots = entry.color === 'white' ? '' : '... ';
    console.log(
      `  ${entry.moveNumber}. ${dots}${entry.san} (erro: -${entry.loss}cp; melhor era ${entry.best})`,
    );
  }
}

function renderAndPrompt(engine: ChessEngine): void {
  console.log('\n' + renderBoard(engine) + '\n');
  output.write('Seu lance: ');
}

/** Let the bot reply while it is Black to move and the game is running. */
function botReplies(engine: ChessEngine, difficulty: Difficulty): void {
  while (!engine.isGameOver() && engine.turn === 'black') {
    const best = chooseMove(engine, difficulty);
    if (!best) break;
    engine.move(best.san);
    console.log(`Bot joga: ${best.san}`);
  }
}

function applyCommand(engine: ChessEngine, line: string): void {
  const [command, argument] = line.split(/\s+/, 2);
  switch (command) {
    case 'ajuda':
      printHelp();
      return;
    case 'desfazer': {
      const bot = engine.undo();
      const you = engine.undo();
      console.log(you ? `Desfeitos: ${you}/${bot}` : 'Nada para desfazer.');
      return;
    }
    case 'salvar': {
      const file = argument ?? DEFAULT_SAVE_FILE;
      writeFileSync(file, engine.pgn(), 'utf8');
      console.log(`Partida salva em ${file}.`);
      return;
    }
    case 'carregar': {
      const file = argument ?? DEFAULT_SAVE_FILE;
      engine.loadPgn(readFileSync(file, 'utf8'));
      console.log(`Partida carregada de ${file}.`);
      return;
    }
    case 'analisar':
      printAnalysis(engine);
      return;
    default:
      try {
        engine.move(line);
      } catch (error) {
        if (error instanceof IllegalMoveError) {
          console.log(`Lance ilegal. Legais: ${engine.legalMoves().join(', ')}`);
        } else {
          throw error;
        }
      }
  }
}

async function main(): Promise<void> {
  const rl = createInterface({ input, output, terminal: false });
  const engine = new ChessEngine();
  let difficulty: Difficulty | null = null;

  output.write('Dificuldade (easy/medium/hard) [medium]: ');

  for await (const rawLine of rl) {
    const line = rawLine.trim();

    if (difficulty === null) {
      difficulty = DIFFICULTIES.find((level) => level === line.toLowerCase()) ?? 'medium';
      console.log(`\nVocê joga de brancas contra o bot (${difficulty}).`);
      printHelp();
      renderAndPrompt(engine);
      continue;
    }

    if (line === 'sair') break;

    applyCommand(engine, line);
    botReplies(engine, difficulty);

    if (engine.isGameOver()) break;
    renderAndPrompt(engine);
  }

  rl.close();
  console.log('\n' + renderBoard(engine));
  console.log(`\nFim: ${describeResult(engine)}`);
  printAnalysis(engine);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
