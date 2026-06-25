# Install

**Upgrading from 2.0.0?** See [Migration 2.0 → 2.1](Migration-2.0-to-2.1).

**Upgrading from 1.0.0?** See [Migration 1.0 → 2.0](Migration-1.0-to-2.0).

**YAML boards on this fork?** See [Migration 5.0](Migration-5.0).

## Clone

```bash
git clone https://github.com/wstrege-kenosha/Cursor-Curator.git
cd Cursor-Curator
npm install
npm run build
node scripts/install-from-repo.mjs
```

Or:

```bash
npm run install:cursor
```

The installer:

1. Ensures repo `node_modules` and `cursor-curator/dist/` exist (`npm install`, `npm run build` when needed)
2. Copies `cursor-curator/` and `objective-prep/` into `~/.cursor/skills` (macOS/Linux) or `%USERPROFILE%\.cursor\skills` (Windows)
3. Runs `npm install --omit=dev` inside the copied `cursor-curator` skill (bundles `zod`, `yaml`, MCP SDK for skill-only use)
4. Runs `curator.mjs install` to register agents (`objective-scout`, `objective-approval-gate`, `objective-worker`) and slash commands (`/objective-prep`, `/objective`, `/objective-board`)
5. Installs a global `curator` CLI shim to `~/.cursor/bin`
6. Merges the **cursor-curator** MCP server into `~/.cursor/mcp.json` (launcher script + repo path for npm deps) and, when run from this repo, also into the project `.cursor/mcp.json` (portable paths for contributors).

Contributors need `npm install` at the repo root for tests and builds. Skill-only installs after step 3 do not require the clone’s `node_modules` for MCP/board runtime.

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
      "args": ["cursor-curator/dist/mcp/server.mjs"],
      "cwd": "."
    }
  }
}
```

When `dist/mcp/server.mjs` is absent, the launcher falls back to `cursor-curator/mcp/server.mjs` and resolves deps from the skill’s `node_modules` or the registered repo root.

## Verify

```bash
npm run build
npm run check
node cursor-curator/dist/cli/curator.mjs doctor
node cursor-curator/dist/cli/curator.mjs doctor --objective-ready
```

Doctor checks Node, skill files, installed agents/commands, MCP config, and runs an MCP smoke test on `sample-cursor-smoke`.

Add `%USERPROFILE%\.cursor\bin` to PATH (once) so `curator doctor` and `curator board` work from any repo with `docs/objectives/`.

## Clean reinstall

When skills, MCP, or board code look stale after an upgrade:

```bash
npm run build
node cursor-curator/dist/cli/curator.mjs reinstall --clean
```

Or, after the global CLI is on PATH:

```bash
curator reinstall --clean
```

This removes installed skill copies under `~/.cursor/skills`, legacy `curator-prep` / `goalbuddy` artifacts, re-copies from your clone, and re-runs install. **Restart Cursor** afterward and confirm MCP is enabled.

Requires a Cursor-Curator clone with `npm install` (repo root resolved via `CURATOR_REPO_ROOT`, `.cursor-curator-port.json`, or cwd).

## Smoke objective

```bash
node cursor-curator/dist/cli/curator.mjs check-state docs/objectives/sample-cursor-smoke/state.json
node cursor-curator/dist/cli/curator.mjs board docs/objectives/sample-cursor-smoke
```

Hub: http://curator.localhost:41737/ — see [Usage](Usage) and `docs/objectives/sample-cursor-smoke/objective.md`.
