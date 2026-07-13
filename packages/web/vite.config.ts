import { defineConfig } from 'vite';
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
});
