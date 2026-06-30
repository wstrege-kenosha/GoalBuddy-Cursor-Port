## Learned User Preferences

- Use Bun exclusively for runtime, scripts, tests, and CLI invocations; do not use Node.
- Prefer TypeScript (`.mts`) over JavaScript (`.mjs`) for application source in this repo.
- Use JSON for state and schemas; do not introduce YAML.
- Use objective/subobjective terminology; avoid goal/subgoal wording in boards, state, and docs.
- Prefer parallel subagents or Workers when safe to finish objectives faster.
- The `/objective` PM loop must use cursor-curator MCP tools; do not bypass MCP for board state reads or writes.
- Objective board session log should stay in a collapsible drawer, not always visible.
- Keep the repo limited to functional code plus `docs/wiki/`; move other documentation out of the repo.
- `curator install` should add the CLI to PATH by default with an opt-out flag.
- Only create git commits or push when explicitly requested.

## Learned Workspace Facts

- Cursor Curator lives under `cursor-curator/`; workspace root is `W:\Experimental\Cursor-Curator`.
- Runtime requires Bun; board state lives in `.cursor-curator/curator.db` (SQLite via `bun:sqlite`); never commit `.cursor-curator/` (gitignored runtime state).
- `docs/objectives/<slug>/state.json` is a legacy import source; runtime truth is SQLite accessed via MCP/CLI.
- Objectives scaffold under `docs/objectives/<slug>/` with `objective.md` and `state.json`.
- Depth-1 subobjectives live at `docs/objectives/<parent>/subobjectives/<segment>/`.
- Agent time and token usage lives in SQLite `usage_sessions` (logical path `db:<slug>#usage`); legacy `notes/usage.json` is imported once on read.
- Local board hub serves at `http://curator.localhost:41737/`.
- Canonical CLI: `bun cursor-curator/dist/cli/curator.mjs <command>` (or global `curator` when PATH is set).
- Install copies skills to `~/.cursor/skills` and registers the cursor-curator MCP server in `.cursor/mcp.json`.
- Multi-root Cursor workspaces pass comma-separated paths in `WORKSPACE_FOLDER_PATHS`; MCP must split them for objective resolution.
- `W:\source\Sanitary_Maintenance_Portal` is reference-only; never modify it.
