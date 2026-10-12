---
name: codereview
description: Senior code review of recent Zugzwang changes (working tree or latest commits), focused on scalability, maintainability, and repository invariants (chess.js golden rule, engine purity, server↔web REST contract). Reports with file/line references only — does not apply fixes.
---

# Senior Code Review — Zugzwang

Act as a Senior Engineer and critically review the **latest changes in this repository**.

## How to identify what to review (in this order)

1. Working tree: `git status` + `git diff` + relevant new untracked files.
2. If clean, the latest commits on the current branch (`git log` + `git show`).
3. **Always read the entire file** when the diff alone lacks context — never review a snippet blindly.

## Pillar 1 — Zugzwang invariants (check first; these are what break the project)

- **Golden rule:** does the diff import `chess.js` outside `packages/engine/src/engine.ts`? This is a
  structural violation — the wrapper exists to keep the rules library replaceable. Report it first.
- **Engine purity:** `packages/engine` and `packages/analysis` must not depend on Express, React,
  `window`/`document`, or network I/O. If introduced, chess logic is no longer independently testable.
- **Are `syncEngine`/evaluation still deterministic?** Evaluation, minimax, and move ordering must
  remain pure — `Math.random()` or `Date.now()` inside them makes the bot non-reproducible and tests
  flaky. If a feature needs randomness (e.g., varying openings), it is **injected**, not embedded.
- **Server↔web REST contract:** TypeScript **does not** cross the HTTP boundary. If the diff changed
  a server response shape, was the type consumed by web updated field by field? This is the number
  one bug category in any frontend+backend — the build passes and the screen breaks at runtime.
- **No CI/Docker/deployment:** did the diff add `.github/workflows`, a `Dockerfile`, or a deployment
  script? This is explicitly out of scope in `CLAUDE.md` — report it.

## Pillar 2 — Scalability and performance

- The bot runs on the **hot path** (minimax + alpha-beta pruning). Allocations inside the search loop,
  board cloning per node, or `array.includes` on large structures cost real search depth.
- Server state is **in memory**: does any structure grow without bounds (a game map never pruned)?
  In a long-running process, that is a leak.
- In web, Stockfish runs in a **Web Worker**. Heavy work moved back to the main thread freezes the
  board — check that analysis stays outside the UI thread.
- A `useEffect` without cleanup that starts analysis on every render = duplicated work and races
  between stale responses. Every asynchronous analysis must be cancellable/discardable when the position changes.

## Pillar 3 — Maintainability

- Clean Code and SOLID: mixed responsibilities, high coupling, unnecessary cyclomatic complexity.
- **Was TDD followed?** New feature code without a corresponding test violates `CLAUDE.md`. Does the
  test describe **behavior** (`it('deve <resultado> quando <condição>')`, meaning "should <result>
  when <condition>") or an implementation detail?
- Names in **English** in code (repository convention); comments and docs may be in Portuguese.
- **ESM:** internal relative imports require the `.js` extension. Without it, compiled runtime breaks.

## Pillar 4 — Application robustness and security

The server is local and unauthenticated, so **do not** apply a multi-tenant API checklist here.
What actually matters in this repository:

- **Untrusted input:** are client moves/FEN/game IDs validated before reaching the engine? Malformed
  FEN throwing an unhandled exception breaks the route.
- **Raw error leakage:** a `catch` returning `err.message`/stack to the client. Return a static code
  and log details on the server.
- **`localStorage`:** are persisted data read back with `try/catch` and validation? Corrupt JSON from
  an earlier schema version must not break app startup.
- **New dependency** in any `package.json`? Report the package + license. ⚠️ **This repo is GPLv3**
  (because it bundles Stockfish) — watch for incompatible licenses.
- **`dangerouslySetInnerHTML`** or HTML injection with dynamic content (e.g., imported PGN) without sanitization.

## Response format

- No irrelevant micro-optimizations.
- For each issue: **file and line**, long-term impact, and refactored code demonstrating the solution.
  Sort by severity — invariant violations first.
- **Review and report only. Do not apply fixes** without an explicit instruction.
