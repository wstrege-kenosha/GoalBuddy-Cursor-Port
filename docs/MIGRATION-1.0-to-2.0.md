# Migrate Cursor Curator 1.0.0 → 2.0.0

> **Note (2.1.0):** SDK auto-loop (`run --auto N`) described in this guide was **removed** in port 2.1.0. See [MIGRATION-2.0-to-2.1.md](MIGRATION-2.0-to-2.1.md).

Use this guide if you installed the port at **1.0.0** and are upgrading to **2.0.0**. Your existing `docs/objectives/*/state.yaml` boards are compatible — no schema migration is required.

## What changed (summary)

| Area | 1.0.0 | 2.0.0 |
|------|-------|-------|
| `/objective` PM loop | CLI + ad hoc file reads | **MCP tools required** (`validate_state`, `render_task_prompt`, `validate_receipt`) |
| Install | Skills + agents/commands | Also merges **cursor-curator MCP** into `.cursor/mcp.json` |
| Board hub | Per-goal URL only | **Multi-objective hub** at `/` plus per-objective boards |
| Auto-loop | Manual `/objective` each turn | Optional `run --auto N` via `@cursor/sdk` |
| Repo deps | Node only | `npm install` + `npm run build` (`@modelcontextprotocol/sdk`, `@cursor/sdk`) |
| Agent prompts | Pre-MCP | Reference MCP tools (scout/approval_gate/worker) |
| Doctor | Files + agents | Adds **MCP config** + smoke test |

**Not breaking:** `state.yaml` v2, `curator-prep`, local board URLs, `check-objective-state.mjs`, existing goal directories.

---

## Quick upgrade (most users)

From your cloned repo (or after `git pull`):

```bash
cd Cursor-Curator
npm install
npm run install:cursor
```

Then in Cursor:

1. **Settings → MCP** — enable the `curator` server (should appear after install).
2. **Restart Cursor** (agents, commands, and MCP reload).
3. Verify:

```bash
npm run check
node curator/scripts/curator.mjs doctor --objective-ready
```

Confirm `cursorPortVersion` is **2.0.0**:

```bash
node -e "console.log(require('./cursor-curator/version.json').cursorPortVersion)"
```

---

## Step-by-step migration

### 1. Update the repo

```bash
cd Cursor-Curator
git pull
```

If you installed without cloning (copied files manually), re-clone or copy the full `cursor-curator/` tree and new `packages/` folder.

### 2. Install new dependencies and build

2.0.0 adds npm workspaces and the `@cursor-curator/runner` package:

```bash
npm install
npm run build
```

Required for `npm run check` and `curator run`.

### 3. Refresh Cursor surfaces

```bash
node scripts/install-from-repo.mjs
```

Or:

```bash
npm run install:cursor
```

This:

- Overwrites `~/.cursor/skills/cursor-curator` and `curator-prep` (use `--force` on `curator.mjs install` if agents were hand-edited)
- Re-installs `goal-scout`, `goal-approval-gate`, `goal-worker` agents
- Updates `/objective`, `/curator-prep`, `/objective-board` commands
- Merges MCP config into `~/.cursor/mcp.json` (global, all workspaces) and into `<repo>/.cursor/mcp.json` when install runs from this repo (portable paths for contributors).

To force-overwrite agents/commands that you did not customize:

```bash
node ~/.cursor/skills/cursor-curator/scripts/curator.mjs install --force
```

### 4. Enable the cursor-curator MCP server

Install writes **user-level** MCP (`~/.cursor/mcp.json`) so `/objective` works in any workspace. When you run install from this repo, it also merges a portable project entry:

```json
{
  "mcpServers": {
    "cursor-curator": {
      "command": "node",
      "args": ["cursor-curator/mcp/server.mjs"]
    }
  }
}
```

You may see two `curator` entries when this repo is open (user + project). Both should work; disable one in **Cursor Settings → MCP** if the duplicate bothers you. In other workspaces, only the user-level entry applies.

Restart Cursor if it was already open during install.

### 5. Restart Cursor

Required so:

- Updated `/objective` command (MCP-gated) loads
- `objective-*.md` agent prompts reload
- MCP server connects

### 6. Verify

```bash
node curator/scripts/curator.mjs doctor --objective-ready
```

Expect:

- `ok mcp:cursor-curator`
- `ok mcp:smoke`

Smoke-test an existing objective:

```bash
node curator/scripts/check-objective-state.mjs docs/objectives/<your-slug>/state.yaml
node curator/scripts/curator.mjs hub --json
```

### 7. (Optional) SDK auto-loop

Only if you want batch turns without re-invoking `/objective` each time:

1. Create an API key: [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations)
2. `export CURSOR_API_KEY="cursor_..."`
3. Run:

```bash
node curator/scripts/curator.mjs run docs/objectives/<slug> --auto 3
```

`/objective` still works for manual single-turn control. Auto-loop is optional.

---

## Changes to your workflow

### `/objective` (manual PM loop)

**Before (1.0.0):** PM read `state.yaml`, ran `curator.mjs prompt`, spawned Task, edited state, optionally ran `check-objective-state`.

**After (2.0.0):** Same flow, but `/objective` instructs the PM to call MCP tools:

1. `get_active_task` → `validate_state`
2. `render_task_prompt` → Task spawn
3. `validate_receipt` → PM writes state
4. `validate_state` → `append_session_note`

If MCP is disabled, `/objective` tells the PM to stop and run `curator install` — CLI-only fallback is documented in `SKILL.md` but not the primary path.

### Local board

- **Hub (new):** http://curator.localhost:41737/ — all goals under `docs/objectives/`
- **Per objective:** http://curator.localhost:41737/<slug>/
- **Smart open:** `/open` redirects to your preferred board (if configured)

No change to `state.yaml` or board generation.

### New CLI commands (optional)

```bash
node curator/scripts/curator.mjs receipt <file|json> --role worker
node curator/scripts/curator.mjs completion-check docs/objectives/<slug>
node curator/scripts/curator.mjs stale --days 7
node curator/scripts/curator.mjs hub --json
```

---

## Troubleshooting upgrade issues

### `doctor` fails on `mcp:cursor-curator`

- Run `node curator/scripts/curator.mjs install` again.
- Check `.cursor/mcp.json` in the repo and `~/.cursor/mcp.json`.
- Enable the server in Cursor MCP settings.

### `/objective` does not call MCP tools

- Confirm MCP is enabled and Cursor was restarted after install.
- Re-run `install --force` to refresh `~/.cursor/commands/objective.md`.

### `npm run check` fails

```bash
npm install
npm run build
npm run check
```

### `run --auto N` says `CURSOR_API_KEY` required

Expected without an API key. Use `/objective` for manual control, or set `CURSOR_API_KEY` for SDK runs.

### Custom edits to agents or `/objective`

`install` skips overwriting changed files unless `--force`. To take 2.0.0 prompts:

```bash
node ~/.cursor/skills/cursor-curator/scripts/curator.mjs install --force
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

Disable or remove the `curator` entry from `.cursor/mcp.json`. Restart Cursor.

Your `docs/objectives/` data is unchanged either way.

---

## Checklist

- [ ] `git pull` (or fresh clone) to 2.0.0
- [ ] `npm install && npm run build`
- [ ] `npm run install:cursor`
- [ ] `curator` MCP enabled in Cursor settings
- [ ] Cursor restarted
- [ ] `doctor --objective-ready` green (`mcp:cursor-curator`, `mcp:smoke`)
- [ ] One `/objective` turn on an active goal (MCP tools invoked)
- [ ] (Optional) `CURSOR_API_KEY` + `run --auto 1` tested
