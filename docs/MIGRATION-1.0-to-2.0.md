# Migrate GoalBuddy Cursor Port 1.0.0 → 2.0.0

> **Note (2.1.0):** SDK auto-loop (`run --auto N`) described in this guide was **removed** in port 2.1.0. See [MIGRATION-2.0-to-2.1.md](MIGRATION-2.0-to-2.1.md).

Use this guide if you installed the port at **1.0.0** and are upgrading to **2.0.0**. Your existing `docs/goals/*/state.yaml` boards are compatible — no schema migration is required.

## What changed (summary)

| Area | 1.0.0 | 2.0.0 |
|------|-------|-------|
| `/goal` PM loop | CLI + ad hoc file reads | **MCP tools required** (`validate_state`, `render_task_prompt`, `validate_receipt`) |
| Install | Skills + agents/commands | Also merges **goalbuddy MCP** into `.cursor/mcp.json` |
| Board hub | Per-goal URL only | **Multi-goal hub** at `/` plus per-goal boards |
| Auto-loop | Manual `/goal` each turn | Optional `run --auto N` via `@cursor/sdk` |
| Repo deps | Node only | `npm install` + `npm run build` (`@modelcontextprotocol/sdk`, `@cursor/sdk`) |
| Agent prompts | Pre-MCP | Reference MCP tools (scout/judge/worker) |
| Doctor | Files + agents | Adds **MCP config** + smoke test |

**Not breaking:** `state.yaml` v2, `goal-prep`, local board URLs, `check-goal-state.mjs`, existing goal directories.

---

## Quick upgrade (most users)

From your cloned repo (or after `git pull`):

```bash
cd GoalBuddy-Cursor-Port
npm install
npm run install:cursor
```

Then in Cursor:

1. **Settings → MCP** — enable the `goalbuddy` server (should appear after install).
2. **Restart Cursor** (agents, commands, and MCP reload).
3. Verify:

```bash
npm run check
node goalbuddy/scripts/goalbuddy.mjs doctor --goal-ready
```

Confirm `cursorPortVersion` is **2.0.0**:

```bash
node -e "console.log(require('./goalbuddy/version.json').cursorPortVersion)"
```

---

## Step-by-step migration

### 1. Update the repo

```bash
cd GoalBuddy-Cursor-Port
git pull
```

If you installed without cloning (copied files manually), re-clone or copy the full `goalbuddy/` tree and new `packages/` folder.

### 2. Install new dependencies and build

2.0.0 adds npm workspaces and the `@goalbuddy/runner` package:

```bash
npm install
npm run build
```

Required for `npm run check` and `goalbuddy run`.

### 3. Refresh Cursor surfaces

```bash
node scripts/install-from-repo.mjs
```

Or:

```bash
npm run install:cursor
```

This:

- Overwrites `~/.cursor/skills/goalbuddy` and `goal-prep` (use `--force` on `goalbuddy.mjs install` if agents were hand-edited)
- Re-installs `goal-scout`, `goal-judge`, `goal-worker` agents
- Updates `/goal`, `/goal-prep`, `/goal-board` commands
- Merges MCP config into `~/.cursor/mcp.json` (global, all workspaces) and into `<repo>/.cursor/mcp.json` when install runs from this repo (portable paths for contributors).

To force-overwrite agents/commands that you did not customize:

```bash
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs install --force
```

### 4. Enable the goalbuddy MCP server

Install writes **user-level** MCP (`~/.cursor/mcp.json`) so `/goal` works in any workspace. When you run install from this repo, it also merges a portable project entry:

```json
{
  "mcpServers": {
    "goalbuddy": {
      "command": "node",
      "args": ["goalbuddy/mcp/server.mjs"]
    }
  }
}
```

You may see two `goalbuddy` entries when this repo is open (user + project). Both should work; disable one in **Cursor Settings → MCP** if the duplicate bothers you. In other workspaces, only the user-level entry applies.

Restart Cursor if it was already open during install.

### 5. Restart Cursor

Required so:

- Updated `/goal` command (MCP-gated) loads
- `goal-*.md` agent prompts reload
- MCP server connects

### 6. Verify

```bash
node goalbuddy/scripts/goalbuddy.mjs doctor --goal-ready
```

Expect:

- `ok mcp:goalbuddy`
- `ok mcp:smoke`

Smoke-test an existing goal:

```bash
node goalbuddy/scripts/check-goal-state.mjs docs/goals/<your-slug>/state.yaml
node goalbuddy/scripts/goalbuddy.mjs hub --json
```

### 7. (Optional) SDK auto-loop

Only if you want batch turns without re-invoking `/goal` each time:

1. Create an API key: [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations)
2. `export CURSOR_API_KEY="cursor_..."`
3. Run:

```bash
node goalbuddy/scripts/goalbuddy.mjs run docs/goals/<slug> --auto 3
```

`/goal` still works for manual single-turn control. Auto-loop is optional.

---

## Changes to your workflow

### `/goal` (manual PM loop)

**Before (1.0.0):** PM read `state.yaml`, ran `goalbuddy.mjs prompt`, spawned Task, edited state, optionally ran `check-goal-state`.

**After (2.0.0):** Same flow, but `/goal` instructs the PM to call MCP tools:

1. `get_active_task` → `validate_state`
2. `render_task_prompt` → Task spawn
3. `validate_receipt` → PM writes state
4. `validate_state` → `append_session_note`

If MCP is disabled, `/goal` tells the PM to stop and run `goalbuddy install` — CLI-only fallback is documented in `SKILL.md` but not the primary path.

### Local board

- **Hub (new):** http://goalbuddy.localhost:41737/ — all goals under `docs/goals/`
- **Per goal:** http://goalbuddy.localhost:41737/<slug>/
- **Smart open:** `/open` redirects to your preferred board (if configured)

No change to `state.yaml` or board generation.

### New CLI commands (optional)

```bash
node goalbuddy/scripts/goalbuddy.mjs receipt <file|json> --role worker
node goalbuddy/scripts/goalbuddy.mjs completion-check docs/goals/<slug>
node goalbuddy/scripts/goalbuddy.mjs stale --days 7
node goalbuddy/scripts/goalbuddy.mjs hub --json
```

---

## Troubleshooting upgrade issues

### `doctor` fails on `mcp:goalbuddy`

- Run `node goalbuddy/scripts/goalbuddy.mjs install` again.
- Check `.cursor/mcp.json` in the repo and `~/.cursor/mcp.json`.
- Enable the server in Cursor MCP settings.

### `/goal` does not call MCP tools

- Confirm MCP is enabled and Cursor was restarted after install.
- Re-run `install --force` to refresh `~/.cursor/commands/goal.md`.

### `npm run check` fails

```bash
npm install
npm run build
npm run check
```

### `run --auto N` says `CURSOR_API_KEY` required

Expected without an API key. Use `/goal` for manual control, or set `CURSOR_API_KEY` for SDK runs.

### Custom edits to agents or `/goal`

`install` skips overwriting changed files unless `--force`. To take 2.0.0 prompts:

```bash
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs install --force
```

Back up custom edits first.

---

## Rollback to 1.0.0

If you need to revert:

```bash
git checkout v1.0.0   # or the 1.0.0 tag/commit
npm install
node scripts/install-from-repo.mjs
```

Disable or remove the `goalbuddy` entry from `.cursor/mcp.json`. Restart Cursor.

Your `docs/goals/` data is unchanged either way.

---

## Checklist

- [ ] `git pull` (or fresh clone) to 2.0.0
- [ ] `npm install && npm run build`
- [ ] `npm run install:cursor`
- [ ] `goalbuddy` MCP enabled in Cursor settings
- [ ] Cursor restarted
- [ ] `doctor --goal-ready` green (`mcp:goalbuddy`, `mcp:smoke`)
- [ ] One `/goal` turn on an active goal (MCP tools invoked)
- [ ] (Optional) `CURSOR_API_KEY` + `run --auto 1` tested
