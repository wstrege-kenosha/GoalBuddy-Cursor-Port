---
name: cursor-curator
description: >-
  Cursor Curator operating loop for long Cursor coding tasks: success criteria, local
  boards, state.yaml truth, Scout/Approval Gate/Worker subagents, receipts, and
  verification. Use for objective-prep, /objective, state.yaml, objective board, parallel-plan,
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
| Loop | PM owns `state.yaml` | `/objective` command |
| Surface | Board view | `/objective-board` or local hub |

**No success criteria, no serious objective.** See [reference/success-criteria.md](reference/success-criteria.md).

## Quick start

1. Run `/objective-prep` with your outcome (or load the objective-prep skill).
2. Confirm `docs/objectives/<slug>/{objective.md,state.yaml,notes/}` exist.
3. Run `/objective` with the printed objective path.
4. Optional: `/objective-board` or open the [multi-objective hub](http://curator.localhost:41737/) or [objective board](http://curator.localhost:41737/<slug>/).

Install or verify Cursor surfaces:

```bash
node ~/.cursor/skills/cursor-curator/scripts/curator.mjs install
node ~/.cursor/skills/cursor-curator/scripts/curator.mjs doctor --objective-ready
```

Upgrading from port **1.0.0**? See [../../docs/MIGRATION-1.0-to-2.0.md](../../docs/MIGRATION-1.0-to-2.0.md).

Enable the **cursor-curator** MCP server in Cursor settings after install. `/objective` and subagents use MCP tools for validation and prompts.

## MCP tools

| Tool | Purpose |
|------|---------|
| `list_objectives` | Hub summary without opening the browser |
| `get_objective_state` | Parsed `state.yaml` as JSON |
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
| `subgoal_rollup_check` | Pending child rollups when subobjective is done |

Server entry: `cursor-curator/mcp/server.mjs` (stdio). No write tools — PM still owns `state.yaml`.

Project config (committed in this port):

```json
{
  "mcpServers": {
    "cursor-curator": {
      "command": "node",
      "args": ["cursor-curator/mcp/server.mjs"]
    }
  }
}
```

After `install`, the same entry is merged with an absolute path to `~/.cursor/skills/cursor-curator/mcp/server.mjs`.

## What it creates

```
docs/objectives/<slug>/
  objective.md              # charter (editable)
  state.yaml           # source of truth
  notes/               # long receipts
  subgoals/            # optional depth-1 child boards
  .cursor-curator-board/    # generated board artifacts
```

## state.yaml contract

- `version: 2`
- `objective.success_criteria` — required pressure on completion
- `active_task` — exactly one active task id (e.g. `T001`)
- `tasks[]` — scout | approval_gate | worker | pm types with `objective`, `receipt`, status
- `rules.pm_owns_state: true` — only PM (main agent) mutates state unless a task explicitly allows Worker writes to listed files
- `agents.scout|worker|approval_gate` — set to `installed` after `curator doctor`

Worker tasks must include `allowed_files`, `verify`, and `stop_if` before execution.

Slice policy: [reference/slicing.md](reference/slicing.md). Subgoals: [reference/subgoals.md](reference/subgoals.md). Receipts: [reference/receipts.md](reference/receipts.md).

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

**Use cursor-curator MCP tools** — see [commands-src/objective.md](commands-src/objective.md). Mandatory sequence:

0. `session_resume_digest` (turn 0) — optional `list_objectives` with `stale_days`
1. `get_active_task` → `validate_state` (stop if errors)
2. `misfire_audit_check` / `subgoal_rollup_check` when applicable
3. `render_task_prompt` → spawn Task subagent (scout/approval_gate/worker)
4. `validate_receipt` → `verify_worker_receipt` for done Workers
5. PM updates `state.yaml` → `validate_state` → `append_session_note`

CLI equivalents (fallback only):

```bash
node ~/.cursor/skills/cursor-curator/scripts/curator.mjs prompt docs/objectives/<slug> --task <T###> --json
node ~/.cursor/skills/cursor-curator/scripts/check-objective-state.mjs docs/objectives/<slug>
```

## Parallel work (read-only recommendations)

```bash
node ~/.cursor/skills/cursor-curator/scripts/curator.mjs parallel-plan docs/objectives/<slug> --json
```

Reports safe parallel Scout or disjoint Worker scopes; does not mutate state or spawn agents.

## Local board

```bash
node ~/.cursor/skills/cursor-curator/scripts/curator.mjs board docs/objectives/<slug>
```

Default hub: `http://curator.localhost:41737/` (all objectives) or `http://curator.localhost:41737/<slug>/` (single board). Share as a Markdown link so it is clickable.

## Shared libraries (`cursor-curator/scripts/lib/`)

| Module | Role |
|--------|------|
| `objective-state.mjs` | Validate `state.yaml` |
| `objective-receipt.mjs` | Parse/validate `cursor_curator_receipt_v1` |
| `objective-completion.mjs` | Readiness for `objective.status: done` |
| `objective-verify.mjs` | Cross-check Worker receipts vs `task.verify` |
| `objective-session.mjs` | `notes/SESSION.md` digest + resume handoff |
| `objective-stale.mjs` | Stale objective detection |
| `objective-hub.mjs` | Multi-objective hub payload |
| `objective-misfire.mjs` | Intake misfire audit scheduling |
| `objective-blocked.mjs` | Blocked task triage |
| `objective-subgoal.mjs` | Depth-1 rollup checks |
| `objective-state-write.mjs` | Receipt application helpers (PM-owned writes) |

## CLI reference

| Command | Purpose |
|---------|---------|
| `install` | Copy agents + slash commands + merge MCP config |
| `doctor [--objective-ready]` | Node, files, agents, MCP config, MCP smoke, DNS, port |
| `reset` | Remove installer-managed agents/commands only |
| `update` | Check npm `curator` version; refresh vendored scripts |
| `prompt <slug>` | Compact task handoff (Cursor agent names) |
| `parallel-plan <slug>` | Parallel safety report |
| `receipt <file\|json>` | Validate `cursor_curator_receipt_v1` JSON |
| `completion-check <slug>` | Check readiness for `objective.status: done` |
| `resume <slug>` | Turn-0 session/validation handoff digest |
| `verify-receipt <slug>` | Cross-check Worker receipt vs `task.verify` |
| `blocked <slug>` | List blocked tasks + triage hints |
| `misfire-audit <slug>` | Intake misfire audit due / recommendation |
| `subgoal-rollup <slug>` | Pending child rollups when subobjective is done |
| `stale [--days 7]` | List stale objectives under `docs/objectives/` |
| `hub [--json]` | Multi-objective hub summary |
| `board <slug>` | Start local board server |

Skill root: `~/.cursor/skills/cursor-curator/`. Never install skills under `~/.cursor/skills-cursor/` (reserved).

## Templates

Copy from `templates/` when scaffolding manually:

- `templates/objective.md`, `templates/state.yaml`, `templates/note.md`

## Pitfalls

1. **Wrong skill directory** — use `~/.cursor/skills/cursor-curator/`, not `skills-cursor/`.
2. **Subagent lag** — new `~/.cursor/agents/objective-*.md` files may require a Cursor restart before `Task` recognizes them.
3. **MCP disabled** — `/objective` stops without `validate_state`; run `curator install` and enable MCP in Cursor settings.

## License

MIT — see [LICENSE](LICENSE). Ported from [tolibear/goalbuddy](https://github.com/tolibear/goalbuddy).
