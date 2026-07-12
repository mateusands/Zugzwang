@echo off
REM Zugzwang — menu de inicializacao (Windows).
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

echo Zugzwang
echo   1) Jogar contra o bot (terminal)
echo   2) Subir engine + server + web (modo dev)
set "choice=1"
set /p "choice=Escolha [1]: "

if "%choice%"=="2" (
  echo [dev] Subindo engine + server + web...
  echo   - Web:    http://localhost:5173
  echo   - Server: http://localhost:3000/health
  call pnpm dev
) else (
  echo [bot] Iniciando partida contra o bot...
  call pnpm --filter @zugzwang/engine play
)
