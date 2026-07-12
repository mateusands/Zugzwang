@echo off
REM Zugzwang — sobe engine + server + web em modo dev (Windows).
REM Instala as dependencias automaticamente na primeira execucao.

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [erro] pnpm nao encontrado. Instale com:  npm install -g pnpm
  exit /b 1
)

if not exist "node_modules" (
  echo [setup] Instalando dependencias...
  call pnpm install
  if errorlevel 1 exit /b 1
)

echo [dev] Subindo engine + server + web...
echo   - Web:    http://localhost:5173
echo   - Server: http://localhost:3000/health
call pnpm dev
