// `defineConfig` vem do vitest/config (e não do vite) para o bloco `test` ser
// tipado; para o build o comportamento é o mesmo.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Cross-origin isolation: habilita SharedArrayBuffer, exigido pelo Stockfish
// multi-thread. Sem estes headers a página cai no fallback single-thread.
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    headers: crossOriginIsolation,
    // Encaminha /api/* para o server Express (evita CORS em dev).
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  preview: {
    headers: crossOriginIsolation,
  },
  test: {
    // Reaponta `localStorage` para o jsdom quando o Node traz o global nativo
    // experimental (>= 26). Ver tests/setup.ts.
    setupFiles: ['./tests/setup.ts'],
  },
});
