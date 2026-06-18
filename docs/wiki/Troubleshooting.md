# Troubleshooting

## `doctor` fails after install

- Node **>= 18** required.
- Re-run: `node scripts/install-from-repo.mjs`
- Restart Cursor so agents, commands, and MCP reload.
- Check `doctor` output for `mcp:goalbuddy` and `mcp:smoke` lines.

## Two `goalbuddy` MCP servers in Settings

Install may write `goalbuddy` to both `~/.cursor/mcp.json` (global) and the project `.cursor/mcp.json` (when install runs from this repo). Cursor can show both when this repo is open.

Disable one in **Cursor Settings → MCP** if you prefer a single entry. Keep the **user-level** entry if you use `/goal` in other workspaces; keep the **project** entry only if you never leave this repo.

Restart Cursor after changes.

## MCP tools not available in chat

Re-run install (restores user-level `~/.cursor/mcp.json`):

```bash
npm install
npm run install:cursor
```

User-level MCP uses a launcher script that loads the server from your cloned repo (where `npm install` put `@modelcontextprotocol/sdk`). If MCP fails to start, confirm you ran `npm install` in GoalBuddy-Cursor-Port and that `~/.cursor/skills/goalbuddy/.goalbuddy-port.json` points at that clone.

## MCP resolves the wrong workspace (EISDIR / state.yaml not found)

Global `~/.cursor/mcp.json` used to launch GoalBuddy with `cwd` at your user home directory and cache that path as `GOALBUDDY_WORKSPACE` at MCP startup. GoalBuddy 2.0+ re-reads Cursor's `WORKSPACE_FOLDER_PATHS` (and related editor env vars) on **every tool call**, so the open project wins even when a stale home path was cached earlier.

If `/goal` still fails:

1. Open the **project that contains the goal** (e.g. `W:\Experimental\GoalBuddyCursorPort` for `goalbuddy-cursor-port`).
2. Add a project `.cursor/mcp.json` in that repo so Cursor scopes MCP to that workspace:

   ```json
   {
     "mcpServers": {
       "goalbuddy": {
         "command": "node",
         "args": ["C:\\Users\\YOU\\.cursor\\skills\\goalbuddy\\scripts\\run-mcp-server.mjs"],
         "cwd": "."
       }
     }
   }
   ```

   `"cwd": "."` tells Cursor to launch MCP from the open workspace root (required when global config would otherwise use `$HOME`).

3. Re-run install from GoalBuddy-Cursor-Port (updates user-level MCP to include `"cwd": "."` too):

   ```bash
   npm install
   npm run install:cursor
   ```

4. Restart Cursor and confirm **Settings → MCP → goalbuddy** is enabled (disable duplicate entries if both global and project configs appear).
5. Run `node goalbuddy/scripts/goalbuddy.mjs doctor` **from the goal's repo root**, not from `$HOME`.

When MCP tools run, check `workspace_root` in `list_goals` output — it should match the repo that contains `docs/goals/<slug>/`, not `C:\Users\...`.

Doctor `mcp:smoke` must pass against `docs/goals/sample-cursor-smoke/state.yaml` in the repo you have open.

## Board URL does not open

- Use http://127.0.0.1:41737/ (hub) or http://127.0.0.1:41737/<slug>/ if `goalbuddy.localhost` does not resolve.
- Start the board: `node goalbuddy/scripts/goalbuddy.mjs board docs/goals/<slug>`

## Task subagents missing

```bash
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs install
```

Restart Cursor.

## `check-goal-state` / `validate_state` errors

- Done tasks need structured `receipt` blocks in `state.yaml`.
- Worker receipts need `changed_files`, `commands` with `status: pass`.
- `active_task` must point to the one task with `status: active`.

## `run --auto N` fails immediately

- Set `CURSOR_API_KEY` from [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations).
- Run `npm install` and `npm run build` so `@goalbuddy/runner` is compiled.
- Use `--dry-run` with `GOALBUDDY_MOCK_AGENT_TEXT` to test the loop without the API.

## Publish this wiki from the repo

See `docs/goals/github-wiki/notes/publish-wiki-operator.md` or run `node scripts/publish-wiki.mjs` after the GitHub wiki git repo exists (create the first page in the GitHub wiki UI if `git push` fails).
