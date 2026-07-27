---
name: rodar-local
description: Subir o Zugzwang localmente (monorepo pnpm — engine, analysis, server 3000, web 5173) e as pegadinhas que custam tempo (binários do Stockfish copiados no prebuild, isolamento cross-origin, Node 26 nos testes). Use ao rodar, testar manualmente ou debugar o ambiente.
---

# Rodar o Zugzwang localmente

## Pré-requisitos

- **Node >= 20** e **pnpm >= 9** (o `packageManager` fixa `pnpm@11.1.0`; o pnpm baixa a versão certa sozinho).
- Nada além disso — **não há banco, Redis, Docker nem serviço externo**. O estado do server é em memória.

```bash
pnpm install
```

## Subir tudo

```bash
pnpm dev          # todos os pacotes em watch, em paralelo
```

Ou por pacote, quando quiser isolar:

```bash
pnpm --filter @zugzwang/server dev    # API Express — porta 3000 (tsx watch)
pnpm --filter @zugzwang/web dev       # Vite — porta 5173
pnpm --filter @zugzwang/engine play   # jogar contra o bot no terminal, sem navegador
```

Jogar no navegador: `pnpm dev` e abra `http://localhost:5173`.

## Pegadinhas (as que mais custam tempo)

- **`public/engine/` vazio → o motor não carrega.** Os binários do Stockfish não estão no git; o
  `scripts/copy-engine.mjs` roda nos hooks `predev`/`prebuild` e copia `stockfish-18-lite{,-single}.js/.wasm`
  para `public/engine/`. Se você rodou `vite` direto em vez de `pnpm --filter @zugzwang/web dev`, o hook
  não rodou. Solução: use os scripts do pacote.

- **Análise lenta sem erro nenhum = perdeu o isolamento cross-origin.** O multi-thread exige
  `SharedArrayBuffer`, que só existe com `Cross-Origin-Opener-Policy: same-origin` +
  `Cross-Origin-Embedder-Policy: require-corp` — o `vite.config.ts` injeta os dois no `server` e no
  `preview`. Sem eles a página cai no fallback single-thread **em silêncio**. Se serviu o `dist/` por
  outro servidor estático (`python -m http.server`, `npx serve`), é isso: esses servidores não mandam os
  headers. Use `pnpm --filter @zugzwang/web preview`.

- **`require-corp` bloqueia recurso externo sem CORP.** Imagem, fonte ou script de terceiro que antes
  carregava passa a ser bloqueado. Primeiro suspeito quando um asset novo "sumiu".

- **`server dev` é `tsx watch`** (recarrega sozinho), mas o **estado é em memória** — ao salvar um arquivo
  do server, as partidas em andamento **se perdem**. Se um bug some ao editar o backend, é isso.

- **O web fala com o server por HTTP.** Se a tela carrega mas nenhuma partida começa, confira se a 3000
  está de pé — não há fallback offline.

- **`pnpm build` roda `tsc` em todos os pacotes**; o web ainda faz `vite build` depois. Erro de tipo no
  engine derruba o build inteiro, mesmo que você só tenha mexido no web.

## Testes

```bash
pnpm test                              # todos os pacotes
pnpm --filter @zugzwang/engine test    # o mais importante — lógica pura
pnpm lint                              # 0 warnings toleradas
```

⚠️ **Node 26:** 3 testes de `packages/web` (`appReview`, `appLiveReview`) falham com
`Cannot read properties of undefined (reading 'clear')`. **Não é regressão.** O Node 26 expõe um
`localStorage` nativo experimental que só existe com a flag `--localstorage-file` e tem precedência sobre
o que o jsdom instala. Em Node 22/24 passam. Verifique com:

```bash
node -e "console.log(process.version, typeof localStorage)"   # v26+ → 'undefined'
```

Se quiser a suíte 100% verde, rode o projeto num Node LTS (via `fnm`/`nvm`) em vez de alterar o código.

## Portas

| Porta | Serviço |
|---|---|
| 5173 | web (Vite) |
| 3000 | server (Express) |
