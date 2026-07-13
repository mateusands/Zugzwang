import { useEffect, useRef, useState } from 'react';
import { chooseEngineFlavor, parseEngineManifest, threadCount } from './uci.js';
import {
  createWorkerTransport,
  EvaluationCancelledError,
  StockfishClient,
  type Evaluation,
} from './stockfishClient.js';

// Hook da barra de avaliação. O Stockfish é um Worker pesado (~7 MB), então
// há uma única instância compartilhada (singleton de módulo), criada de forma
// preguiçosa no primeiro uso e nunca encerrada — isso resolve o StrictMode
// (o hook só assina) e a coexistência jogo-ao-vivo/replay (nunca renderizam
// juntos, mas dividiriam o mesmo motor de qualquer forma).

const SEARCH_DEPTH = 18;
const DEBOUNCE_MS = 200;

let enginePromise: Promise<StockfishClient> | null = null;

function getSharedEngine(): Promise<StockfishClient> {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const response = await fetch('/engine/manifest.json');
    const manifest = parseEngineManifest(await response.text());
    if (!manifest) throw new Error('manifest do engine inválido');
    const flavor = chooseEngineFlavor(globalThis.crossOriginIsolated === true);
    const file = flavor === 'mt' ? manifest.mt : manifest.st;
    const transport = createWorkerTransport(`/engine/${file}`);
    const threads = flavor === 'mt' ? threadCount(navigator.hardwareConcurrency) : 1;
    const client = new StockfishClient(transport, { threads, depth: SEARCH_DEPTH });
    await client.init();
    return client;
  })();
  return enginePromise;
}

export interface UseEvaluationResult {
  ready: boolean;
  thinking: boolean;
  evaluation: Evaluation | null;
  error: boolean;
}

/**
 * Avalia continuamente a posição `fen`. `enabled=false` ou `fen=null` deixa o
 * hook inerte — o Worker só é criado quando avaliar é habilitado pela 1ª vez.
 */
export function useEvaluation(fen: string | null, enabled: boolean): UseEvaluationResult {
  const [ready, setReady] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [error, setError] = useState(false);
  const clientRef = useRef<StockfishClient | null>(null);

  // Bootstrap preguiçoso: só liga o motor quando avaliar é habilitado.
  useEffect(() => {
    if (!enabled || clientRef.current) return;
    let cancelled = false;
    getSharedEngine()
      .then((client) => {
        if (cancelled) return;
        clientRef.current = client;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // Ao desligar, a barra volta ao neutro.
  useEffect(() => {
    if (!enabled) setEvaluation(null);
  }, [enabled]);

  // Avalia o FEN atual, com debounce para a navegação rápida do histórico.
  useEffect(() => {
    const client = clientRef.current;
    if (!enabled || !ready || !fen || !client) {
      setThinking(false);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      setThinking(true);
      client
        .evaluate(fen, {
          onProgress: (partial) => {
            if (active) setEvaluation(partial);
          },
        })
        .then((final) => {
          if (active && final) setEvaluation(final);
        })
        .catch((err: unknown) => {
          if (err instanceof EvaluationCancelledError) return;
          if (active) setError(true);
        })
        .finally(() => {
          if (active) setThinking(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [fen, enabled, ready]);

  return { ready, thinking, evaluation, error };
}
