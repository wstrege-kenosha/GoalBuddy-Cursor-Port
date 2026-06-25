# Cursor Curator

Git-installable Cursor port of [tolibear/goalbuddy](https://github.com/tolibear/goalbuddy) for Cursor (`cursorPortVersion` **4.0.0**, `upstreamVersion` **0.3.8**).

**Documentation:** [Cursor Curator wiki](https://github.com/wstrege-kenosha/Cursor-Curator/wiki) (source in [`docs/wiki/`](docs/wiki/)). Upstream parity and migrations live there — e.g. [Upstream parity](docs/wiki/Upstream-Parity.md), [Migration 5.0](docs/wiki/Migration-5.0.md) (YAML → JSON v3).

## Install

```bash
git clone https://github.com/wstrege-kenosha/Cursor-Curator.git
cd Cursor-Curator
npm install
npm run build
node scripts/install-from-repo.mjs
```

Or `npm run install:cursor`.

The installer copies skills to `~/.cursor/skills`, builds `cursor-curator/dist/` when needed, registers agents/commands, and merges the **cursor-curator** MCP entry into `.cursor/mcp.json`. Enable the MCP server in Cursor settings after install.

See [docs/wiki/Install.md](docs/wiki/Install.md) for full steps.

## Verify

```bash
npm run build
npm run test:dev
npm run check
node cursor-curator/dist/cli/curator.mjs doctor
node cursor-curator/dist/cli/curator.mjs doctor --objective-ready
```

## Smoke objective

```bash
node cursor-curator/dist/cli/curator.mjs check-state docs/objectives/sample-cursor-smoke/state.json
node cursor-curator/dist/cli/curator.mjs board docs/objectives/sample-cursor-smoke
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

**Board state:** runtime is **JSON v3 only** (`state.json`). Migrate legacy YAML with `node scripts/migrate-5.0.mts docs/objectives/<slug>`.

## Publishing

Public repo: [github.com/wstrege-kenosha/Cursor-Curator](https://github.com/wstrege-kenosha/Cursor-Curator). Not on npm; install from git.
