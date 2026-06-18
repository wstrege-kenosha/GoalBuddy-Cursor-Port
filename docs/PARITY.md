# GoalBuddy parity — upstream 0.3.8 vs Cursor port 1.0.0

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

## Cursor port repo (`GoalBuddyCursorPort` @ 1.0.0)

| Path | Role |
|------|------|
| `package.json` | `npm run check`, `install:cursor` |
| `goalbuddy/` | Vendored Cursor skill (from upstream 0.3.8 lineage) |
| `goal-prep/` | `/goal-prep` skill |
| `scripts/install-from-repo.mjs` | Copy skills → `~/.cursor/skills`, run `goalbuddy.mjs install` |
| `docs/goals/` | Goal boards (e.g. `sample-cursor-smoke/`) |
| `docs/PARITY.md` | This matrix |

**Cursor CLI:** `node goalbuddy/scripts/goalbuddy.mjs` — `install`, `doctor [--goal-ready]`, `board`, `prompt`, `parallel-plan`, `check-update`, `reset`.

## Parity matrix

| Feature | Upstream 0.3.8 | Cursor (`~/.cursor`) | Port repo |
|---------|----------------|------------------------|-----------|
| Goal Prep | `$goal-prep` / plugin | `/goal-prep` + `goal-prep` skill | `goal-prep/SKILL.md` vendored |
| PM `/goal` loop | Native + CLI prompt | `/goal` + `goalbuddy.mjs prompt` | `goalbuddy/commands-src`, agents-src |
| state.yaml v2 | Yes | Yes | Yes; `check-goal-state.mjs` in tree |
| Scout/Judge/Worker | Codex toml + Claude md | `goal-*.md` agents | `goalbuddy/agents-src` + install script |
| Local board hub | `goalbuddy.localhost:41737` | Same | `goalbuddy/surfaces/local-goal-board/` |
| doctor | `--target codex\|claude` | `doctor` (cursor) | `node goalbuddy/scripts/goalbuddy.mjs doctor` |
| install | `npx goalbuddy` | `goalbuddy.mjs install` | `node scripts/install-from-repo.mjs` |
| check-goal-state / parallel-plan / check-update | Yes | Yes (skill tree) | Yes (vendored scripts) |
| Codex/Claude plugins | Yes | N/A (by design) | N/A |
| npm publish | `goalbuddy` | N/A | Git clone only |
| Root LICENSE | MIT in package | N/A | MIT (`LICENSE`) |
| Sample smoke goal | Examples in skill tree | Optional | `docs/goals/sample-cursor-smoke/` |

## Deferred

- Codex/Claude plugins and `--target codex|claude`
- npm package `goalbuddy-cursor`
- Upstream superpowers / site parity

## CI

GitHub Actions workflow `.github/workflows/check.yml` runs `npm run check` and `doctor --goal-ready` on push/PR.

## Verify (port repo)

```bash
npm run check
node goalbuddy/scripts/goalbuddy.mjs doctor --goal-ready
node goalbuddy/scripts/check-goal-state.mjs docs/goals/sample-cursor-smoke/state.yaml
node goalbuddy/scripts/goalbuddy.mjs board docs/goals/sample-cursor-smoke
```
