# Cursor Curator

Git-installable Cursor port of [tolibear/goalbuddy](https://github.com/tolibear/goalbuddy) for Cursor (`cursorPortVersion` **4.0.0**, `upstreamVersion` **0.3.8**).

**Documentation:** [Cursor Curator wiki](https://github.com/wstrege-kenosha/Cursor-Curator/wiki) (source in [`docs/wiki/`](docs/wiki/)). Upstream parity and migrations live there — e.g. [Upstream parity](docs/wiki/Upstream-Parity.md), [Migration 5.0](docs/wiki/Migration-5.0.md) (YAML → JSON v3), [Migration Node → Bun](docs/wiki/Migration-Node-to-Bun.md).

**Runtime:** [Bun](https://bun.sh) is required. Board state is stored in `.cursor-curator/curator.db` (SQLite via `bun:sqlite`). See [Migration 6.0](docs/wiki/Migration-6.0.md).

## Install

```bash
git clone https://github.com/wstrege-kenosha/Cursor-Curator.git
cd Cursor-Curator
bun install
bun run build
bun scripts/install-from-repo.mjs
```

Or `bun run install:cursor`.

The installer copies skills to `~/.cursor/skills`, builds `cursor-curator/dist/` when needed, registers agents/commands, and merges the **cursor-curator** MCP entry into `.cursor/mcp.json`. Enable the MCP server in Cursor settings after install.

See [docs/wiki/Install.md](docs/wiki/Install.md) for full steps.

## Verify

```bash
bun run build
bun run test:dev
bun run check
bun cursor-curator/dist/cli/curator.mjs doctor
bun cursor-curator/dist/cli/curator.mjs doctor --objective-ready
```

## Smoke objective

```bash
bun cursor-curator/dist/cli/curator.mjs check-objective sample-cursor-smoke
bun cursor-curator/dist/cli/curator.mjs board docs/objectives/sample-cursor-smoke
```

Hub: http://curator.localhost:41737/

## Usage

1. `/objective-prep` — scaffold `docs/objectives/<slug>/` in your workspace
2. `/objective Follow docs/objectives/<slug>/objective.md.` — PM loop with **cursor-curator MCP tools**

After install, add `~/.cursor/bin` to PATH for the global `curator` CLI (`doctor`, `board`, `hub`, `resume`, `verify-receipt`, …). See [docs/wiki/Usage.md](docs/wiki/Usage.md).

## Layout

| Path | Purpose |
|------|---------|
| `cursor-curator/src/` | TypeScript sources (state schema, CLI, MCP, board) |
| `cursor-curator/dist/` | Compiled ESM (build output; gitignored) |
| `cursor-curator/templates/state.json` | v3 board template |
| `objective-prep/` | `/objective-prep` skill |
| `scripts/install-from-repo.mjs` | Install skills + MCP from a clone |
| `scripts/migrate-5.0.mts` | One-time YAML v2 → JSON v3 migration |
| `docs/wiki/` | Operator documentation (wiki source) |
| `docs/objectives/sample-cursor-smoke/` | CI/doctor smoke board only |

**Board state:** runtime is **SQLite** in `.cursor-curator/curator.db`. CI seeds the smoke board from `cursor-curator/scripts/test/fixtures/sample-cursor-smoke/state.json`. Import legacy per-objective JSON with `bun cursor-curator/dist/cli/curator.mjs db import`. See [docs/wiki/Migration-6.0.md](docs/wiki/Migration-6.0.md).

## Publishing

Public repo: [github.com/wstrege-kenosha/Cursor-Curator](https://github.com/wstrege-kenosha/Cursor-Curator). Not published to a package registry; install from git.
