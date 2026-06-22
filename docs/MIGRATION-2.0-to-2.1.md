# Migration 2.0 → 2.1

Cursor Curator **2.1.0** removes the experimental SDK auto-loop and simplifies install.

## What changed

| 2.0.0 | 2.1.0 |
|-------|-------|
| Optional `curator run <slug> --auto N` | **Removed** — use `/objective` in Cursor chat |
| `@cursor/sdk`, `@cursor-curator/runner`, TypeScript build | **Removed** |
| `npm run check` runs `npm run build` first | `npm run check` runs tests + doctor only |
| `CURSOR_API_KEY` for batch runs | **Not used** |

## Upgrade steps

From your Cursor-Curator clone:

```bash
git pull
npm install
npm run install:cursor
```

Re-run `npm run install:cursor` so `~/.cursor/skills/cursor-curator` and the global `curator` CLI are refreshed.

## How to run goals now

1. Open the project that contains `docs/objectives/<slug>/` in Cursor.
2. Enable the **cursor-curator** MCP server in Settings → MCP.
3. Run `/objective Follow docs/objectives/<slug>/objective.md.` each turn until the goal completes.

Optional CLI helpers (add `~/.cursor/bin` to PATH):

```bash
curator doctor --objective-ready
curator board docs/objectives/<slug>
curator completion-check docs/objectives/<slug>
```

## If you relied on `run --auto N`

There is no drop-in replacement in 2.1.0. The supported path is the manual PM loop with MCP gates—the same validators the SDK runner used, but with you (or the main Cursor agent via `/objective`) driving each turn.

Historical 2.0 docs that mention SDK auto-loop are outdated; see [MIGRATION-1.0-to-2.0.md](MIGRATION-1.0-to-2.0.md) banner.
