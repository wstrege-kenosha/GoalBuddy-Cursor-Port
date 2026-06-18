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
