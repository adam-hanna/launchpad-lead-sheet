# CLAUDE.md

Conventions for working in this repository. `docs/plan.md` is normative for behaviour; `docs/roadmap.md` is
the source of truth for planned work.

## What this is

A browser companion app (macOS, Chromium, Web MIDI) that follows Ableton Live over MIDI clock and lights a
Launchpad Pro MK3 with the current bar's key and chord tones. No Max for Live, no Remote Script.

## Layout

- `src/core` — framework-free domain logic (theory, sheet, sync, grid, lighting, routing). No DOM, no
  React, no imports from `@adapters` or `@app`. ESLint enforces this. Near-complete unit coverage.
- `src/adapters` — Web MIDI, Launchpad Pro MK3 driver, virtual Launchpad, storage. Behind interfaces
  defined in `core`.
- `src/app` — React + shadcn/ui. Renders state; no domain logic.
- `docs/` — brainstorm, plan, roadmap, ADRs (`docs/adr`), spike results (`docs/spikes`), protocol notes.
- `scripts/roadmap-to-issues.mjs` — mirrors the roadmap into GitHub issues; idempotent by title.

## Commands

`pnpm dev` · `pnpm typecheck` · `pnpm lint` · `pnpm format` · `pnpm test` · `pnpm test:coverage` ·
`pnpm build` · `pnpm e2e`. All of these must pass before a PR is opened. CI runs the same set.

## Workflow

- Work happens in git worktrees under `.worktrees/<slug>` (gitignored), never directly on `develop`.
  Create with `git worktree add .worktrees/<slug> -b <branch> develop`, run `pnpm install` inside it, and
  remove it after the PR merges.
- One branch and PR per epic (`feat/e#.#-<slug>`), one commit per roadmap task. Commit subject
  `M#-T#: <imperative title>`; body explains what and why and ends with `Closes #<issue>`.
- PR body lists `Closes #n` for every task issue (survives squash merge). Squash-merge into `develop`
  once CI is green; `develop` → `main` per release with a tag.
- Plan contracts (§4) are acceptance criteria: every acceptance example becomes an automated test.
- Deviations from the plan get an ADR in `docs/adr` and a plan edit in the same PR. Deviations from an
  issue's description get a comment on the issue.
- New planned work: add a task line to `docs/roadmap.md` (keep the line format) and re-run
  `node scripts/roadmap-to-issues.mjs`. Bugs: `gh issue create` with `type:bug`, no roadmap entry needed.
- Hardware gates (plan §5) are run by the user; results and raw traces land in `docs/spikes/`.

## Style

- TypeScript strict, `exactOptionalPropertyTypes`, no `any`. Prettier formats everything.
- Lighting tests snapshot 8x8 grids with the `grid8x8` serializer (`src/test/gridSnapshot.ts`).
- Colours sent to the device are Launchpad RGB 0–127 or palette indices, never CSS colours.
- MIDI byte values in code are written as hex literals with a comment naming the message.
