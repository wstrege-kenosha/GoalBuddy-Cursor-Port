# T001 Scout — Upstream map & Cursor port parity

## Upstream (`tolibear/goalbuddy` @ 0.3.8, main)

| Path | Role |
|------|------|
| `package.json` | npm `goalbuddy`; bin `internal/cli/goal-maker.mjs`; `postinstall` |
| `internal/cli/` | `goal-maker.mjs` (install/doctor/update/reset/prompt/board), `postinstall.mjs` |
| `goalbuddy/` | Skill payload: `SKILL.md`, `agents/`, `scripts/`, `surfaces/local-goal-board/`, `templates/` |
| `plugins/goalbuddy/` | Codex + Claude plugin manifests; shared `skills/goalbuddy/` |
| `.agents/` | Codex marketplace |
| `docs/releases`, `docs/superpowers` | docs |

**Install targets (upstream CLI):** default = Codex + Claude; `--target codex` → `~/.codex/plugins/cache/goalbuddy/...`, `~/.codex/agents/goal_*.toml`; `--target claude` → `~/.claude/` skill + agents. **No `--target cursor` in upstream main.**

**Verification (upstream):** `npm run check`; `npx goalbuddy doctor [--target codex|claude] [--goal-ready]`; `npx goalbuddy check-update`; `node goalbuddy/scripts/check-goal-state.mjs <state.yaml>`; board via CLI.

## Local Cursor reference (this machine)

| Path | Role |
|------|------|
| `~/.cursor/skills/goalbuddy/` | Cursor port v1.0.0 (`version.json`: upstream 0.3.8) |
| `~/.cursor/skills/goal-prep/` | Prep skill |
| `~/.cursor/agents/goal-{scout,judge,worker}.md` | Task subagents |
| `~/.cursor/commands/goal-{prep,board}.md`, `goal.md` | Slash commands |
| `install.json` | Manifest from `goalbuddy.mjs install` |

**Cursor CLI:** `node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs` — `install`, `doctor [--goal-ready]`, `board`, `prompt`, `parallel-plan`, `check-update`, `reset`.

**Doctor (ran):** `ok: true`, `target: cursor`. **check-goal-state (ran):** port `state.yaml` ok, active T001.

## Port repo (`GoalBuddyCursorPort`)

Only: `docs/goals/goalbuddy-cursor-port/{goal.md,state.yaml,notes/,.goalbuddy-board/}`. **No** `package.json`, README, vendored skills, or install script in repo.

## Parity matrix

| Feature | Upstream 0.3.8 | Cursor (local) | Port repo |
|---------|----------------|----------------|-----------|
| Goal Prep | `$goal-prep` / plugin skill | `/goal-prep` + `goal-prep` skill | Scaffold only (goal.md) |
| PM `/goal` loop | Native + CLI prompt | `/goal` command + `goalbuddy.mjs prompt` | Charter only |
| state.yaml v2 | Yes | Yes (prep) | Yes |
| Scout/Judge/Worker | Codex toml + Claude md | `goal-*.md` agents | Queued, not in repo |
| Local board hub | `goalbuddy.localhost:41737` | Same (board cmd in state) | Snapshot generated |
| doctor | `--target codex\|claude` | `doctor` (cursor only) | Missing |
| install | `npx goalbuddy` | `goalbuddy.mjs install` | Missing |
| check-goal-state / parallel-plan / check-update | Yes | Yes (in skill tree) | Missing |
| Codex/Claude plugins | Yes | N/A (by design) | N/A |
| npm publish | `goalbuddy` | N/A (`goalbuddy-cursor` not on npm) | None |

## Ranked implementation slices (largest safe first)

1. **Port repo skeleton + vendored Cursor payload** — Copy/adapt `~/.cursor/skills/{goalbuddy,goal-prep}`, `agents-src`, `commands-src`, `surfaces/`, `scripts/` into repo; `package.json` with `install` script → `~/.cursor`; README; `npm run check` (node --check/--test).
2. **Repo-local doctor/verify** — Document and wire `doctor --goal-ready`, `check-goal-state` on sample goal; CI optional.
3. **Install-from-clone UX** — Single command (node scripts/install.mjs or npm postinstall) without Codex/Claude paths.
4. **Parity doc + update sync** — `docs/PARITY.md` vs 0.3.8; `check-update` against npm `goalbuddy`.
5. **Deferred:** Codex plugin, Claude plugin, superpowers, site.

## Candidate Judge tasks (T002)

- Pick slice #1 with explicit `allowed_files` (root package.json, README, goalbuddy/, goal-prep/, scripts/).
- Defer Codex/Claude, MCP, full superpowers.
- Verify: `node scripts/goalbuddy.mjs doctor --goal-ready` from fresh clone path (or documented copy).

## Contradictions

- Charter/state `existing_plan_facts` say workspace empty; prep added board + 6 files.
- Operator already has Cursor port in `~/.cursor` but port **repo** has no distributable payload yet.

## Ambiguity (Judge)

- Source of truth for vendoring: upstream npm pack vs existing local cursor tree vs hybrid.
- Publish `goalbuddy-cursor` to npm or git-only install.
- MVP scope: match local install vs re-sync from upstream 0.3.8 on every release.
