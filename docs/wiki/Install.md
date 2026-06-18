# Install

**Upgrading from 2.0.0?** See [Migration 2.0 → 2.1](Migration-2.0-to-2.1) or `docs/MIGRATION-2.0-to-2.1.md` in the repo.

**Upgrading from 1.0.0?** See [Migration 1.0 → 2.0](Migration-1.0-to-2.0) or `docs/MIGRATION-1.0-to-2.0.md` in the repo.

## Clone

```bash
git clone https://github.com/wstrege-kenosha/GoalBuddy-Cursor-Port.git
cd GoalBuddy-Cursor-Port
npm install
node scripts/install-from-repo.mjs
```

Or:

```bash
npm run install:cursor
```

The installer:

1. Copies `goalbuddy/` and `goal-prep/` into `~/.cursor/skills` (macOS/Linux) or `%USERPROFILE%\.cursor\skills` (Windows)
2. Runs `goalbuddy.mjs install` to register agents (`goal-scout`, `goal-judge`, `goal-worker`) and slash commands (`/goal-prep`, `/goal`, `/goal-board`)
3. Installs a global `goalbuddy` CLI shim to `~/.cursor/bin`
4. Merges the **goalbuddy** MCP server into `~/.cursor/mcp.json` (launcher script + repo path for npm deps) and, when run from this repo, also into the project `.cursor/mcp.json` (portable paths for contributors).

Requires `npm install` in the cloned repo first so MCP dependencies exist under `node_modules/`.

## Enable MCP

After install, open **Cursor Settings → MCP** and confirm the `goalbuddy` server is enabled. `/goal` requires MCP tools for validation and prompt rendering.

GoalBuddy resolves the workspace from the goal slug automatically. When you create a goal in **another repo**, run once from that repo root:

```bash
goalbuddy workspace register
```

`/goal-prep` runs this step automatically. `doctor` also registers the current repo when `docs/goals/` exists.

Project config (in the cloned repo):

```json
{
  "mcpServers": {
    "goalbuddy": {
      "command": "node",
      "args": ["goalbuddy/mcp/server.mjs"],
      "cwd": "."
    }
  }
}
```

## Verify

```bash
npm run check
node goalbuddy/scripts/goalbuddy.mjs doctor
node goalbuddy/scripts/goalbuddy.mjs doctor --goal-ready
```

Doctor checks Node, skill files, installed agents/commands, MCP config, and runs an MCP smoke test on `sample-cursor-smoke`.

Add `%USERPROFILE%\.cursor\bin` to PATH (once) so `goalbuddy doctor` and `goalbuddy board` work from any repo with `docs/goals/`.

## Smoke goal

```bash
node goalbuddy/scripts/check-goal-state.mjs docs/goals/sample-cursor-smoke/state.yaml
node goalbuddy/scripts/goalbuddy.mjs board docs/goals/sample-cursor-smoke
```

Hub: http://goalbuddy.localhost:41737/ — see [Usage](Usage) and `docs/goals/sample-cursor-smoke/goal.md`.
