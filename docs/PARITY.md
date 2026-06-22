# Cursor Curator parity — upstream 0.3.8 vs Cursor port 2.1.0

**Migration from port 1.0.0:** [MIGRATION-1.0-to-2.0.md](MIGRATION-1.0-to-2.0.md)

**Migration from port 2.0.0:** [MIGRATION-2.0-to-2.1.md](MIGRATION-2.0-to-2.1.md)

## Upstream (`tolibear/cursor-curator` @ 0.3.8)

| Path | Role |
|------|------|
| `package.json` | npm `curator`; bin `internal/cli/goal-maker.mjs`; `postinstall` |
| `internal/cli/` | install/doctor/update/reset/prompt/board |
| `cursor-curator/` | Skill payload: scripts, surfaces, templates |
| `plugins/cursor-curator/` | Codex + Claude plugin manifests |
| `.agents/` | Codex marketplace |

**Install targets:** default Codex + Claude; `--target codex|claude`. No `--target cursor` in upstream main.

**Verification:** `npm run check`; `npx curator doctor [--target codex|claude] [--objective-ready]`; `node curator/scripts/check-objective-state.mjs <state.yaml>`; board via CLI.

## Cursor port repo (`Cursor CuratorCursorPort` @ 2.1.0)

| Path | Role |
|------|------|
| `package.json` | `npm run check`, `install:cursor` |
| `cursor-curator/` | Vendored Cursor skill (from upstream 0.3.8 lineage) |
| `cursor-curator/mcp/` | stdio MCP server wrapping shared validators |
| `objective-prep/` | `/objective-prep` skill |
| `scripts/install-from-repo.mjs` | Copy skills → `~/.cursor/skills`, run `curator.mjs install`, merge MCP config |
| `docs/objectives/` | Goal boards (e.g. `sample-cursor-smoke/`) |
| `.cursor/mcp.json` | Project MCP server entry |
| `docs/PARITY.md` | This matrix |

**Cursor CLI:** `node curator/scripts/curator.mjs` — `install`, `doctor [--objective-ready]`, `board`, `prompt`, `parallel-plan`, `receipt`, `completion-check`, `stale`, `hub`, `check-update`, `reset`, `workspace register`.

Global **`curator`** command (after install + PATH): same subcommands from any repo with `docs/objectives/`.

## Parity matrix

| Feature | Upstream 0.3.8 | Cursor (`~/.cursor`) | Port repo |
|---------|----------------|------------------------|-----------|
| Objective Prep | `$objective-prep` / plugin | `/objective-prep` + `objective-prep` skill | `objective-prep/SKILL.md` vendored |
| PM `/objective` loop | Native + CLI prompt | `/objective` + MCP tool gates | `cursor-curator/commands-src`, `cursor-curator/mcp/` |
| MCP tools | No | `curator` stdio server | `cursor-curator/mcp/server.mjs` |
| state.yaml v2 | Yes | Yes | Yes; shared `goal-state.mjs` lib |
| Scout/Approval Gate/Worker | Codex toml + Claude md | `goal-*.md` agents | `cursor-curator/agents-src` + install script |
| Local board hub | `curator.localhost:41737` | Same + multi-objective hub at `/` | `cursor-curator/surfaces/local-goal-board/` |
| Receipt / completion gates | CLI only | MCP + CLI | `goal-receipt.mjs`, `goal-completion.mjs` |
| Stale goal detection | No | `stale` CLI | `goal-stale.mjs` |
| doctor | `--target codex\|claude` | `doctor` + MCP smoke | `node curator/scripts/curator.mjs doctor` |
| install | `npx cursor-curator` | `curator.mjs install` + MCP merge | `node scripts/install-from-repo.mjs` |
| check-objective-state / parallel-plan / check-update | Yes | Yes (skill tree) | Yes + unit tests |
| Codex/Claude plugins | Yes | N/A (by design) | N/A |
| npm publish | `curator` | N/A | Git clone only |
| Root LICENSE | MIT in package | N/A | MIT (`LICENSE`) |
| Sample smoke objective | Examples in skill tree | Optional | `docs/objectives/sample-cursor-smoke/` |
| CI | Upstream `npm run check` | GitHub Actions | `.github/workflows/check.yml` |

## Cursor-only extensions (not upstream)

| Extension | Purpose |
|-----------|---------|
| MCP server | Deterministic `validate_state`, `render_task_prompt`, `validate_receipt`, etc. |
| Multi-objective hub | Discover all `docs/objectives/*` at board root |
| Session timeline | `notes/SESSION.md` convention + `append_session_note` |
| Global `curator` CLI | `doctor`, `board`, `hub`, gates from any project repo |

## Removed in 2.1.0

| Feature | Notes |
|---------|-------|
| SDK auto-loop (`run --auto N`) | Removed; use `/objective` in Cursor chat |
| `@cursor-curator/runner` / `@cursor/sdk` | Package and deps removed |
| `CURSOR_API_KEY` | No longer required for Cursor Curator |

## Deferred

- Codex/Claude plugins and `--target codex|claude`
- npm package `cursor-curator-cursor`
- Upstream superpowers / site parity

## CI

GitHub Actions workflow `.github/workflows/check.yml` runs `npm run check` (tests + doctor) on push/PR.

## Verify (port repo)

```bash
npm install
npm run check
node curator/scripts/curator.mjs doctor --objective-ready
node curator/scripts/check-objective-state.mjs docs/objectives/sample-cursor-smoke/state.yaml
node curator/scripts/curator.mjs board docs/objectives/sample-cursor-smoke
```
