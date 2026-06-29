# Troubleshooting

## `doctor` fails after install

- **Bun** is required (`bun --version`).
- Re-run: `bun scripts/install-from-repo.mjs`
- Restart Cursor so agents, commands, and MCP reload.
- Check `doctor` output for `mcp:cursor-curator` and `mcp:smoke` lines.

## Two `curator` MCP servers in Settings

Install may write `curator` to both `~/.cursor/mcp.json` (global) and the project `.cursor/mcp.json` (when install runs from this repo). Cursor can show both when this repo is open.

Disable one in **Cursor Settings → MCP** if you prefer a single entry. Keep the **user-level** entry if you use `/objective` in other workspaces; keep the **project** entry only if you never leave this repo.

Restart Cursor after changes.

## MCP tools not available in chat

Re-run install (restores user-level `~/.cursor/mcp.json`):

```bash
bun install
bun run install:cursor
```

For a full wipe and fresh copy of skills (fixes stale board/MCP code):

```bash
bun run build
bun cursor-curator/dist/cli/curator.mjs reinstall --clean
```

Restart Cursor after reinstall.

User-level MCP uses a Bun launcher that loads the server from your cloned repo (where `bun install` put `@modelcontextprotocol/sdk`). If MCP fails to start, confirm you ran `bun install` in Cursor-Curator and that `~/.cursor/skills/cursor-curator/.cursor-curator-port.json` points at that clone.

## MCP resolves the wrong workspace (objective not in database)

Global `~/.cursor/mcp.json` used to launch Cursor Curator with `cwd` at your user home directory and cache that path as `CURATOR_WORKSPACE` at MCP startup. Cursor Curator 2.0+ re-reads Cursor's `WORKSPACE_FOLDER_PATHS` (and related editor env vars) on **every tool call**, so the open project wins even when a stale home path was cached earlier.

If `/objective` still fails:

1. Open the **project that contains the objective** (e.g. `W:\Experimental\Cursor CuratorCursorPort` for `cursor-curator`).
2. Add a project `.cursor/mcp.json` in that repo so Cursor scopes MCP to that workspace:

   ```json
   {
     "mcpServers": {
       "cursor-curator": {
         "command": "bun",
         "args": ["C:\\Users\\YOU\\.cursor\\skills\\cursor-curator\\dist\\mcp\\server.mjs"],
         "cwd": "."
       }
     }
   }
   ```

   `"cwd": "."` tells Cursor to launch MCP from the open workspace root (required when global config would otherwise use `$HOME`).

3. Re-run install from Cursor-Curator (updates user-level MCP to include `"cwd": "."` too):

   ```bash
   bun install
   bun run install:cursor
   ```

4. Restart Cursor and confirm **Settings → MCP → cursor-curator** is enabled (disable duplicate entries if both global and project configs appear).
5. Run `bun cursor-curator/dist/cli/curator.mjs doctor` **from the objective's repo root**, not from `$HOME`.

When MCP tools run, check `workspace_root` in `list_objectives` output — it should match the repo that contains `docs/objectives/<slug>/`, not `C:\Users\...`.

Doctor `mcp:smoke` must pass against `sample-cursor-smoke` in `.cursor-curator/curator.db` (run `curator db import` if the slug is missing).

## Board URL does not open

- Use http://127.0.0.1:41737/ (hub) or http://127.0.0.1:41737/<slug>/ if `curator.localhost` does not resolve.
- Start the board: `bun cursor-curator/dist/cli/curator.mjs board docs/objectives/<slug>`

## Board shows no time or token usage

1. Re-run install so hooks are merged into `~/.cursor/hooks.json`:

   ```bash
   bun run build
   bun cursor-curator/dist/cli/curator.mjs install
   ```

2. Restart Cursor (hooks reload on restart if they do not pick up immediately).
3. Confirm **Cursor Settings → Hooks** lists `stop` and `subagentStop` entries pointing at `append-usage-metrics.mjs`.
4. Run an `/objective` turn with a Task subagent (`objective-scout`, `objective-worker`, or `objective-approval-gate`) — `subagentStop` gives the best per-task attribution.
5. Check `docs/objectives/<slug>/notes/usage.json` exists and grows after agent sessions.
6. On **Windows**, hooks must write files directly (Cursor Curator does); if hooks run but `usage.json` is empty, check the Hooks output channel for script errors.
7. Older Cursor builds may omit token fields on the `stop` payload — duration may still record; upgrade Cursor if all counters stay zero.

Unattributed sessions (board warning) usually mean `active_task` was not `active` when the hook fired — common during PM planning turns.

## Parent board shows parent-only time; child time missing

Usage for subobjectives lives in **separate files**, not in the parent rollup on disk:

| File | Scope |
|------|--------|
| `docs/objectives/<slug>/notes/usage.json` | Parent objective sessions |
| `docs/objectives/<slug>/subobjectives/<child>/notes/usage.json` | Child objective sessions |

The parent board, hub card, `get_usage_summary`, and `curator usage` **merge child rollups at read time** when state lists a depth-1 `subobjective.path`. If the parent shows only parent agent time:

1. Confirm hooks ran inside the **child** workspace path (child objective dir), not only the parent.
2. Check that `subobjectives/<name>/notes/usage.json` exists and `rollup.session_count` grows after child Task runs.
3. Re-open or refresh the board — totals are computed on each payload build, not cached into the parent file.
4. Compare surfaces: `curator usage <slug> --json` and the board progress rail should report the same merged `duration_ms` and `session_count`.

A missing child file is treated as zero usage for that subobjective; the parent file alone still displays.

## Task subagents missing

```bash
bun ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs install
```

Restart Cursor.

## `check-objective` / `validate_state` errors

- Done tasks need structured `receipt` blocks in the workspace database (via `apply_receipt`).
- Worker receipts need `changed_files`, `commands` with `status: pass`.
- `active_task` must point to the one task with `status: active`.

## `curator` command not found

Re-run install from Cursor-Curator:

```bash
bun run install:cursor
```

Install adds `~/.cursor/bin` to User PATH by default; open a **new** terminal so `curator` resolves. If you used `--no-add-to-path`, add `%USERPROFILE%\.cursor\bin` (Windows) or `~/.cursor/bin` (macOS/Linux) manually. Or invoke directly:

```powershell
& "$env:USERPROFILE\.cursor\bin\curator.cmd" doctor
```

## Publish this wiki from the repo

Run `bun scripts/publish-wiki.mjs` after the GitHub wiki git repo exists (create the first page in the GitHub wiki UI if `git push` fails). Source pages live in `docs/wiki/`.
