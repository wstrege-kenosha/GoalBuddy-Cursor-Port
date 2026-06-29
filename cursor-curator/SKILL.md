---
name: cursor-curator
description: >-
  Cursor Curator operating loop for long Cursor coding tasks: success criteria, local
  boards, SQLite board state (.cursor-curator/curator.db), Scout/Approval Gate/Worker subagents, receipts, and
  verification. Use for objective-prep, /objective, curator.db, objective board, parallel-plan,
  or multi-session work that needs a finish line and proof loop.
disable-model-invocation: true
---

# Cursor Curator (Cursor)

Cursor Curator gives long agent runs a **finish line**, a **live work surface**, and a **proof loop**. Work stays in your repo under `docs/objectives/<slug>/`.

## Mental model

```text
Intent -> Success criteria -> Surface -> Loop -> Proof
```

| Phase | Role | Cursor surface |
|-------|------|----------------|
| Prep | PM compiler | `/objective-prep` + [objective-prep skill](../objective-prep/SKILL.md) |
| Scout | Read-only map | `Task` subagent `objective-scout` |
| Approval Gate | Slice gate | `Task` subagent `objective-approval-gate` |
| Worker | Bounded write | `Task` subagent `objective-worker` |
| Loop | PM owns board state | `/objective` command |
| Surface | Board view | `/objective-board` or local hub |

**No success criteria, no serious objective.** See [reference/success-criteria.md](reference/success-criteria.md).

## Quick start

1. Run `/objective-prep` with your outcome (or load the objective-prep skill).
2. Confirm `docs/objectives/<slug>/{objective.md,notes/}` exist and the slug is in `.cursor-curator/curator.db` (`curator db import` after prep).
3. Run `/objective` with the printed objective path.
4. Optional: `/objective-board` or open the [multi-objective hub](http://curator.localhost:41737/) or [objective board](http://curator.localhost:41737/<slug>/).

Install or verify Cursor surfaces:

```bash
bun ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs install
bun ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs doctor --objective-ready
```

Upgrading from port **1.0.0**? See [docs/wiki/Migration-1.0-to-2.0.md](../../docs/wiki/Migration-1.0-to-2.0.md). **YAML → JSON v3?** [docs/wiki/Migration-5.0.md](../../docs/wiki/Migration-5.0.md). **JSON → SQLite?** [docs/wiki/Migration-6.0.md](../../docs/wiki/Migration-6.0.md). **Node/npm → Bun?** [docs/wiki/Migration-Node-to-Bun.md](../../docs/wiki/Migration-Node-to-Bun.md).

Enable the **cursor-curator** MCP server in Cursor settings after install. `/objective` and subagents use MCP tools for validation and prompts.

## MCP tools

| Tool | Purpose |
|------|---------|
| `list_objectives` | Hub summary without opening the browser |
| `get_objective_state` | Parsed board state as JSON |
| `get_active_task` | Active task row + validation |
| `validate_state` | Gate before advancing state |
| `render_task_prompt` | Canonical Task handoff prompt |
| `parallel_plan` | Safe parallel Worker hints |
| `validate_receipt` | Gate before writing receipts |
| `completion_check` | Readiness for `objective.status: done` |
| `append_session_note` | Append to `notes/SESSION.md` |
| `session_resume_digest` | Turn-0 handoff: session, validation, stale nudge |
| `verify_worker_receipt` | Cross-check Worker receipt vs `task.verify` |
| `blocked_tasks` | Blocked task list + optional Approval Gate triage plan |
| `misfire_audit_check` | Intake misfire audit due / recommendation |
| `subobjective_rollup_check` | Pending child rollups when subobjective is done |
| `apply_receipt` | Apply validated receipt + advance task (PM-owned) |
| `patch_task` / `patch_objective` | Targeted board edits |
| `register_objective` | Register a new objective in the workspace DB |
| `db_import` | Import legacy `state.json` files into SQLite |

Project config (committed in this port):

```json
{
  "mcpServers": {
    "cursor-curator": {
      "command": "bun",
      "args": ["cursor-curator/dist/mcp/server.mjs"]
    }
  }
}
```

After `install`, the same entry is merged with an absolute path to `~/.cursor/skills/cursor-curator/mcp/server.mjs`.

## What it creates

```
docs/objectives/<slug>/
  objective.md              # charter (editable)
  notes/                    # long receipts
  subobjectives/            # optional depth-1 child board dirs
  .cursor-curator-board/    # generated board artifacts

.cursor-curator/
  curator.db                # runtime board state (SQLite, workspace-scoped)
```

Legacy `state.json` files are **never read at runtime** — use `curator db import` once, then `db:<slug>` / MCP only.

## Board state contract

- **Runtime:** `.cursor-curator/curator.db` (logical board path `db:<slug>`)
- **Schema:** v3 `StateV3` (Zod-validated; see `src/schema/state-v3.ts`)
- **Import:** legacy `state.json` / one-time YAML→JSON via `scripts/migrate-5.0.mts`, then `curator db import`
- `objective.success_criteria` — required pressure on completion
- `active_task` — exactly one active task id (e.g. `T001`)
- `tasks[]` — scout | approval_gate | worker | pm types with `objective`, `receipt`, status
- `rules.pm_owns_state: true` — only PM (main agent) mutates state unless a task explicitly allows Worker writes to listed files
- `agents.scout|worker|approval_gate` — set to `installed` after `curator doctor`

Worker tasks must include `allowed_files`, `verify`, and `stop_if` before execution.

Slice policy: [reference/slicing.md](reference/slicing.md). Sub-objectives: [reference/subobjectives.md](reference/subobjectives.md). Receipts: [reference/receipts.md](reference/receipts.md).

## Cursor subagents

Spawn via the **Task** tool with `subagent_type`:

| Task type | subagent_type |
|-----------|---------------|
| scout | `objective-scout` |
| approval_gate | `objective-approval-gate` |
| worker | `objective-worker` |

If Task reports unknown `subagent_type`, run `curator install`, then **restart Cursor** so `~/.cursor/agents/objective-*.md` reload.

Prompt scripts emit `objective_scout` (underscore). Map to hyphenated Cursor names when spawning.

## PM loop (each /objective turn)

**Use cursor-curator MCP tools only** — see [commands-src/objective.md](commands-src/objective.md). Do not substitute CLI commands during `/objective` turns (CLI respawns Bun each call; MCP stays warm). Mandatory sequence:

0. `session_resume_digest` (turn 0) — optional `list_objectives` with `stale_days`
1. `get_active_task` → `validate_state` (stop if errors)
2. `misfire_audit_check` / `subobjective_rollup_check` when applicable
3. `parallel_plan` (mandatory before Task spawn for scout/approval_gate/worker)
4. If `spawn_plan.length >= 1`: batch-spawn all Task subagents in one turn using each entry's `task_prompt`; else `render_task_prompt` → single Task spawn
5. `validate_receipt` → `verify_worker_receipt` per board (serial merge)
6. PM writes via `apply_receipt` / `patch_task` / `patch_objective` → `validate_state` → `append_session_note`

CLI is for install/doctor/board smoke and human debugging — **not** for the PM loop above. If MCP is down, fix MCP (install + restart Cursor); do not run `resume` / `check-objective` as a substitute inside `/objective`.

```bash
bun ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs doctor --json
bun ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs check-objective <slug>   # human/debug only
```

## Parallel work (default PM batching)

Each `/objective` turn calls `parallel_plan` before spawning subagents. When `spawn_mode` is `parallel`, PM batch-spawns every entry in `spawn_plan` in one assistant turn (multiple Task tool calls). Workers run in parallel only when parent + subobjective boards have disjoint `allowed_files` and `rules.max_write_workers >= 2`.

```bash
bun ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs parallel-plan docs/objectives/<slug> --json
```

Inspect `spawn_plan`, `spawn_mode`, `max_write_workers`, and `worker_candidate_count`. PM still merges receipts per board and owns state.

## Local board

```bash
bun ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs board docs/objectives/<slug>
```

Default hub: `http://curator.localhost:41737/` (all objectives) or `http://curator.localhost:41737/<slug>/` (single board). Share as a Markdown link so it is clickable.

Board implementation: `cursor-curator/src/board/` (compiled to `dist/board/`). CLI entry: `scripts/local-objective-board.mjs`.

## Shared libraries (`cursor-curator/scripts/lib/`)

| Module | Role |
|--------|------|
| `objective-state.mjs` | Load/validate board state from SQLite via `dist/state/` + `dist/db/` |
| `objective-receipt.mjs` | Parse/validate `cursor_curator_receipt_v1` |
| `objective-completion.mjs` | Readiness for `objective.status: done` |
| `objective-verify.mjs` | Cross-check Worker receipts vs `task.verify` |
| `objective-session.mjs` | `notes/SESSION.md` digest + resume handoff |
| `objective-stale.mjs` | Stale objective detection |
| `objective-hub.mjs` | Multi-objective hub payload |
| `objective-misfire.mjs` | Intake misfire audit scheduling |
| `objective-blocked.mjs` | Blocked task triage |
| `objective-subobjective.mjs` | Depth-1 rollup checks |
| `objective-state-write.mjs` | Receipt application helpers (PM-owned writes) |

## CLI reference

| Command | Purpose |
|---------|---------|
| `install` | Copy agents + slash commands + merge MCP config |
| `doctor [--objective-ready]` | Bun, files, agents, MCP config, MCP smoke, DNS, port |
| `reset` | Remove installer-managed agents/commands only |
| `update` | Check registry version; refresh vendored scripts |
| `prompt <slug>` | Compact task handoff (Cursor agent names) |
| `parallel-plan <slug>` | Parallel safety report |
| `receipt <file\|json>` | Validate `cursor_curator_receipt_v1` JSON |
| `completion-check <slug>` | Check readiness for `objective.status: done` |
| `resume <slug>` | Turn-0 session/validation handoff digest |
| `verify-receipt <slug>` | Cross-check Worker receipt vs `task.verify` |
| `blocked <slug>` | List blocked tasks + triage hints |
| `misfire-audit <slug>` | Intake misfire audit due / recommendation |
| `subobjective-rollup <slug>` | Pending child rollups when subobjective is done |
| `stale [--days 7]` | List stale objectives under `docs/objectives/` |
| `hub [--json]` | Multi-objective hub summary |
| `check-objective <slug>` | Validate board state in SQLite |
| `register-objective <slug>` | Register a new objective in `curator.db` |
| `db import` | Import legacy `state.json` into `curator.db` |
| `board <slug>` | Start local board server |

Skill root: `~/.cursor/skills/cursor-curator/`. Never install skills under `~/.cursor/skills-cursor/` (reserved).

## Templates

Copy from `templates/` when scaffolding manually:

- `templates/objective.md`, `templates/state.json` (canonical skeleton for `register_objective`), `templates/note.md`

## Pitfalls

1. **Wrong skill directory** — use `~/.cursor/skills/cursor-curator/`, not `skills-cursor/`.
2. **Subagent lag** — new `~/.cursor/agents/objective-*.md` files may require a Cursor restart before `Task` recognizes them.
3. **MCP disabled** — `/objective` stops without `validate_state`; run `curator install` and enable MCP in Cursor settings.

## License

MIT — see [LICENSE](LICENSE). Ported from [tolibear/goalbuddy](https://github.com/tolibear/goalbuddy).
