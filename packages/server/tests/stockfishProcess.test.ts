import { describe, expect, it } from 'vitest';
import {
  StockfishProcess,
  computeStockfishResources,
  type UciProcessTransport,
} from '../src/analysis/stockfishProcess.js';

const FEN = '8/8/8/8/8/8/4K3/7k b - - 0 1';

class FakeTransport implements UciProcessTransport {
  readonly commands: string[] = [];
  #line: ((line: string) => void) | null = null;
  #error: ((error: unknown) => void) | null = null;
  #exit: ((code: number | null) => void) | null = null;

  write(command: string): void {
    this.commands.push(command);
  }

  onLine(listener: (line: string) => void): void {
    this.#line = listener;
  }

  onError(listener: (error: unknown) => void): void {
    this.#error = listener;
  }

  onExit(listener: (code: number | null) => void): void {
    this.#exit = listener;
  }

  kill(): void {}

  emit(line: string): void {
    this.#line?.(line);
  }

  fail(error: unknown): void {
    this.#error?.(error);
  }

  exit(code: number | null): void {
    this.#exit?.(code);
  }
}

async function readyProcess() {
  const transport = new FakeTransport();
  const process = new StockfishProcess(transport, {
    engine: 'stockfish-test',
    threads: 3,
    hashMb: 256,
  });
  const initializing = process.init();
  expect(transport.commands).toEqual(['uci']);
  transport.emit('uciok');
  expect(transport.commands).toContain('setoption name Threads value 3');
  expect(transport.commands).toContain('setoption name Hash value 256');
  expect(transport.commands).toContain('setoption name UCI_ShowWDL value true');
  expect(transport.commands.at(-1)).toBe('isready');
  transport.emit('readyok');
  await initializing;
  return { process, transport };
}

describe('StockfishProcess', () => {
  it('returns two normalized lines with search quality metadata', async () => {
    const { process, transport } = await readyProcess();

    const pending = process.analyze(
      { key: '0', fen: FEN, multiPv: 2 },
      { depth: 22, multiPv: 2 },
      new AbortController().signal,
    );
    expect(transport.commands.slice(-3)).toEqual([
      'setoption name MultiPV value 2',
      `position fen ${FEN}`,
      'go depth 22',
    ]);
    transport.emit(
      'info depth 22 multipv 2 score cp 10 wdl 400 300 300 nodes 8000 nps 400000 time 20 pv h1g1',
    );
    transport.emit(
      'info depth 22 multipv 1 score cp 40 wdl 600 250 150 nodes 10000 nps 500000 time 20 pv h1g2',
    );
    transport.emit('bestmove h1g2');

    await expect(pending).resolves.toMatchObject({
      score: { type: 'cp', value: -40 },
      winPercent: 27.5,
      bestMove: 'h1g2',
      depth: 22,
      nodes: 10000,
      timeMs: 20,
      nps: 500000,
      secondLine: {
        score: { type: 'cp', value: -10 },
        winPercent: 45,
        bestMove: 'h1g1',
        depth: 22,
      },
    });
  });

  it('sends stop on abort and rejects only after the stale bestmove arrives', async () => {
    const { process, transport } = await readyProcess();
    const controller = new AbortController();
    let settled = false;
    const pending = process
      .analyze({ key: '0', fen: FEN, multiPv: 1 }, { depth: 26, multiPv: 1 }, controller.signal)
      .finally(() => {
        settled = true;
      });

    controller.abort();
    expect(transport.commands.at(-1)).toBe('stop');
    await Promise.resolve();
    expect(settled).toBe(false);
    transport.emit('bestmove h1g1');

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('Stockfish resource budget', () => {
  it('reserves one CPU and divides threads/hash across the pool', () => {
    expect(computeStockfishResources(8, { poolSize: 2, totalHashMb: 512 })).toEqual({
      poolSize: 2,
      threadsPerEngine: 3,
      hashMbPerEngine: 256,
    });
  });

  it('never creates more workers than the available CPU budget', () => {
    expect(computeStockfishResources(2, { poolSize: 8, totalHashMb: 128 })).toEqual({
      poolSize: 1,
      threadsPerEngine: 1,
      hashMbPerEngine: 128,
    });
  });
});
