---
name: finalizar-sessao
description: Ends a Zugzwang work session — generates the session report in .claude/sessions/ and updates CLAUDE.md if the architecture changed. Use at the end of each session.
---

# Session Wrap-up — Zugzwang

The goal now is **not to code**, but to consolidate session changes so the next session does not start from scratch.

## 1. Session report

- Create `.claude/sessions/YYYY-MM-DD.md` (today's date). If a file with today's date already exists,
  **append** a new section instead of overwriting it.
- Required content:
  - **What was done** — features, resolved bugs, refactors, with the affected package.
  - **Non-obvious technical decisions** — and why. This preserves context over time.
  - **Tests** — newly covered behavior; if anything stayed red, what and why.
  - **Pending work** — what remains for the next session, explicit enough to resume without context.
  - **Git state** — branch, whether a PR is open, whether anything remains uncommitted.

> `.claude/sessions/` is **gitignored** — a local logbook, not repository documentation.

## 2. Updating CLAUDE.md

Critically assess whether the session changed anything asserted by `CLAUDE.md`. If so, update it — an
outdated `CLAUDE.md` is worse than none because it is read as truth. Typical triggers:

- A new package in `packages/` (the "Folder structure" section lists packages individually).
- A new or changed command in `package.json` scripts.
- An architecture change: a new engine module, server route, or web flow.
- A completed roadmap phase.
- A newly discovered pitfall (the kind that wasted time) — document it to prevent repetition.

## 3. Final validation

Before declaring the session complete, confirm green and **report the actual result**, without disguising it:

```bash
pnpm lint && pnpm build && pnpm test
```

The suite must be **100% green** on every supported Node version. The old Node 26 `localStorage`
problem is resolved by `packages/web/tests/setup.ts`; if it returns, it is a real regression,
not an environment pitfall.

## What to tell the user

1. Path to the generated report.
2. Whether `CLAUDE.md` was updated and what changed (or that no update was needed).
3. Actual lint/build/test results.
4. **Do not commit or push** — only when the owner instructs you to.
