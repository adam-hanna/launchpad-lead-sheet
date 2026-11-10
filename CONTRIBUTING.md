# Contributing

## Setup

```sh
pnpm install
pnpm exec playwright install chromium   # once, for e2e
pnpm dev
```

Node 20+ and pnpm 12 (see `packageManager` in `package.json`).

## Before opening a PR

```sh
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build && pnpm e2e
```

## Branches and commits

- `develop` is the integration branch, `main` is released. PRs target `develop`.
- Branch per epic: `feat/e#.#-<slug>`. One commit per roadmap task, subject `M#-T#: <title>`.
- Squash merge. The PR body lists `Closes #n` for each task issue.
- Releases: merge `develop` into `main`, tag `vX.Y.Z`, write release notes. Pages deploys from `main`.

## Where things are decided

- `docs/plan.md` — scope, architecture, contracts (§4) and the hardware feasibility gate (§5).
- `docs/roadmap.md` — milestones, epics, tasks. Mirrored to GitHub issues by
  `node scripts/roadmap-to-issues.mjs` (idempotent; re-run after editing).
- `docs/adr/` — architecture decision records. Add one when a plan contract changes.
- `docs/spikes/` — hardware gate results and raw MIDI traces.

## Issues

Use the templates (feature, bug, spike). Every issue carries one `area:*` and one `type:*` label; sized
work also carries `size:S|M|L`. Epics are parent issues with sub-issues.
