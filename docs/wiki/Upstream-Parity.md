# Upstream parity

This repo is a **Cursor port** of [tolibear/goalbuddy](https://github.com/tolibear/goalbuddy) @ **0.3.8**. It is not an official upstream release.

**Cursor port version:** 4.0.0 (fork modernization adds JSON v3 + TypeScript `dist/` stack).

## Included in the port

- `/objective-prep` and `/objective` via Cursor skills and commands
- `state.json` v3 boards (Zod-validated); one-time YAML migration via `scripts/migrate-5.0.mts`
- Local board hub at `curator.localhost:41737` — canonical board code in `cursor-curator/src/board/`
- **cursor-curator MCP server** (validation, prompts, receipts, verification, completion, session resume, blocked/misfire/rollup checks)
- CLI gates: `receipt`, `completion-check`, `verify-receipt`, `resume`, `blocked`, `misfire-audit`, `subobjective-rollup`, `stale`, `hub`, global `curator` command
- TypeScript sources in `cursor-curator/src/` → `cursor-curator/dist/`
- GitHub Actions CI (`npm run check`)
- `node scripts/install-from-repo.mjs` (replaces `npx cursor-curator` for Cursor)

## Not included (by design)

- Codex and Claude Code plugin install paths
- `npx cursor-curator` npm package for this port (git install only)
- SDK auto-loop (`run --auto N`) — removed in 2.1.0; use `/objective` instead
- Full upstream superpowers / site parity
- MCP write tools or auto Task spawn (PM still owns state and spawns)

## Parity matrix (summary)

| Feature | Upstream 0.3.8 | Cursor port |
|---------|------------------|-------------|
| PM loop | Native + CLI | `/objective` + MCP tool gates |
| Board state | `state.yaml` v2 | `state.json` v3 (JSON-only runtime) |
| Local board hub | `curator.localhost:41737` | Same + multi-objective hub |
| Receipt / completion gates | CLI | MCP + CLI |
| install | `npx cursor-curator` | `node scripts/install-from-repo.mjs` |
| npm publish | `curator` package | Git clone only |

## Fork modernization (5.0+)

| Area | Upstream 0.3.8 | This fork |
|------|----------------|-----------|
| State file | `state.yaml` v2 | `state.json` v3 only at runtime |
| Validation | Regex YAML scanner | Zod `StateV3Schema` |
| Sources | `.mjs` throughout | `.mts` in `src/` → `dist/` |
| CLI / MCP entry | Direct `.mjs` | `dist/cli/`, `dist/mcp/` |
| Migration | YAML migrate scripts | `scripts/migrate-5.0.mts` (one-time YAML→JSON) |

See [Migration 5.0](Migration-5.0) for the YAML → JSON upgrade path.

## Verify (port repo)

```bash
npm install
npm run build
npm run check
node cursor-curator/dist/cli/curator.mjs doctor --objective-ready
node cursor-curator/dist/cli/curator.mjs check-state docs/objectives/sample-cursor-smoke/state.json
```
