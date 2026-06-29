# Install

**Upgrading from Node/npm?** See [Migration Node → Bun](Migration-Node-to-Bun).

**Upgrading from 2.0.0?** See [Migration 2.0 → 2.1](Migration-2.0-to-2.1).

**Upgrading from 1.0.0?** See [Migration 1.0 → 2.0](Migration-1.0-to-2.0).

**YAML boards on this fork?** See [Migration 5.0](Migration-5.0).

## Prerequisites

[Bun](https://bun.sh) is required. Install from [bun.sh](https://bun.sh) if `bun --version` is not available.

## Clone

```bash
git clone https://github.com/wstrege-kenosha/Cursor-Curator.git
cd Cursor-Curator
bun install
bun run build
bun scripts/install-from-repo.mjs
```

Or:

```bash
bun run install:cursor
```

The installer:

1. Ensures repo `node_modules` and `cursor-curator/dist/` exist (`bun install`, `bun run build` when needed)
2. Copies `cursor-curator/` and `objective-prep/` into `~/.cursor/skills` (macOS/Linux) or `%USERPROFILE%\.cursor\skills` (Windows)
3. Runs `bun install --production` inside the copied `cursor-curator` skill (bundles `zod`, `yaml`, MCP SDK for skill-only use)
4. Runs `curator.mjs install` to register agents (`objective-scout`, `objective-approval-gate`, `objective-worker`) and slash commands (`/objective-prep`, `/objective`, `/objective-board`)
5. Merges **Cursor hooks** into `~/.cursor/hooks.json` (`stop` and `subagentStop`) so agent time and token usage are recorded per objective in `notes/usage.json` (requires Cursor 1.7+ with hook token fields)
6. Installs a global `curator` CLI shim to `~/.cursor/bin` and adds that directory to your **User PATH** (Unix: shell rc marker block; Windows: User `Path` env var). Use `--no-add-to-path` to skip (see below).
7. Merges the **cursor-curator** MCP server into `~/.cursor/mcp.json` (Bun launcher + repo path for deps) and, when run from this repo, also into the project `.cursor/mcp.json` (portable paths for contributors).

Contributors need `bun install` at the repo root for tests and builds. Skill-only installs after step 3 do not require the clone’s `node_modules` for MCP/board runtime.

### PATH (first install vs global CLI)

First install does **not** require `curator` on PATH — run from the clone:

```bash
bun run install:cursor                              # adds ~/.cursor/bin to User PATH (default)
bun run install:cursor -- --no-add-to-path          # skip PATH update
bun cursor-curator/dist/cli/curator.mjs install --no-add-to-path
bun cursor-curator/dist/cli/curator.mjs reinstall --clean --no-add-to-path
```

After a new terminal picks up PATH, you can use the global shim:

```bash
curator doctor
curator reinstall --clean --no-add-to-path
```

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
      "command": "bun",
      "args": ["cursor-curator/dist/mcp/server.mjs"],
      "cwd": "."
    }
  }
}
```

When `dist/mcp/server.mjs` is absent, the launcher falls back to `cursor-curator/mcp/server.mjs` and resolves deps from the skill’s `node_modules` or the registered repo root.

## Verify

```bash
bun run build
bun run check
bun cursor-curator/dist/cli/curator.mjs doctor
bun cursor-curator/dist/cli/curator.mjs doctor --objective-ready
```

Doctor checks Bun, skill files, installed agents/commands, MCP config, CLI PATH, and runs an MCP smoke test on `sample-cursor-smoke`.

After install, **restart Cursor** (or reload PATH in the current PowerShell session) so `curator doctor` and `curator board` resolve globally. Integrated terminals inherit PATH from when Cursor was launched — a new tab inside Cursor is not enough if install ran while Cursor was open. If PATH was skipped during install, add `%USERPROFILE%\.cursor\bin` (Windows) or `~/.cursor/bin` (macOS/Linux) manually.

## Clean reinstall

When skills, MCP, or board code look stale after an upgrade:

```bash
bun run build
bun cursor-curator/dist/cli/curator.mjs reinstall --clean
```

Or, after the global CLI is on PATH:

```bash
curator reinstall --clean
```

This removes installed skill copies under `~/.cursor/skills`, legacy `curator-prep` / `goalbuddy` artifacts, re-copies from your clone, and re-runs install. **Restart Cursor** afterward and confirm MCP is enabled.

Requires a Cursor-Curator clone with `bun install` (repo root resolved via `CURATOR_REPO_ROOT`, `.cursor-curator-port.json`, or cwd).

## Smoke objective

```bash
bun cursor-curator/dist/cli/curator.mjs db import --slug sample-cursor-smoke
bun cursor-curator/dist/cli/curator.mjs check-objective sample-cursor-smoke
bun cursor-curator/dist/cli/curator.mjs board docs/objectives/sample-cursor-smoke
```

Hub: http://curator.localhost:41737/ — see [Usage](Usage) and `docs/objectives/sample-cursor-smoke/objective.md`.
