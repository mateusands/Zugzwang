#!/usr/bin/env bash
# Zugzwang — menu de inicializacao (macOS / Linux).
# Instala as dependencias automaticamente na primeira execucao.
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[erro] pnpm nao encontrado. Instale com:  npm install -g pnpm"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "[setup] Instalando dependencias..."
  pnpm install
fi

echo "Zugzwang"
echo "  1) Jogar contra o bot (terminal)"
echo "  2) Subir engine + server + web (modo dev)"
read -r -p "Escolha [1]: " choice

case "${choice:-1}" in
  2)
    echo "[dev] Subindo engine + server + web..."
    echo "  - Web:    http://localhost:5173"
    echo "  - Server: http://localhost:3000/health"
    pnpm dev
    ;;
  *)
    echo "[bot] Iniciando partida contra o bot..."
    pnpm --filter @zugzwang/engine play
    ;;
esac
