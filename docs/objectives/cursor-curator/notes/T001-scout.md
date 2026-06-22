# T001 Scout — Upstream map & Cursor port parity

## Upstream (`tolibear/cursor-curator` @ 0.3.8, main)

| Path | Role |
|------|------|
| `package.json` | npm `curator`; bin `internal/cli/goal-maker.mjs`; `postinstall` |
| `internal/cli/` | `goal-maker.mjs` (install/doctor/update/reset/prompt/board), `postinstall.mjs` |
| `cursor-curator/` | Skill payload: `SKILL.md`, `agents/`, `scripts/`, `surfaces/local-goal-board/`, `templates/` |
| `plugins/cursor-curator/` | Codex + Claude plugin manifests; shared `skills/cursor-curator/` |
| `.agents/` | Codex marketplace |
| `docs/releases`, `docs/superpowers` | docs |

**Install targets (upstream CLI):** default = Codex + Claude; `--target codex` → `~/.codex/plugins/cache/cursor-curator/...`, `~/.codex/agents/goal_*.toml`; `--target claude` → `~/.claude/` skill + agents. **No `--target cursor` in upstream main.**

**Verification (upstream):** `npm run check`; `npx curator doctor [--target codex|claude] [--objective-ready]`; `npx curator check-update`; `node curator/scripts/check-objective-state.mjs <state.yaml>`; board via CLI.

## Local Cursor reference (this machine)

| Path | Role |
|------|------|
| `~/.cursor/skills/cursor-curator/` | Cursor port v1.0.0 (`version.json`: upstream 0.3.8) |
| `~/.cursor/skills/objective-prep/` | Prep skill |
| `~/.cursor/agents/goal-{scout,judge,worker}.md` | Task subagents |
| `~/.cursor/commands/goal-{prep,board}.md`, `objective.md` | Slash commands |
| `install.json` | Manifest from `curator.mjs install` |

**Cursor CLI:** `node ~/.cursor/skills/cursor-curator/scripts/curator.mjs` — `install`, `doctor [--objective-ready]`, `board`, `prompt`, `parallel-plan`, `check-update`, `reset`.

**Doctor (ran):** `ok: true`, `target: cursor`. **check-objective-state (ran):** port `state.yaml` ok, active T001.

## Port repo (`Cursor CuratorCursorPort`)

Only: `docs/objectives/cursor-curator/{objective.md,state.yaml,notes/,.cursor-curator-board/}`. **No** `package.json`, README, vendored skills, or install script in repo.

## Parity matrix

| Feature | Upstream 0.3.8 | Cursor (local) | Port repo |
|---------|----------------|----------------|-----------|
| Objective Prep | `$objective-prep` / plugin skill | `/objective-prep` + `objective-prep` skill | Scaffold only (objective.md) |
| PM `/objective` loop | Native + CLI prompt | `/objective` command + `curator.mjs prompt` | Charter only |
| state.yaml v2 | Yes | Yes (prep) | Yes |
| Scout/Approval Gate/Worker | Codex toml + Claude md | `goal-*.md` agents | Queued, not in repo |
| Local board hub | `curator.localhost:41737` | Same (board cmd in state) | Snapshot generated |
| doctor | `--target codex\|claude` | `doctor` (cursor only) | Missing |
| install | `npx cursor-curator` | `curator.mjs install` | Missing |
| check-objective-state / parallel-plan / check-update | Yes | Yes (in skill tree) | Missing |
| Codex/Claude plugins | Yes | N/A (by design) | N/A |
| npm publish | `curator` | N/A (`cursor-curator-cursor` not on npm) | None |

## Ranked implementation slices (largest safe first)

1. **Port repo skeleton + vendored Cursor payload** — Copy/adapt `~/.cursor/skills/{cursor-curator,objective-prep}`, `agents-src`, `commands-src`, `surfaces/`, `scripts/` into repo; `package.json` with `install` script → `~/.cursor`; README; `npm run check` (node --check/--test).
2. **Repo-local doctor/verify** — Document and wire `doctor --objective-ready`, `check-objective-state` on sample goal; CI optional.
3. **Install-from-clone UX** — Single command (node scripts/install.mjs or npm postinstall) without Codex/Claude paths.
4. **Parity doc + update sync** — `docs/PARITY.md` vs 0.3.8; `check-update` against npm `curator`.
5. **Deferred:** Codex plugin, Claude plugin, superpowers, site.

## Candidate Approval Gate tasks (T002)

- Pick slice #1 with explicit `allowed_files` (root package.json, README, cursor-curator/, objective-prep/, scripts/).
- Defer Codex/Claude, MCP, full superpowers.
- Verify: `node scripts/curator.mjs doctor --objective-ready` from fresh clone path (or documented copy).

## Contradictions

- Charter/state `existing_plan_facts` say workspace empty; prep added board + 6 files.
- Operator already has Cursor port in `~/.cursor` but port **repo** has no distributable payload yet.

## Ambiguity (Judge)

- Source of truth for vendoring: upstream npm pack vs existing local cursor tree vs hybrid.
- Publish `cursor-curator-cursor` to npm or git-only install.
- MVP scope: match local install vs re-sync from upstream 0.3.8 on every release.
