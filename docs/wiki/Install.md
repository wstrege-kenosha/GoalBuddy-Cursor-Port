# Install

**Upgrading from 2.0.0?** See [Migration 2.0 → 2.1](Migration-2.0-to-2.1) or `docs/MIGRATION-2.0-to-2.1.md` in the repo.

**Upgrading from 1.0.0?** See [Migration 1.0 → 2.0](Migration-1.0-to-2.0) or `docs/MIGRATION-1.0-to-2.0.md` in the repo.

## Clone

```bash
git clone https://github.com/wstrege-kenosha/Cursor-Curator.git
cd Cursor-Curator
npm install
node scripts/install-from-repo.mjs
```

Or:

```bash
npm run install:cursor
```

The installer:

1. Copies `cursor-curator/` and `objective-prep/` into `~/.cursor/skills` (macOS/Linux) or `%USERPROFILE%\.cursor\skills` (Windows)
2. Runs `curator.mjs install` to register agents (`objective-scout`, `objective-approval-gate`, `objective-worker`) and slash commands (`/objective-prep`, `/objective`, `/objective-board`)
3. Installs a global `curator` CLI shim to `~/.cursor/bin`
4. Merges the **cursor-curator** MCP server into `~/.cursor/mcp.json` (launcher script + repo path for npm deps) and, when run from this repo, also into the project `.cursor/mcp.json` (portable paths for contributors).

Requires `npm install` in the cloned repo first so MCP dependencies exist under `node_modules/`.

## Enable MCP

After install, open **Cursor Settings → MCP** and confirm the `curator` server is enabled. `/objective` requires MCP tools for validation and prompt rendering.

Cursor Curator resolves the workspace from the objective slug automatically. When you create an objective in **another repo**, run once from that repo root:

```bash
curator workspace register
```

`/objective-prep` runs this step automatically. `doctor` also registers the current repo when `docs/objectives/` exists.

Project config (in the cloned repo):

```json
{
  "mcpServers": {
    "cursor-curator": {
      "command": "node",
      "args": ["cursor-curator/mcp/server.mjs"],
      "cwd": "."
    }
  }
}
```

## Verify

```bash
npm run check
node curator/scripts/curator.mjs doctor
node curator/scripts/curator.mjs doctor --objective-ready
```

Doctor checks Node, skill files, installed agents/commands, MCP config, and runs an MCP smoke test on `sample-cursor-smoke`.

Add `%USERPROFILE%\.cursor\bin` to PATH (once) so `curator doctor` and `curator board` work from any repo with `docs/objectives/`.

## Smoke objective

```bash
node curator/scripts/check-objective-state.mjs docs/objectives/sample-cursor-smoke/state.yaml
node curator/scripts/curator.mjs board docs/objectives/sample-cursor-smoke
```

Hub: http://curator.localhost:41737/ — see [Usage](Usage) and `docs/objectives/sample-cursor-smoke/objective.md`.
