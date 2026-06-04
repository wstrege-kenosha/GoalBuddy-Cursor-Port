# Upstream parity

This repo is a **Cursor port** of [tolibear/goalbuddy](https://github.com/tolibear/goalbuddy) @ **0.3.8**. It is not an official upstream release.

## Included in the port

- `/goal-prep` and `/goal` via Cursor skills and commands
- `state.yaml` v2 boards and `check-goal-state.mjs`
- Scout / Judge / Worker agents
- Local board hub at `goalbuddy.localhost:41737`
- `node scripts/install-from-repo.mjs` (replaces `npx goalbuddy` for Cursor)

## Not included (by design)

- Codex and Claude Code plugin install paths
- `npx goalbuddy` npm package for this port (git install only)
- Full upstream superpowers / site parity

## Versions

| | Version |
|--|---------|
| Cursor port | 1.0.0 |
| Upstream lineage | 0.3.8 |

Full matrix in the repo: `docs/PARITY.md`.
