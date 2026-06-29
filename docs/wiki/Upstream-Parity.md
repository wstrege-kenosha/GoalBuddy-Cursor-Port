# Upstream parity

This repo is a **Cursor port** of [tolibear/goalbuddy](https://github.com/tolibear/goalbuddy) @ **0.3.8**. It is not an official upstream release.

**Cursor port version:** 4.0.0 (fork modernization adds JSON v3 + TypeScript `dist/` stack + SQLite 6.0).

## Included in the port

- `/objective-prep` and `/objective` via Cursor skills and commands
- SQLite board state in `.cursor-curator/curator.db` (v3 `StateV3`, Zod-validated)
- Local board hub at `curator.localhost:41737` — canonical board code in `cursor-curator/src/board/`
- **cursor-curator MCP server** (validation, prompts, receipts, verification, completion, session resume, blocked/misfire/rollup checks, **PM write tools**)
- CLI gates: `receipt`, `completion-check`, `verify-receipt`, `resume`, `blocked`, `misfire-audit`, `subobjective-rollup`, `stale`, `hub`, `register-objective`, global `curator` command
- TypeScript sources in `cursor-curator/src/` → `cursor-curator/dist/`
- GitHub Actions CI (`bun run check`)
- `bun scripts/install-from-repo.mjs` (replaces upstream package install for Cursor)

## Not included (by design)

- Codex and Claude Code plugin install paths
- Upstream `npx cursor-curator` npm package (this port uses git + Bun install only)
- SDK auto-loop (`run --auto N`) — removed in 2.1.0; use `/objective` instead
- Full upstream superpowers / site parity
- Auto Task spawn (PM still spawns subagents)

## Parity matrix (summary)

| Feature | Upstream 0.3.8 | Cursor port |
|---------|------------------|-------------|
| PM loop | Native + CLI | `/objective` + MCP tool gates |
| Board state | `state.yaml` v2 | SQLite `curator.db` (logical `db:<slug>`) |
| Local board hub | `curator.localhost:41737` | Same + multi-objective hub |
| Receipt / completion gates | CLI | MCP + CLI |
| install | `npx cursor-curator` | `bun scripts/install-from-repo.mjs` |
| package publish | `curator` package | Git clone only |

## Fork modernization (5.0+ / 6.0)

| Area | Upstream 0.3.8 | This fork |
|------|----------------|-----------|
| State storage | `state.yaml` v2 | SQLite 6.0 (`curator.db`) |
| Legacy import | YAML migrate scripts | `scripts/migrate-5.0.mts` + `curator db import` |
| Validation | Regex YAML scanner | Zod `StateV3Schema` |
| Sources | `.mjs` throughout | `.mts` in `src/` → `dist/` |
| CLI / MCP entry | Direct `.mjs` | `dist/cli/`, `dist/mcp/` |

See [Migration 5.0](Migration-5.0.md) for YAML → JSON and [Migration 6.0](Migration-6.0.md) for JSON → SQLite.

## Verify (port repo)

```bash
bun install
bun run build
bun run check
bun cursor-curator/dist/cli/curator.mjs doctor --objective-ready
bun cursor-curator/dist/cli/curator.mjs check-objective sample-cursor-smoke
```

CI seeds `sample-cursor-smoke` from `cursor-curator/scripts/test/fixtures/sample-cursor-smoke/state.json` into `curator.db` before validation.
