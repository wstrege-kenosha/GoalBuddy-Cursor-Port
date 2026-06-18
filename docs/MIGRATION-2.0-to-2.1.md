# Migration 2.0 → 2.1

GoalBuddy Cursor Port **2.1.0** removes the experimental SDK auto-loop and simplifies install.

## What changed

| 2.0.0 | 2.1.0 |
|-------|-------|
| Optional `goalbuddy run <slug> --auto N` | **Removed** — use `/goal` in Cursor chat |
| `@cursor/sdk`, `@goalbuddy/runner`, TypeScript build | **Removed** |
| `npm run check` runs `npm run build` first | `npm run check` runs tests + doctor only |
| `CURSOR_API_KEY` for batch runs | **Not used** |

## Upgrade steps

From your GoalBuddy-Cursor-Port clone:

```bash
git pull
npm install
npm run install:cursor
```

Re-run `npm run install:cursor` so `~/.cursor/skills/goalbuddy` and the global `goalbuddy` CLI are refreshed.

## How to run goals now

1. Open the project that contains `docs/goals/<slug>/` in Cursor.
2. Enable the **goalbuddy** MCP server in Settings → MCP.
3. Run `/goal Follow docs/goals/<slug>/goal.md.` each turn until the goal completes.

Optional CLI helpers (add `~/.cursor/bin` to PATH):

```bash
goalbuddy doctor --goal-ready
goalbuddy board docs/goals/<slug>
goalbuddy completion-check docs/goals/<slug>
```

## If you relied on `run --auto N`

There is no drop-in replacement in 2.1.0. The supported path is the manual PM loop with MCP gates—the same validators the SDK runner used, but with you (or the main Cursor agent via `/goal`) driving each turn.

Historical 2.0 docs that mention SDK auto-loop are outdated; see [MIGRATION-1.0-to-2.0.md](MIGRATION-1.0-to-2.0.md) banner.
