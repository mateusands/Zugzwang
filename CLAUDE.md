# CLAUDE.md — Zugzwang project guide

> This file guides Claude Code (and any contributor) in future sessions.
> Read it before starting any task in this repository.

## Overview

**Zugzwang** is a chess game against a bot, written in TypeScript. It is a
long-term portfolio project developed in phases. The code is organized as a
**monorepo with pnpm workspaces**.

### Stack

| Layer    | Technology                                                                          |
| -------- | ----------------------------------------------------------------------------------- |
| Engine   | TypeScript + [chess.js](https://github.com/jhlywa/chess.js) (isolated in a wrapper) |
| Analysis | TypeScript — shared analysis contracts and quality policies                         |
| Server   | TypeScript + Express + Stockfish (native process, asynchronous jobs)                |
| Web      | TypeScript + React + Vite + Stockfish/WASM (Web Worker)                             |
| Tests    | Vitest                                                                              |
| Quality  | ESLint (flat config) + Prettier                                                     |
| Runtime  | Node.js >= 20, pnpm >= 9                                                            |

### Folder structure

```
zugzwang/
├── packages/
│   ├── engine/   # Rules (chess.js wrapper) + bot (minimax) + analysis
│   │   ├── src/
│   │   │   ├── engine.ts   # ChessEngine — the ONLY place that touches chess.js
│   │   │   ├── bot.ts      # evaluation, minimax+αβ, difficulty, analysis
│   │   │   ├── render.ts   # text board (for the CLI)
│   │   │   └── index.ts    # public package API
│   │   └── scripts/play.ts # CLI: play against the bot in the terminal
│   ├── analysis/ # Shared Stockfish analysis contracts (no I/O)
│   │   └── src/
│   │       ├── types.ts    # job, request, and result shapes
│   │       ├── quality.ts  # quality/move classification policies
│   │       ├── uci.ts      # UCI protocol parsing
│   │       └── index.ts    # public package API
│   ├── server/   # Game API (Express, in-memory state) + analysis jobs
│   │   └── src/
│   │       ├── app.ts      # createApp() — /games routes, testable without listen()
│   │       ├── index.ts    # bootstrap (listen on the port)
│   │       └── analysis/   # asynchronous analysis backend (see dedicated section)
│   └── web/      # React + Vite client — playable board
│       ├── src/               # App, BoardView, components/, hooks, pure helpers
│       │   ├── pieceArt.ts    # vendored SVG piece artwork (Cburnett)
│       │   ├── useLiveReview.ts  # background pre-analysis during the game
│       │   └── analysisApi.ts    # job client (SSE)
│       └── tests/             # package suite (at the ROOT, not beside source files)
│           └── setup.ts       # in-memory Storage for Node 26 localStorage
├── tsconfig.base.json      # Shared TS config (extended by each package)
├── eslint.config.js        # Shared ESLint flat config
├── .gitattributes          # LF line endings (.bat/.cmd use CRLF)
├── .claude/skills/         # Claude Code skills (versioned)
├── pnpm-workspace.yaml
└── package.json            # Root scripts (dev/build/test/lint/format)
```

> **Skills (`.claude/skills/`, versioned):** `iniciar-sessao`, `finalizar-sessao`,
> `backend`, `frontend`, `codereview`, and `rodar-local` — encode the conventions
> below as actionable instructions. The rest of `.claude/` is local and excluded from git.
>
> **Supporting docs (local, in `.claude/`, excluded from git):** `roadmap.md`
> (phases 6–12 in detail) and `HARDENING.md` (accumulated pitfalls and decisions —
> read before changing code).

## Engine golden rule

**Never** import `chess.js` directly outside `packages/engine/src/engine.ts`.
All access to chess rules goes through the `ChessEngine` class and the types
exported by `@zugzwang/engine`. This keeps the rules library replaceable
without refactoring server or web.

## Commands

At the root (run across all packages through workspace filters):

```bash
pnpm install        # install everything
pnpm dev            # start all packages in watch mode (in parallel)
pnpm build          # build all packages
pnpm test           # run all tests
pnpm lint           # ESLint (0 warnings tolerated)
pnpm format         # Prettier --write
pnpm format:check   # Prettier --check (used for validation)
```

Per package:

```bash
pnpm --filter @zugzwang/engine test
pnpm --filter @zugzwang/engine play     # play against the bot in the terminal
pnpm --filter @zugzwang/analysis test
pnpm --filter @zugzwang/server dev      # port 3000
pnpm --filter @zugzwang/web dev         # port 5173
```

To play in the browser: run `pnpm dev` and open `http://localhost:5173`.

> ℹ️ **Node 26 and `localStorage`:** Node >= 26 exposes an experimental native
> `localStorage` that works only with `--localstorage-file`. Since Vitest's jsdom
> environment uses `globalThis` itself as `window`, this global shadowed jsdom's
> Storage and left `localStorage` `undefined` in tests **and** in production code
> running under them. `packages/web/tests/setup.ts` installs in-memory Storage
> when the global is unusable (a no-op on Node 22/24). The suite passes on all of them.

## Code rules

- **Strict TypeScript.** `strict: true` and extra checks are already enabled in
  `tsconfig.base.json`. Do not relax them without justification.
- **No `any`** — `@typescript-eslint/no-explicit-any` is set to `error`. If
  `any` is truly unavoidable, isolate it and explain why in a comment.
- **Mandatory tests for `engine` logic.** Every rule, move, or bot evaluation
  function needs a Vitest test. Server and web may have lighter tests for now.
- **Code in English.** Variable, function, and type names and commit messages
  must be in English. Documentation (README, this file, explanatory comments)
  may be in Portuguese.
- **ESM.** All packages use `"type": "module"`; use the `.js` extension in
  internal relative imports (e.g., `./engine.js`).

## Asynchronous analysis (phase 10 — PR #12)

Game review no longer runs only in the browser: **server** exposes an analysis
backend using native Stockfish through asynchronous jobs, and **web** consumes them.

### The three packages involved

| Location                        | Role                                                                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@zugzwang/analysis`            | **Pure contracts** — job types, UCI parsing, quality policies. No I/O, processes, or network. The shared source of truth for server and web                            |
| `packages/server/src/analysis/` | Execution: `stockfishProcess` (native process), `analysisJobManager` (queue/pool), `fileAnalysisRepository` (persistence), `analysisRoutes` (HTTP), `runtime` (config) |
| `packages/web`                  | Consumes through `analysisApi.ts` (SSE) → `useLiveReview.ts` (pre-analysis) / `reviewAnalysis.ts` (final review)                                                       |

**Rule:** new job/result shapes originate in `@zugzwang/analysis` and are imported
on both sides. Defining a type only in server (or only in web) recreates the
contract divergence this package exists to prevent.

### Routes

```
GET  /analysis/health          # 503 when the analysis backend is not mounted
POST /analysis/jobs            # create a job
GET  /analysis/jobs/:id        # query (fallback only: web follows jobs through SSE)
DELETE /analysis/jobs/:id      # cancel
GET  /analysis/jobs/:id/events # progress stream (SSE) — normal web path
```

⚠️ **Do not return to polling jobs.** Web previously sent a `GET` every 150 ms,
generating dozens of requests per position — and pre-analysis starts on every
move. `analysisApi.ts` subscribes to the stream and falls back to querying only
when `EventSource` is unavailable (jsdom in tests) or the connection dies before
the terminal snapshot.

Analysis routes are registered only when `createApp()` receives `analysisJobs` —
otherwise, `createApp()` continues serving only `/games`, and `/analysis/health`
returns `503`. This keeps server tests isolated without starting Stockfish.

### Configuration (environment variables, all optional)

| Variable                 | Default                      | Range   |
| ------------------------ | ---------------------------- | ------- |
| `ANALYSIS_POOL_SIZE`     | available cores, capped at 6 | 1–8     |
| `ANALYSIS_HASH_MB`       | 512                          | 16–4096 |
| `ANALYSIS_FAST_DEPTH`    | 18                           | 12–24   |
| `ANALYSIS_DEEP_DEPTH`    | ≥22                          | fast–32 |
| `ANALYSIS_MAXIMUM_DEPTH` | ≥26                          | deep–40 |
| `ANALYSIS_DATA_PATH`     | `.data/analysis.json`        | —       |

Values are clamped to the range (`boundedInteger` in `runtime.ts`) — out-of-range
values are silently corrected rather than rejected. Depths are chained:
`fast ≤ deep ≤ maximum`. `ANALYSIS_POOL_SIZE` is the only one **without** a fallback
value: when absent, it deliberately becomes `undefined` so `computeStockfishResources`
can size the pool based on cores. Adding a default here turns that calculation into
dead code — this has already happened.

⚠️ **One thread per engine, not one engine with many threads.** Jobs search to a
fixed depth (`go depth N`), and in this mode lazy SMP broadens the search: extra
threads visit more nodes to reach the same depth and save very little time.
Measured on a deep batch of 7 positions on a 12-core machine (median across repeated
runs): 2 engines × 5 threads = 57s, 4 × 2 = 21s, 5 × 2 = 19s, **6 × 1 = 13s**.
Six engines using 6 threads total outperform two using 10.

⚠️ **Persistence uses a JSON file** (`.data/analysis.json`, gitignored), not a
database. It grows with job history and is rewritten in full — it is unsuitable
for high volume without rethinking the repository implementation.

## Non-negotiable rule: TDD/BDD/SDD

No production code is written without a spec (SDD) → Given/When/Then scenario (BDD) →
failing test before code (TDD). No exceptions, even for small changes.

The cycle for each layer is documented in the versioned skills: `/backend` (engine,
analysis, and server — spec in the test header, `it('deve <resultado> quando <condição>')`,
meaning "should <result> when <condition>", FEN as the scenario) and `/frontend`
(web — pure helper before component, jsdom through a docblock).

## Commit convention — Conventional Commits

Format: `type(scope): imperative description`.

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`.
Common scopes: `engine`, `analysis`, `server`, `web`, `repo`.

Domain examples:

```
feat(engine): add castling validation
feat(engine): implement en passant detection
fix(engine): fix pawn promotion failing to replace the piece
test(engine): cover checkmate and stalemate cases
feat(server): add POST /games route to start a game
feat(web): render pieces from the engine FEN
refactor(engine): extract material evaluation into its own module
docs(repo): document how to run each package locally
chore(repo): update workspace dependencies
```

## Branch convention

- `feat/feature-name` — e.g., `feat/minimax-bot`
- `fix/bug-name` — e.g., `fix/invalid-en-passant`
- `refactor/...`, `test/...`, `docs/...`, `chore/...` follow the same pattern.

Always work on a branch; do not commit directly to `main`.

## Pull request structure

- **Title** follows the commit convention (e.g., `feat(engine): add minimax`).
- **Description** with sections:
  - **What changed** — objective summary.
  - **How to test** — commands and validation steps.
  - **Screenshots** — required for UI (web) changes.
- **Small, focused PRs** — one responsibility per PR. Prefer several small PRs
  over one large PR.

## What NOT to do yet

> Restrictions that remain in force. Do not implement these inadvertently
> unless the project owner asks.

- **No GitHub Actions / CI.** No workflows in `.github/`. CI/CD is a later phase.
- **No Docker or deployment.** No `Dockerfile`, no deployment scripts. The Vite
  proxy (`/api` → server) is **for development only**.
- **Do not commit or push automatically.** The project owner reviews and
  commits/merges manually unless explicitly requesting otherwise. The flow is:
  branch → PR → owner merges → synchronize `main` → delete the branch.

## Roadmap (phases)

**Completed** (playable in the browser and terminal):

1. **Local foundation** — monorepo, engine wrapper, tooling (lint/format).
2. **Complete rules** — legal moves, check/checkmate/stalemate, castling,
   en passant, promotion, history/PGN.
3. **Minimax bot** — evaluation + alpha-beta pruning.
4. **Refined bot** — pawn structure, king safety, center control; move ordering,
   adaptive depth, transposition table.
5. **Polish** — undo (`undo`), difficulty levels, post-game analysis, CLI.
6. **Browser interaction** — server (game API) + web (playable board: drag/click,
   hints, annotations, sounds, promotion, end screen, persistence).
7. **Takeback + navigation** — undo a pair of moves; navigate history
   (◀▶, clickable move list, keyboard).
8. **Game history** — save completed games (localStorage) and review them
   move by move (replay).
9. **Evaluation engine** — Stockfish/WASM in a Web Worker; evaluation bar
   (evaluation, best move, win probability) live and during replay.
   **The repo switched to GPLv3** because it bundles the Stockfish binary.
10. **Move review and classification** — curated opening book, adaptive multipv
    analysis, complete and resumable game review, animated reviewed moves during
    replay (PR #11); and the **asynchronous analysis backend**: `@zugzwang/analysis`
    with shared contracts, native Stockfish jobs on server, web review running
    on those jobs (PR #12). See the "Asynchronous analysis" section above.

**Next** (details in `.claude/roadmap.md`): 11 coach (commentary) ·
12 bots with personalities.

**CI/CD + deployment** (GitHub Actions, Docker) are added **only** when the owner
asks — not before.
