---
name: backend
description: Zugzwang engine and server development (TypeScript + Express 4 + in-memory state, minimax, Stockfish analysis). Encodes repository conventions — the chess.js golden rule, engine purity and determinism, a REST contract matching web types, mandatory TDD. Use when changing packages/engine, packages/analysis, or packages/server.
---

# Backend — `packages/engine` · `packages/analysis` · `packages/server`

Guide for changes outside the browser. Follows `CLAUDE.md`: **mandatory TDD/BDD/SDD**,
**no commit/push without an instruction**, **do not refactor what was not requested**.

**Three packages, distinct roles** (do not confuse them):

| Package              | Role                                                                   | Depends on         |
| -------------------- | ---------------------------------------------------------------------- | ------------------ |
| `@zugzwang/engine`   | rules (`chess.js` wrapper), minimax+αβ bot, evaluation, text rendering | no domain packages |
| `@zugzwang/analysis` | shared Stockfish analysis contracts                                    | no domain packages |
| `@zugzwang/server`   | Express game API, **in-memory** state                                  | engine + analysis  |

---

## Golden rule (the one that defines the architecture)

**`chess.js` exists only inside `packages/engine/src/engine.ts`.** All access to rules goes through
`ChessEngine` and the types exported by `@zugzwang/engine`. If you need a `chess.js` method the wrapper
does not expose, **extend the wrapper** — do not import the library in server or web. The point is to
keep the rules library replaceable without refactoring everything else.

---

## Non-negotiable rules

1. **The engine is pure and deterministic.** Evaluation, minimax, move ordering, and adaptive depth
   cannot call `Math.random()`, `Date.now()`, the network, or disk. Same position + same depth = same
   move, always. If a feature requires time or randomness, **inject** it as a parameter so tests can
   fix its value. Otherwise, bot tests become flaky.
2. **Do not assume a route exists** — check `packages/server/src/app.ts`. `createApp()` is separate
   from `listen()` specifically to allow tests without opening a port; preserve that separation.
3. **The REST contract must EXACTLY match the type consumed by web.** TypeScript does not cross HTTP —
   the build passes and the screen breaks. When changing a response shape, **search for the type in
   `packages/web/src`** and match field by field (`fen`, `turn`, `status`, `gameOver`, `winner`, `pieces`,
   `legalMoves`, `legalTargets`, `history`, `fens`, `pgn`). A field renamed in server but not web = silent bug.
4. **Validate input before handing it to the engine.** FEN, SAN/UCI, and game IDs come from the client.
   Malformed FEN that throws inside `chess.js` breaks the route — validate at the boundary and return 400.
5. **Never return raw errors.** `res.json({ message: err.message })` leaks stack and internal details.
   5xx fallback = static payload + `console.error`/logger on the server.
6. **In-memory state has a lifecycle.** The game map grows forever if nothing prunes it. When adding
   long-lived state, define how it is released.
7. **ESM:** internal relative imports **must include the `.js` extension** (e.g., `./engine.js`). All
   packages use `"type": "module"`.
8. **No `any`** — `@typescript-eslint/no-explicit-any` is set to `error`. If truly unavoidable, isolate
   it and explain why in a comment.

---

## SDD + BDD + TDD (mandatory) + verify green

**Order: spec → behavior → failing test → code.** Full details in `CLAUDE.md`.

- **SDD:** the test file header explains the **contract** and **why** it exists (the bug or decision
  that led to it). The spec preserves context over time — the test alone does not explain the reason.
- **BDD:** `describe('<módulo>')` → `it('deve <resultado> quando <condição>')`, in Portuguese, using
  chess language (move, check, castling, stalemate) rather than code terminology. The templates mean
  "<module>" and "should <result> when <condition>". If `it` mentions a variable name, it tests
  implementation — rewrite it.
- **TDD:** Red (run and **fail**) → Green (minimum needed to pass) → Refactor (clean up while staying green).
- **Priority target:** pure engine logic — movement rules, check/checkmate/stalemate detection,
  castling, en passant, promotion, and bot evaluation functions. Every new rule needs a test, without
  exception (`CLAUDE.md`: "Mandatory tests for engine logic").
- **Test positions use FEN**, not move sequences — FEN makes the scenario explicit and the test readable.

```bash
pnpm --filter @zugzwang/engine test
pnpm --filter @zugzwang/server test
pnpm --filter @zugzwang/engine play    # play against the bot in the terminal (real validation)
pnpm lint                              # 0 warnings tolerated
pnpm build                             # tsc across all packages
```

After green, **exercise it for real**: terminal `play` reveals behavior tests miss
(a bot taking too long, a legal but absurd move, a game that never ends).

## Workflow

1. Read the target module + its neighbors → learn the pattern before inventing a new one.
2. Map the impact: callers, dependencies, the contract with web.
3. TDD (Red → Green → Refactor).
4. Green: lint + build + tests + exercise through `play`.
5. **No commit/push without an instruction.** When requested, use a feature branch + Conventional Commits
   (`feat(engine): ...`, `fix(server): ...`).
