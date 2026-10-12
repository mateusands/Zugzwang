---
name: frontend
description: Zugzwang web client development (React 18 + Vite 6 + plain CSS + Stockfish/WASM in a Web Worker). Encodes repository conventions — pure helpers separate from components, cross-origin isolation required by SharedArrayBuffer, analysis outside the UI thread, component TDD with Vitest + jsdom. Use when changing packages/web.
---

# Frontend — `packages/web`

Guide for UI changes. Follows `CLAUDE.md`: **mandatory TDD/BDD/SDD**, **no commit/push without an
instruction**, **do not refactor what was not requested**.

**This package's actual stack** (check `packages/web/package.json` — do not assume):

| Library                  | Version                         | Notes                                                             |
| ------------------------ | ------------------------------- | ----------------------------------------------------------------- |
| React                    | **18.3**                        | not 19 — no `use`, no `ref` as a prop; `forwardRef` still applies |
| Vite                     | **6.x**                         | dev on 5173                                                       |
| Vitest + Testing Library | **3.0 / 16**                    | jsdom through a docblock, not globally                            |
| Styling                  | **Plain CSS** (`src/index.css`) | **no Tailwind, shadcn, or component library**                     |
| Stockfish                | **18 lite** (MT + ST)           | WASM in a Web Worker                                              |

Do not introduce Tailwind, styled-components, or a UI library without an explicit request — the
package deliberately has no styling framework.

---

## Architecture: pure helper ≠ component

The package's most important separation. `src/` contains two kinds of files:

- **Pure helpers** (`board.ts`, `fen.ts`, `material.ts`, `outcome.ts`, `winprob.ts`, `annotations.ts`,
  `openingBook.ts`, `review.ts`, `replay.ts`, `uci.ts`…): no React, no DOM, directly testable. **This is
  where logic belongs.**
- **Components and hooks** (`App.tsx`, `BoardView.tsx`, `components/`, `useEvaluation.ts`,
  `usePieceDrag.ts`, `useSavedGames.ts`): orchestrate rather than calculate.

Practical rule: if you are about to write a business-rule `if` inside a `.tsx` file, **extract it into
a pure helper** and test it directly. This makes the package's suite fast and honest — notice that
most tests in `tests/` are `.ts`, not `.tsx`.

---

## Cross-origin isolation — the most frequent breakage without a clear error

Multi-threaded Stockfish requires `SharedArrayBuffer`, available only when the page is **cross-origin
isolated**. `vite.config.ts` injects both headers into `server` **and** `preview`:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

- If the headers disappear, **no red error appears** — the page falls back to single-thread mode
  (`stockfish-18-lite-single.js`), slowing analysis. The symptom is performance, not an exception.
- `require-corp` **blocks** any third-party resource without CORP. When adding an external image,
  font, or script, suspect this first.
- Engine binaries are **not** tracked in git: `scripts/copy-engine.mjs` runs during `predev`/`prebuild`
  and copies lite files into `public/engine/`. If `public/engine/` is empty, you ran `vite` directly
  instead of `pnpm dev` — use the package scripts.

---

## Asynchronous analysis — the UI never waits

The engine runs in a Web Worker (`stockfishClient.ts`, `useEvaluation.ts`), and game review goes to
the analysis backend (`analysisApi.ts`, `reviewAnalysis.ts`, `liveReview.ts`).

- **Every in-flight analysis must be discardable.** If the position changes (new move, takeback,
  history navigation), a later response is **stale** and must not overwrite current state. This is
  the most expensive bug category here — test it explicitly (see `appLiveReview.test.tsx`).
- No heavy work on the UI thread: if the board freezes during analysis, something moved back to the main thread.
- A `useEffect` that starts analysis needs cleanup — otherwise every render accumulates duplicated work.

---

## Persistence

Saved games and review cache live in `localStorage` (`savedGames.ts`, `reviewCheckpoint.ts`).

- **Always read defensively**: `try/catch` + shape validation. JSON written by an earlier version
  must not break app startup.
- Do not assume storage quota is available — `setItem` throws `QuotaExceededError` as history grows.

---

## Component SDD + BDD + TDD (mandatory)

**Order: spec → behavior → failing test → code.**

- **Test location:** `packages/web/tests/*.test.ts(x)` — `tests/` at the **package root**, not beside
  source files (unlike the sync-ai convention; follow this repository's convention).
- **jsdom is enabled per file, through a docblock** — a component test's first line must be
  `// @vitest-environment jsdom`. Otherwise, the test runs in Node and `document` does not exist.
- **BDD:** `it('deve <o que o jogador vê> quando <ação>')` — meaning "should <what the player sees>
  when <action>" — player behavior, not internal state.
- Prefer testing the **pure helper**; use component tests only for actual UI behavior
  (clicks, conditional rendering, history navigation).
- **jsdom does not test layout or CSS** (board geometry, square colors, real dragging). Do not write
  "tests" pretending to cover styling — lock down behavior and validate visuals in the browser.

```bash
pnpm --filter @zugzwang/web test
pnpm --filter @zugzwang/web typecheck
pnpm --filter @zugzwang/web dev      # 5173, and inspect the screen
```

ℹ️ **`localStorage` in tests:** Node >= 26 provides experimental native `localStorage` that shadows
jsdom's (Vitest's environment uses `globalThis` itself as `window`). `tests/setup.ts` installs in-memory
Storage when the global is unusable — this is why `App.tsx` and `useSavedGames.ts` can keep accessing
the global directly. If you change this setup, run the suite on Node 26 **and** an LTS version.

## Workflow

1. Read the target file + its neighbor → learn the pattern (pure helper vs component, how state flows).
2. Map the impact: helper consumers; changes to `index.css` affect the entire app.
3. TDD (Red → Green → Refactor). Logic → pure helper. Behavior → component.
4. Green: typecheck + suite + **visual inspection on 5173**.
5. **No commit/push without an instruction.** When requested, use a feature branch.
