---
name: rodar-local
description: Starts Zugzwang locally (pnpm monorepo — engine, analysis, server 3000, web 5173) and covers time-consuming pitfalls (Stockfish binaries copied during prebuild, cross-origin isolation, Node 26 localStorage). Use when running, manually testing, or debugging the environment.
---

# Running Zugzwang locally

## Prerequisites

- **Node >= 20** and **pnpm >= 9** (`packageManager` pins `pnpm@11.1.0`; pnpm downloads the correct version itself).
- Nothing else — **no database, Redis, Docker, or external service**. Server state is in memory.

```bash
pnpm install
```

## Start everything

```bash
pnpm dev          # all packages in watch mode, in parallel
```

Or start individual packages to isolate them:

```bash
pnpm --filter @zugzwang/server dev    # Express API — port 3000 (tsx watch)
pnpm --filter @zugzwang/web dev       # Vite — port 5173
pnpm --filter @zugzwang/engine play   # play against the bot in the terminal, without a browser
```

To play in the browser: run `pnpm dev` and open `http://localhost:5173`.

## Pitfalls (the ones that cost the most time)

- **Empty `public/engine/` → the engine does not load.** Stockfish binaries are not tracked in git;
  `scripts/copy-engine.mjs` runs in the `predev`/`prebuild` hooks and copies
  `stockfish-18-lite{,-single}.js/.wasm` into `public/engine/`. If you ran `vite` directly instead of
  `pnpm --filter @zugzwang/web dev`, the hook did not run. Solution: use the package scripts.

- **Slow analysis without any error = lost cross-origin isolation.** Multi-threading requires
  `SharedArrayBuffer`, available only with `Cross-Origin-Opener-Policy: same-origin` +
  `Cross-Origin-Embedder-Policy: require-corp` — `vite.config.ts` injects both into `server` and
  `preview`. Without them, the page **silently** falls back to single-thread mode. If you served
  `dist/` through another static server (`python -m http.server`, `npx serve`), that is the cause:
  those servers do not send the headers. Use `pnpm --filter @zugzwang/web preview`.

- **`require-corp` blocks external resources without CORP.** Third-party images, fonts, or scripts
  that previously loaded become blocked. Suspect this first when a new asset "disappears".

- **`server dev` uses `tsx watch`** (automatic reload), but **state is in memory** — saving a server
  file **loses** ongoing games. If a bug disappears when editing the backend, that is why.

- **Web talks to server over HTTP.** If the screen loads but no game starts, check that port 3000
  is running — there is no offline fallback.

- **`pnpm build` runs `tsc` across all packages**; web also runs `vite build` afterward. An engine
  type error breaks the entire build, even if you changed only web.

## Tests

```bash
pnpm test                              # all packages
pnpm --filter @zugzwang/engine test    # the most important — pure logic
pnpm lint                              # 0 warnings tolerated
```

ℹ️ **Node 26 and `localStorage` — resolved.** Node >= 26 exposes experimental native `localStorage`
that works only with `--localstorage-file`. Since Vitest's jsdom environment uses `globalThis` itself
as `window`, this global shadowed jsdom's Storage: `localStorage` and `window.localStorage` became
`undefined` in tests **and** in production code running under them (`App.tsx`, `useSavedGames.ts`).

`packages/web/tests/setup.ts` installs in-memory Storage when the global is unusable — a no-op on
Node 22/24. The suite passes on any version; switching Node versions is **no longer** necessary.

## Ports

| Port | Service          |
| ---- | ---------------- |
| 5173 | web (Vite)       |
| 3000 | server (Express) |
