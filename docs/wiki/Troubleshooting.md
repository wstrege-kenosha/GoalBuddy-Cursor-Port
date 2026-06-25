# Troubleshooting

## `doctor` fails after install

- Node **>= 18** required.
- Re-run: `node scripts/install-from-repo.mjs`
- Restart Cursor so agents, commands, and MCP reload.
- Check `doctor` output for `mcp:cursor-curator` and `mcp:smoke` lines.

## Two `curator` MCP servers in Settings

Install may write `curator` to both `~/.cursor/mcp.json` (global) and the project `.cursor/mcp.json` (when install runs from this repo). Cursor can show both when this repo is open.

Disable one in **Cursor Settings → MCP** if you prefer a single entry. Keep the **user-level** entry if you use `/objective` in other workspaces; keep the **project** entry only if you never leave this repo.

Restart Cursor after changes.

## MCP tools not available in chat

Re-run install (restores user-level `~/.cursor/mcp.json`):

```bash
npm install
npm run install:cursor
```

For a full wipe and fresh copy of skills (fixes stale board/MCP code):

```bash
npm run build
node cursor-curator/dist/cli/curator.mjs reinstall --clean
```

Restart Cursor after reinstall.

User-level MCP uses a launcher script that loads the server from your cloned repo (where `npm install` put `@modelcontextprotocol/sdk`). If MCP fails to start, confirm you ran `npm install` in Cursor-Curator and that `~/.cursor/skills/cursor-curator/.cursor-curator-port.json` points at that clone.

## MCP resolves the wrong workspace (EISDIR / state.json not found)

Global `~/.cursor/mcp.json` used to launch Cursor Curator with `cwd` at your user home directory and cache that path as `CURATOR_WORKSPACE` at MCP startup. Cursor Curator 2.0+ re-reads Cursor's `WORKSPACE_FOLDER_PATHS` (and related editor env vars) on **every tool call**, so the open project wins even when a stale home path was cached earlier.

If `/objective` still fails:

1. Open the **project that contains the objective** (e.g. `W:\Experimental\Cursor CuratorCursorPort` for `cursor-curator`).
2. Add a project `.cursor/mcp.json` in that repo so Cursor scopes MCP to that workspace:

   ```json
   {
     "mcpServers": {
       "cursor-curator": {
         "command": "node",
         "args": ["C:\\Users\\YOU\\.cursor\\skills\\cursor-curator\\scripts\\run-mcp-server.mjs"],
         "cwd": "."
       }
     }
   }
   ```

   `"cwd": "."` tells Cursor to launch MCP from the open workspace root (required when global config would otherwise use `$HOME`).

3. Re-run install from Cursor-Curator (updates user-level MCP to include `"cwd": "."` too):

   ```bash
   npm install
   npm run install:cursor
   ```

4. Restart Cursor and confirm **Settings → MCP → cursor-curator** is enabled (disable duplicate entries if both global and project configs appear).
5. Run `node cursor-curator/dist/cli/curator.mjs doctor` **from the objective's repo root**, not from `$HOME`.

When MCP tools run, check `workspace_root` in `list_objectives` output — it should match the repo that contains `docs/objectives/<slug>/`, not `C:\Users\...`.

Doctor `mcp:smoke` must pass against `docs/objectives/sample-cursor-smoke/state.json` in the repo you have open.

## Board URL does not open

- Use http://127.0.0.1:41737/ (hub) or http://127.0.0.1:41737/<slug>/ if `curator.localhost` does not resolve.
- Start the board: `node cursor-curator/dist/cli/curator.mjs board docs/objectives/<slug>`

## Task subagents missing

```bash
node ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs install
```

Restart Cursor.

## `check-objective-state` / `validate_state` errors

- Done tasks need structured `receipt` blocks in `state.json`.
- Worker receipts need `changed_files`, `commands` with `status: pass`.
- `active_task` must point to the one task with `status: active`.

## `curator` command not found

Re-run install from Cursor-Curator:

```bash
npm run install:cursor
```

Add `%USERPROFILE%\.cursor\bin` (Windows) or `~/.cursor/bin` (macOS/Linux) to PATH, then open a **new** terminal. Or invoke directly:

```powershell
& "$env:USERPROFILE\.cursor\bin\cursor-curator.cmd" doctor
```

## Publish this wiki from the repo

Run `node scripts/publish-wiki.mjs` after the GitHub wiki git repo exists (create the first page in the GitHub wiki UI if `git push` fails). Source pages live in `docs/wiki/`.
