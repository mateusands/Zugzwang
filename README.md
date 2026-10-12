# Zugzwang

> A chess game against a bot, written in TypeScript.

<!-- Placeholder badges — CI does not exist yet (see Roadmap).
[![build](https://img.shields.io/badge/build-pending-lightgrey)](#)
-->

![status](https://img.shields.io/badge/status-in%20development-yellow)
![license](https://img.shields.io/badge/license-GPLv3-blue)

## About the project

**Zugzwang** — the German chess term for a situation where any available move
worsens your position — is a long-term portfolio project: a playable chess game
against a bot, built from scratch in phases.

The focus is on both the final product and the process: clean architecture,
tests, commit/branch/PR conventions, and documented incremental development.

### Key technical decisions

- **Monorepo (pnpm workspaces).** Engine, server, and client share types and
  tools (TypeScript, ESLint, Prettier) and evolve together without the friction
  of separate repositories.
- **`chess.js` isolated in a wrapper.** Chess rules are accessed only through
  the `ChessEngine` class (in `packages/engine`). No other package imports
  `chess.js` directly, allowing the rules library to be replaced or extended
  later without refactoring the rest of the code.
- **Engine / server / web separation.** Game and bot logic lives in `engine`,
  independent of HTTP and the UI. `server` exposes it; `web` renders it.
- **Strict TypeScript and tests from the start.** The entire codebase already
  runs with `strict` enabled and `any` prohibited by lint.

## Stack

| Package              | Technology                              | Role                                          |
| -------------------- | --------------------------------------- | --------------------------------------------- |
| `@zugzwang/analysis` | TypeScript                              | Contracts, UCI parser, and quality policy     |
| `@zugzwang/engine`   | TypeScript, chess.js, Vitest            | Chess rules and minimax bot                   |
| `@zugzwang/server`   | TypeScript, Express, Stockfish 18/WASM  | Game API and asynchronous deep analysis queue |
| `@zugzwang/web`      | TypeScript, React, Vite, Stockfish/WASM | Board, history, review, and local fallback    |

Shared tools: **pnpm workspaces**, **ESLint**, **Prettier**.

## Running locally

### Prerequisites

- [Node.js](https://nodejs.org/) **>= 20**
- [pnpm](https://pnpm.io/) **>= 9** (`npm install -g pnpm`)

### Installation

```bash
git clone https://github.com/mateusands/Zugzwang.git
cd Zugzwang
pnpm install
```

### Playing against the bot

**In the browser** (web + server together):

```bash
pnpm dev
# open http://localhost:5173 and play by clicking the pieces
```

**In the terminal** (without a browser):

```bash
pnpm --filter @zugzwang/engine play
```

### Running individual packages

```bash
pnpm --filter @zugzwang/web dev       # Vite client at http://localhost:5173
pnpm --filter @zugzwang/server dev    # API at http://localhost:3000
pnpm --filter @zugzwang/engine test   # engine tests
```

Check the API with:

```bash
curl http://localhost:3000/health
# {"status":"ok","service":"zugzwang-server"}
```

The server starts a bounded pool of full Stockfish 18 engines to review games
through asynchronous jobs. Results and cache survive restarts in
`.data/analysis.json`; if the pool cannot start, review continues using the
browser's lite engine. The budget can be adjusted without changing code:

```bash
ANALYSIS_POOL_SIZE=2 ANALYSIS_HASH_MB=512 ANALYSIS_MAXIMUM_DEPTH=30 pnpm --filter @zugzwang/server dev
```

`ANALYSIS_POOL_SIZE` accepts 1–8 processes and defaults to one engine per
available core (up to 6) — **one thread per engine**. Since jobs search to a
fixed depth, extra threads save very little time: lazy SMP broadens the search
to reach the same depth. Measured on a batch of 7 deep positions on a 12-core
machine, using median times across repeated runs: 57s with 2 engines of 5
threads, 21s with 4 of 2, 19s with 5 of 2, and **13s with 6 of 1**.
`ANALYSIS_HASH_MB` sets the total hash memory divided across the pool, and
`ANALYSIS_DATA_PATH` changes the persistence path. Profile depths can be tuned
with `ANALYSIS_FAST_DEPTH` (18), `ANALYSIS_DEEP_DEPTH` (22), and
`ANALYSIS_MAXIMUM_DEPTH` (26, up to 40). Higher depths grow exponentially and
are intended for a dedicated machine. Engine health is available at
`GET /analysis/health`; jobs use `POST /analysis/jobs`,
`GET /analysis/jobs/:id`, SSE at `GET /analysis/jobs/:id/events`, and
cancellation at `DELETE /analysis/jobs/:id`.

### Other commands

```bash
pnpm build          # build all packages
pnpm test           # run all tests
pnpm lint           # ESLint
pnpm format         # Prettier --write
```

## Project structure

```
zugzwang/
├── packages/
│   ├── engine/   # Rules (chess.js wrapper) + bot (minimax) + analysis + CLI
│   ├── analysis/ # Shared Stockfish analysis contracts and policy
│   ├── server/   # Game API + asynchronous analysis jobs
│   └── web/      # React + Vite client (board, history, and review)
├── tsconfig.base.json   # Shared TypeScript config
├── eslint.config.js     # Shared lint config
├── pnpm-workspace.yaml
├── CLAUDE.md            # Contribution guide / project conventions
└── README.md
```

## Roadmap

**Completed:**

1. **Local foundation** — monorepo, engine wrapper, tooling.
2. **Complete rules** — legal moves, check/checkmate/stalemate, castling,
   _en passant_, promotion, history/PGN.
3. **Minimax bot** — position evaluation and alpha-beta pruning.
4. **Refined bot** — pawn structure, king safety, center control; move
   ordering, adaptive depth, and transposition table.
5. **Polish** — undo, difficulty levels, post-game analysis, CLI.
6. **Browser interaction** — server game API + playable web board
   (drag/click, hints, annotations, sounds, promotion, end screen, persistence).
7. **Takeback + navigation** — undo a pair of moves and navigate history
   (◀▶, clickable move list, keyboard).
8. **Game history** — save completed games (localStorage) and review them
   move by move (replay).
9. **Evaluation engine** — Stockfish/WASM in a Web Worker; evaluation bar
   beside the board (evaluation, best move, win probability).
10. **Game review** — move-by-move classification, accuracy, highlights, and
    asynchronous full Stockfish analysis on the backend with a persistent
    cache. The quick pass and refinement of the four most critical moves run
    in the background during the game itself; finishing the game completes
    only what has not yet reached the cache.

**Next:** coach → bots with personalities. Finally, **CI/CD and deployment**.

Convention details (commits, branches, PRs) are in [CLAUDE.md](CLAUDE.md).

## Status

🚧 **In active development.** Already **playable against the bot** — in the
browser (`pnpm dev`) and terminal (`pnpm --filter @zugzwang/engine play`) —
with game history, an evaluation bar, and deep Stockfish review.
Phases 1–10 complete; the next step is the coach.

## License

Distributed under the [GNU GPL v3](LICENSE) license.

Board pieces use the **Cburnett** set by Colin M.L. Burnett, obtained from
[Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces)
and licensed under GPLv2+, BSD, and CC BY-SA 3.0 — we use it under the GPL.
The artwork is vendored in `packages/web/src/pieceArt.ts` (rather than as an
external asset, because the page is cross-origin isolated).

Position analysis uses [Stockfish](https://stockfishchess.org/) compiled to
WebAssembly (via [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js)),
which is free software under GPLv3 — hence this project also adopts GPLv3.
The engine binary is not tracked here: it comes from the `stockfish` npm
package. Lite variants are copied to `packages/web/public/engine/` during
`dev`/`build`; the server runs the full variant directly from the package.
