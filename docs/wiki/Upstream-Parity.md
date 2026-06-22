# Upstream parity

This repo is a **Cursor port** of [tolibear/cursor-curator](https://github.com/tolibear/cursor-curator) @ **0.3.8**. It is not an official upstream release.

## Included in the port (4.0.0)

- `/objective-prep` and `/objective` via Cursor skills and commands
- `state.yaml` v2 boards and shared `objective-state.mjs` validator
- Scout / Approval Gate / Worker agents with MCP-aware prompts
- Local board hub at `curator.localhost:41737` with multi-objective dashboard
- **cursor-curator MCP server** (validation, prompts, receipts, verification, completion, session resume, blocked/misfire/rollup checks)
- CLI gates: `receipt`, `completion-check`, `verify-receipt`, `resume`, `blocked`, `misfire-audit`, `subgoal-rollup`, `stale`, `hub`, global `curator` command
- Shared libs under `cursor-curator/scripts/lib/objective-*.mjs`
- GitHub Actions CI (`npm run check`)
- `node scripts/install-from-repo.mjs` (replaces `npx cursor-curator` for Cursor)

## Not included (by design)

- Codex and Claude Code plugin install paths
- `npx cursor-curator` npm package for this port (git install only)
- SDK auto-loop (`run --auto N`) — removed in 2.1.0; use `/objective` instead
- Full upstream superpowers / site parity
- MCP write tools or auto Task spawn (PM still owns state and spawns)

## Versions

| | Version |
|--|---------|
| Cursor port | 4.0.0 |
| Upstream lineage | 0.3.8 |

Full matrix in the repo: `docs/PARITY.md`.
