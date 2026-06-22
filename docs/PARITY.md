# Cursor Curator parity — upstream 0.3.8 vs Cursor port 4.0.0

**Migration from port 1.0.0:** [MIGRATION-1.0-to-2.0.md](MIGRATION-1.0-to-2.0.md)

**Migration from port 2.0.0:** [MIGRATION-2.0-to-2.1.md](MIGRATION-2.0-to-2.1.md)

**Migration from port 3.0.0:** [MIGRATION-3.0-to-4.0.md](MIGRATION-3.0-to-4.0.md)

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

## Cursor port repo (`Cursor-Curator` @ 4.0.0)

| Path | Role |
|------|------|
| `package.json` | `npm run check`, `install:cursor` |
| `cursor-curator/` | Vendored Cursor skill (from upstream 0.3.8 lineage) |
| `cursor-curator/mcp/` | stdio MCP server wrapping shared validators |
| `cursor-curator/scripts/lib/objective-*.mjs` | Shared state, receipt, completion, verify, session, hub, … libs |
| `objective-prep/` | `/objective-prep` skill |
| `scripts/install-from-repo.mjs` | Copy skills → `~/.cursor/skills`, run `curator.mjs install`, merge MCP config |
| `docs/objectives/` | Objective boards (e.g. `sample-cursor-smoke/`) |
| `.cursor/mcp.json` | Project MCP server entry |
| `docs/PARITY.md` | This matrix |

**Cursor CLI:** `node cursor-curator/scripts/curator.mjs` — `install`, `doctor [--objective-ready]`, `board`, `prompt`, `parallel-plan`, `receipt`, `completion-check`, `resume`, `verify-receipt`, `blocked`, `misfire-audit`, `subgoal-rollup`, `stale`, `hub`, `check-update`, `reset`, `workspace register`, `migrate`.

Global **`curator`** command (after install + PATH): same subcommands from any repo with `docs/objectives/`.

## Parity matrix

| Feature | Upstream 0.3.8 | Cursor (`~/.cursor`) | Port repo |
|---------|----------------|------------------------|-----------|
| Objective Prep | `$objective-prep` / plugin | `/objective-prep` + `objective-prep` skill | `objective-prep/SKILL.md` vendored |
| PM `/objective` loop | Native + CLI prompt | `/objective` + MCP tool gates | `cursor-curator/commands-src`, `cursor-curator/mcp/` |
| MCP tools | No | `curator` stdio server | `cursor-curator/mcp/server.mjs` |
| state.yaml v2 | Yes | Yes | Yes; shared `objective-state.mjs` lib |
| Scout/Approval Gate/Worker | Codex toml + Claude md | `objective-*.md` agents | `cursor-curator/agents-src` + install script |
| Local board hub | `curator.localhost:41737` | Same + multi-objective hub at `/` | `cursor-curator/surfaces/local-goal-board/` |
| Receipt / completion gates | CLI only | MCP + CLI | `objective-receipt.mjs`, `objective-completion.mjs` |
| Post-Worker verify cross-check | No | MCP + CLI | `objective-verify.mjs` |
| Stale objective detection | No | `stale` CLI + MCP `list_objectives` | `objective-stale.mjs` |
| Session resume digest | No | MCP + CLI | `objective-session.mjs` |
| Blocked / misfire / rollup helpers | No | MCP + CLI | `objective-blocked.mjs`, `objective-misfire.mjs`, `objective-subgoal.mjs` |
| doctor | `--target codex\|claude` | `doctor` + MCP smoke | `node cursor-curator/scripts/curator.mjs doctor` |
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
| MCP server | Deterministic `validate_state`, `render_task_prompt`, `validate_receipt`, `verify_worker_receipt`, etc. |
| Multi-objective hub | Discover all `docs/objectives/*` at board root |
| Session timeline | `notes/SESSION.md` convention + `append_session_note` / `session_resume_digest` |
| Global `curator` CLI | `doctor`, `board`, `hub`, gates, resume, verify-receipt from any project repo |
| Board UI strips | Validation banner, Now hero, intake/progress rails (local board) |

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
node cursor-curator/scripts/curator.mjs doctor --objective-ready
node cursor-curator/scripts/check-objective-state.mjs docs/objectives/sample-cursor-smoke/state.yaml
node cursor-curator/scripts/curator.mjs board docs/objectives/sample-cursor-smoke
```
