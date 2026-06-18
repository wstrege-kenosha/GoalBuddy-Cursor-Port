# GoalBuddy parity — upstream 0.3.8 vs Cursor port 2.1.0

**Migration from port 1.0.0:** [MIGRATION-1.0-to-2.0.md](MIGRATION-1.0-to-2.0.md)

**Migration from port 2.0.0:** [MIGRATION-2.0-to-2.1.md](MIGRATION-2.0-to-2.1.md)

## Upstream (`tolibear/goalbuddy` @ 0.3.8)

| Path | Role |
|------|------|
| `package.json` | npm `goalbuddy`; bin `internal/cli/goal-maker.mjs`; `postinstall` |
| `internal/cli/` | install/doctor/update/reset/prompt/board |
| `goalbuddy/` | Skill payload: scripts, surfaces, templates |
| `plugins/goalbuddy/` | Codex + Claude plugin manifests |
| `.agents/` | Codex marketplace |

**Install targets:** default Codex + Claude; `--target codex|claude`. No `--target cursor` in upstream main.

**Verification:** `npm run check`; `npx goalbuddy doctor [--target codex|claude] [--goal-ready]`; `node goalbuddy/scripts/check-goal-state.mjs <state.yaml>`; board via CLI.

## Cursor port repo (`GoalBuddyCursorPort` @ 2.1.0)

| Path | Role |
|------|------|
| `package.json` | `npm run check`, `install:cursor` |
| `goalbuddy/` | Vendored Cursor skill (from upstream 0.3.8 lineage) |
| `goalbuddy/mcp/` | stdio MCP server wrapping shared validators |
| `goal-prep/` | `/goal-prep` skill |
| `scripts/install-from-repo.mjs` | Copy skills → `~/.cursor/skills`, run `goalbuddy.mjs install`, merge MCP config |
| `docs/goals/` | Goal boards (e.g. `sample-cursor-smoke/`) |
| `.cursor/mcp.json` | Project MCP server entry |
| `docs/PARITY.md` | This matrix |

**Cursor CLI:** `node goalbuddy/scripts/goalbuddy.mjs` — `install`, `doctor [--goal-ready]`, `board`, `prompt`, `parallel-plan`, `receipt`, `completion-check`, `stale`, `hub`, `check-update`, `reset`, `workspace register`.

Global **`goalbuddy`** command (after install + PATH): same subcommands from any repo with `docs/goals/`.

## Parity matrix

| Feature | Upstream 0.3.8 | Cursor (`~/.cursor`) | Port repo |
|---------|----------------|------------------------|-----------|
| Goal Prep | `$goal-prep` / plugin | `/goal-prep` + `goal-prep` skill | `goal-prep/SKILL.md` vendored |
| PM `/goal` loop | Native + CLI prompt | `/goal` + MCP tool gates | `goalbuddy/commands-src`, `goalbuddy/mcp/` |
| MCP tools | No | `goalbuddy` stdio server | `goalbuddy/mcp/server.mjs` |
| state.yaml v2 | Yes | Yes | Yes; shared `goal-state.mjs` lib |
| Scout/Judge/Worker | Codex toml + Claude md | `goal-*.md` agents | `goalbuddy/agents-src` + install script |
| Local board hub | `goalbuddy.localhost:41737` | Same + multi-goal hub at `/` | `goalbuddy/surfaces/local-goal-board/` |
| Receipt / completion gates | CLI only | MCP + CLI | `goal-receipt.mjs`, `goal-completion.mjs` |
| Stale goal detection | No | `stale` CLI | `goal-stale.mjs` |
| doctor | `--target codex\|claude` | `doctor` + MCP smoke | `node goalbuddy/scripts/goalbuddy.mjs doctor` |
| install | `npx goalbuddy` | `goalbuddy.mjs install` + MCP merge | `node scripts/install-from-repo.mjs` |
| check-goal-state / parallel-plan / check-update | Yes | Yes (skill tree) | Yes + unit tests |
| Codex/Claude plugins | Yes | N/A (by design) | N/A |
| npm publish | `goalbuddy` | N/A | Git clone only |
| Root LICENSE | MIT in package | N/A | MIT (`LICENSE`) |
| Sample smoke goal | Examples in skill tree | Optional | `docs/goals/sample-cursor-smoke/` |
| CI | Upstream `npm run check` | GitHub Actions | `.github/workflows/check.yml` |

## Cursor-only extensions (not upstream)

| Extension | Purpose |
|-----------|---------|
| MCP server | Deterministic `validate_state`, `render_task_prompt`, `validate_receipt`, etc. |
| Multi-goal hub | Discover all `docs/goals/*` at board root |
| Session timeline | `notes/SESSION.md` convention + `append_session_note` |
| Global `goalbuddy` CLI | `doctor`, `board`, `hub`, gates from any project repo |

## Removed in 2.1.0

| Feature | Notes |
|---------|-------|
| SDK auto-loop (`run --auto N`) | Removed; use `/goal` in Cursor chat |
| `@goalbuddy/runner` / `@cursor/sdk` | Package and deps removed |
| `CURSOR_API_KEY` | No longer required for GoalBuddy |

## Deferred

- Codex/Claude plugins and `--target codex|claude`
- npm package `goalbuddy-cursor`
- Upstream superpowers / site parity

## CI

GitHub Actions workflow `.github/workflows/check.yml` runs `npm run check` (tests + doctor) on push/PR.

## Verify (port repo)

```bash
npm install
npm run check
node goalbuddy/scripts/goalbuddy.mjs doctor --goal-ready
node goalbuddy/scripts/check-goal-state.mjs docs/goals/sample-cursor-smoke/state.yaml
node goalbuddy/scripts/goalbuddy.mjs board docs/goals/sample-cursor-smoke
```
