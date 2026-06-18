# Upstream parity

This repo is a **Cursor port** of [tolibear/goalbuddy](https://github.com/tolibear/goalbuddy) @ **0.3.8**. It is not an official upstream release.

## Included in the port (2.1.0)

- `/goal-prep` and `/goal` via Cursor skills and commands
- `state.yaml` v2 boards and shared `goal-state.mjs` validator
- Scout / Judge / Worker agents with MCP-aware prompts
- Local board hub at `goalbuddy.localhost:41737` with multi-goal dashboard
- **goalbuddy MCP server** (validation, prompts, receipts, completion)
- CLI gates: `receipt`, `completion-check`, `stale`, `hub`, global `goalbuddy` command
- GitHub Actions CI (`npm run check`)
- `node scripts/install-from-repo.mjs` (replaces `npx goalbuddy` for Cursor)

## Not included (by design)

- Codex and Claude Code plugin install paths
- `npx goalbuddy` npm package for this port (git install only)
- SDK auto-loop (`run --auto N`) — removed in 2.1.0; use `/goal` instead
- Full upstream superpowers / site parity
- MCP write tools or auto Task spawn (PM still owns state and spawns)

## Versions

| | Version |
|--|---------|
| Cursor port | 2.1.0 |
| Upstream lineage | 0.3.8 |

Full matrix in the repo: `docs/PARITY.md`.
