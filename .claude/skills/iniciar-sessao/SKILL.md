---
name: iniciar-sessao
description: Initializes a Zugzwang work session — reads CLAUDE.md, git state, and pending work from the last session in read-only mode, and confirms scope alignment before any coding. Use at the beginning of each session.
---

# Session Initialization — Zugzwang

This repo is a **pnpm monorepo** (engine + analysis + server + web) for a chess game against a bot.
The source of truth is **the code**; `CLAUDE.md` is the map.

Before any action, perform the reading steps below:

1. **Read the root `CLAUDE.md`** — purpose, engine golden rule, stack, commit and branch conventions,
   roadmap, and the "What NOT to do yet" list (no CI, no Docker, no deployment).

2. **Read the latest session**, if available: `.claude/sessions/` (the most recent file). This is where
   pending work from the previous session is recorded.

3. **Inspect the actual git state** (read-only):

   ```bash
   git status --short && git branch --show-current && git log --oneline -10
   ```

   If the current branch is `main`, remember: **do not commit directly to `main`** — the flow is
   branch → PR → owner merges.

4. **Identify the target package** from the user's request and read only it + affected neighbors.
   Do not load all 4 packages at once.

   | Package             | Role                                                |
   | ------------------- | --------------------------------------------------- |
   | `packages/engine`   | rules (`chess.js` wrapper) + minimax bot + analysis |
   | `packages/analysis` | shared Stockfish analysis contracts                 |
   | `packages/server`   | Express game API (in-memory state)                  |
   | `packages/web`      | React + Vite client (playable board)                |

5. **READ-ONLY MODE:** changing code, creating files, or deleting files is prohibited at this stage.
   The goal is only to load context and verify scope.

## Gates that apply to this session

Explicitly confirm they are active, because these rules cause the most rework when broken:

- **Golden rule:** `chess.js` may be imported only in `packages/engine/src/engine.ts`. Everywhere else,
  use `ChessEngine` and the types from `@zugzwang/engine`.
- **Mandatory TDD/BDD/SDD** — spec → scenario → failing test → code. No exceptions, even for small changes.
- **No commit/push without an explicit instruction.** Work on a feature branch.
- **No CI, Docker, or deployment** — later phase; do not implement inadvertently.

## What to tell the user

Keep it **short**: current branch, whether the working tree is clean, the target package, and whether
there was pending work from the previous session. Confirm in one sentence that the gates above are
active. The goal is only to validate alignment before coding.
