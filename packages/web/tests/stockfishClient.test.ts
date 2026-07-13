import { describe, expect, it, vi } from 'vitest';
import {
  EvaluationCancelledError,
  StockfishClient,
  type EngineTransport,
} from '../src/stockfishClient.js';

/**
 * Fase 9 — Cliente do Stockfish sobre um transporte injetável.
 *
 * O transporte real é um Web Worker; nos testes usamos um fake que registra
 * os comandos enviados e permite emitir linhas UCI na mão. Assim toda a
 * lógica (handshake, streaming, cancelamento) é testável em node, sem Worker.
 */

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const BLACK_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

interface FakeTransport extends EngineTransport {
  sent: string[];
  emit(line: string): void;
  fail(error: unknown): void;
}

function fakeTransport(): FakeTransport {
  let lineListener: ((line: string) => void) | null = null;
  let errorListener: ((error: unknown) => void) | null = null;
  return {
    sent: [],
    postMessage(command) {
      this.sent.push(command);
    },
    onLine(listener) {
      lineListener = listener;
    },
    onError(listener) {
      errorListener = listener;
    },
    terminate: vi.fn(),
    emit(line) {
      lineListener?.(line);
    },
    fail(error) {
      errorListener?.(error);
    },
  };
}

/** Cliente já inicializado, pronto para avaliar. */
async function readyClient(options?: { threads?: number; depth?: number }) {
  const transport = fakeTransport();
  const client = new StockfishClient(transport, {
    threads: options?.threads ?? 1,
    depth: options?.depth ?? 18,
  });
  const init = client.init();
  transport.emit('uciok');
  transport.emit('readyok');
  await init;
  transport.sent.length = 0; // descarta os comandos do handshake
  return { transport, client };
}

describe('StockfishClient — handshake', () => {
  it('faz o handshake UCI e resolve quando o motor está pronto', async () => {
    const transport = fakeTransport();
    const client = new StockfishClient(transport, { threads: 1, depth: 18 });

    const init = client.init();
    expect(transport.sent).toContain('uci');

    transport.emit('uciok');
    transport.emit('readyok');
    await expect(init).resolves.toBeUndefined();

    // Single-thread não configura threads.
    expect(transport.sent).not.toContain('setoption name Threads value 1');
  });

  it('configura as threads quando há mais de uma', async () => {
    const transport = fakeTransport();
    const client = new StockfishClient(transport, { threads: 3, depth: 18 });

    const init = client.init();
    transport.emit('uciok');
    expect(transport.sent).toContain('setoption name Threads value 3');
    transport.emit('readyok');
    await init;
  });

  it('init é idempotente: chamadas repetidas compartilham o mesmo handshake', async () => {
    const transport = fakeTransport();
    const client = new StockfishClient(transport, { threads: 1, depth: 18 });

    const a = client.init();
    const b = client.init();
    transport.emit('uciok');
    transport.emit('readyok');

    await Promise.all([a, b]);
    expect(transport.sent.filter((c) => c === 'uci')).toHaveLength(1);
  });
});

describe('StockfishClient — avaliação', () => {
  it('envia position e go e resolve com a última avaliação no bestmove', async () => {
    const { transport, client } = await readyClient({ depth: 18 });
    const onProgress = vi.fn();

    const promise = client.evaluate(START_FEN, { onProgress });
    expect(transport.sent).toEqual([`position fen ${START_FEN}`, 'go depth 18']);

    transport.emit('info depth 8 multipv 1 score cp 20 pv e2e4');
    transport.emit('info depth 12 multipv 1 score cp 35 pv e2e4 e7e5');
    transport.emit('bestmove e2e4 ponder e7e5');

    const result = await promise;
    expect(result).toEqual({
      score: { type: 'cp', value: 35 },
      winPercent: expect.any(Number),
      bestMove: 'e2e4',
      depth: 12,
    });
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('normaliza o score para as brancas a partir do turno do FEN', async () => {
    const { transport, client } = await readyClient();

    const promise = client.evaluate(BLACK_FEN);
    transport.emit('info depth 10 multipv 1 score cp 50 pv e7e5');
    transport.emit('bestmove e7e5');

    expect((await promise)?.score).toEqual({ type: 'cp', value: -50 });
  });

  it('resolve null quando não há nenhuma info válida antes do bestmove', async () => {
    const { transport, client } = await readyClient();

    const promise = client.evaluate(START_FEN);
    transport.emit('bestmove (none)');

    await expect(promise).resolves.toBeNull();
  });

  it('ignora linhas inválidas entre as avaliações', async () => {
    const { transport, client } = await readyClient();
    const onProgress = vi.fn();

    const promise = client.evaluate(START_FEN, { onProgress });
    transport.emit('info depth 8 currmove e2e4 currmovenumber 1');
    transport.emit('info depth 10 multipv 2 score cp 5 pv d2d4');
    transport.emit('Stockfish 17 by the Stockfish developers');
    transport.emit('info depth 12 multipv 1 score cp 30 pv e2e4');
    transport.emit('bestmove e2e4');

    await promise;
    expect(onProgress).toHaveBeenCalledTimes(1);
  });
});

describe('StockfishClient — cancelamento', () => {
  it('uma nova avaliação para a busca anterior e a rejeita como cancelada', async () => {
    const { transport, client } = await readyClient();

    const first = client.evaluate(START_FEN);
    transport.emit('info depth 6 multipv 1 score cp 10 pv e2e4');
    transport.sent.length = 0;

    const second = client.evaluate(BLACK_FEN);
    // Apenas o stop foi enviado; a nova posição ainda não.
    expect(transport.sent).toEqual(['stop']);

    await expect(first).rejects.toBeInstanceOf(EvaluationCancelledError);

    // Só depois do bestmove obsoleto a nova busca começa.
    transport.emit('bestmove e2e4');
    expect(transport.sent).toEqual(['stop', `position fen ${BLACK_FEN}`, 'go depth 18']);

    transport.emit('info depth 9 multipv 1 score cp 15 pv e7e5');
    transport.emit('bestmove e7e5');
    expect((await second)?.bestMove).toBe('e7e5');
  });

  it('linhas obsoletas da busca cancelada não vazam para a nova', async () => {
    const { transport, client } = await readyClient();

    const first = client.evaluate(START_FEN);
    const second = client.evaluate(BLACK_FEN);
    void first.catch(() => undefined);

    const onProgress = vi.fn();
    void client; // second já está enfileirada; anexa progresso reavaliando abaixo

    // Emissões obsoletas (da busca A) chegam depois do stop, antes do bestmove.
    transport.emit('info depth 20 multipv 1 score cp 999 pv h2h4');
    transport.emit('bestmove e2e4'); // fecha a busca A → começa a B

    // A partir daqui é a busca B.
    void second;
    void onProgress;
    transport.emit('info depth 9 multipv 1 score cp 15 pv e7e5');
    transport.emit('bestmove e7e5');

    const result = await second;
    expect(result?.score).toEqual({ type: 'cp', value: -15 });
  });

  it('três avaliações rápidas: a do meio é descartada sem nunca enviar comandos', async () => {
    const { transport, client } = await readyClient();

    const a = client.evaluate(START_FEN);
    const b = client.evaluate(BLACK_FEN);
    const c = client.evaluate(START_FEN);
    void a.catch(() => undefined);

    await expect(b).rejects.toBeInstanceOf(EvaluationCancelledError);

    transport.sent.length = 0;
    transport.emit('bestmove e2e4'); // fecha A → começa C (não B)
    expect(transport.sent).toEqual([`position fen ${START_FEN}`, 'go depth 18']);

    transport.emit('info depth 9 multipv 1 score cp 40 pv e2e4');
    transport.emit('bestmove e2e4');
    expect((await c)?.score).toEqual({ type: 'cp', value: 40 });
  });
});

describe('StockfishClient — erros e dispose', () => {
  it('erro do transporte durante o handshake rejeita o init', async () => {
    const transport = fakeTransport();
    const client = new StockfishClient(transport, { threads: 1, depth: 18 });

    const init = client.init();
    transport.fail(new Error('worker morreu'));

    await expect(init).rejects.toThrow('worker morreu');
  });

  it('erro do transporte durante a avaliação rejeita a busca (não como cancelada)', async () => {
    const { transport, client } = await readyClient();

    const promise = client.evaluate(START_FEN);
    transport.fail(new Error('worker morreu'));

    await expect(promise).rejects.toThrow('worker morreu');
    await promise.catch((error) => expect(error).not.toBeInstanceOf(EvaluationCancelledError));
  });

  it('dispose encerra o transporte e rejeita a avaliação pendente', async () => {
    const { transport, client } = await readyClient();

    const promise = client.evaluate(START_FEN);
    client.dispose();

    expect(transport.terminate).toHaveBeenCalled();
    await expect(promise).rejects.toBeInstanceOf(EvaluationCancelledError);
  });
});
