# Usage

## In Cursor

1. `/goal-prep` — describe your outcome; GoalBuddy scaffolds `docs/goals/<slug>/` in your workspace.
2. `/goal Follow docs/goals/<slug>/goal.md.` — PM runs Scout → Judge → Worker with a live board.

## CLI (after install)

```bash
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs doctor --goal-ready
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs board docs/goals/<slug>
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs prompt docs/goals/<slug> --task T001 --json
```

## Local board

Open http://goalbuddy.localhost:41737/<slug>/ (or http://127.0.0.1:41737/<slug>/ if `.localhost` does not resolve).

## Repo layout

| Path | Purpose |
|------|---------|
| `goalbuddy/` | Main skill (scripts, agents, board) |
| `goal-prep/` | Prep skill |
| `scripts/install-from-repo.mjs` | Install into `~/.cursor/skills` |
