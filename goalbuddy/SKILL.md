---
name: goalbuddy
description: >-
  GoalBuddy operating loop for long Cursor coding tasks: goal oracles, local
  boards, state.yaml truth, Scout/Judge/Worker subagents, receipts, and
  verification. Use for goal-prep, /goal, state.yaml, goal board, parallel-plan,
  or multi-session work that needs a finish line and proof loop.
disable-model-invocation: true
---

# GoalBuddy (Cursor)

GoalBuddy gives long agent runs a **finish line**, a **live work surface**, and a **proof loop**. Work stays in your repo under `docs/goals/<slug>/`.

## Mental model

```text
Intent -> Oracle -> Surface -> Loop -> Proof
```

| Phase | Role | Cursor surface |
|-------|------|----------------|
| Prep | PM compiler | `/goal-prep` + [goal-prep skill](../goal-prep/SKILL.md) |
| Scout | Read-only map | `Task` subagent `goal-scout` |
| Judge | Slice gate | `Task` subagent `goal-judge` |
| Worker | Bounded write | `Task` subagent `goal-worker` |
| Loop | PM owns `state.yaml` | `/goal` command |
| Surface | Board view | `/goal-board` or local hub |

**No oracle, no serious goal.** See [reference/oracle.md](reference/oracle.md).

## Quick start

1. Run `/goal-prep` with your outcome (or load the goal-prep skill).
2. Confirm `docs/goals/<slug>/{goal.md,state.yaml,notes/}` exist.
3. Run `/goal` with the printed goal path.
4. Optional: `/goal-board` or open [Open GoalBuddy board](http://goalbuddy.localhost:41737/<slug>/).

Install or verify Cursor surfaces:

```bash
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs install
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs doctor --goal-ready
```

Enable the **goalbuddy** MCP server (merged into `.cursor/mcp.json` on install). `/goal` and subagents require MCP tools in Phase B.

## MCP tools (Phase B)

| Tool | Purpose |
|------|---------|
| `list_goals` | Hub summary without opening the browser |
| `get_goal_state` | Parsed `state.yaml` as JSON |
| `get_active_task` | Active task row + validation |
| `validate_state` | Gate before advancing state |
| `render_task_prompt` | Canonical Task handoff prompt |
| `parallel_plan` | Safe parallel Worker hints |
| `validate_receipt` | Gate before writing receipts |
| `completion_check` | Readiness for `goal.status: done` |
| `append_session_note` | Append to `notes/SESSION.md` |

Server entry: `goalbuddy/mcp/server.mjs` (stdio). No write tools — PM still owns `state.yaml`.

Project config (committed in this port):

```json
{
  "mcpServers": {
    "goalbuddy": {
      "command": "node",
      "args": ["goalbuddy/mcp/server.mjs"]
    }
  }
}
```

After `install`, the same entry is merged with an absolute path to `~/.cursor/skills/goalbuddy/mcp/server.mjs`.

## What it creates

```
docs/goals/<slug>/
  goal.md              # charter (editable)
  state.yaml           # source of truth
  notes/               # long receipts
  subgoals/            # optional depth-1 child boards
  .goalbuddy-board/    # generated board artifacts
```

## state.yaml contract

- `version: 2`
- `goal.oracle` — required pressure on completion
- `active_task` — exactly one active task id (e.g. `T001`)
- `tasks[]` — scout | judge | worker | pm types with `objective`, `receipt`, status
- `rules.pm_owns_state: true` — only PM (main agent) mutates state unless a task explicitly allows Worker writes to listed files
- `agents.scout|worker|judge` — set to `installed` after `goalbuddy doctor`

Worker tasks must include `allowed_files`, `verify`, and `stop_if` before execution.

Slice policy: [reference/slicing.md](reference/slicing.md). Subgoals: [reference/subgoals.md](reference/subgoals.md). Receipts: [reference/receipts.md](reference/receipts.md).

## Cursor subagents

Spawn via the **Task** tool with `subagent_type`:

| Task type | subagent_type |
|-----------|---------------|
| scout | `goal-scout` |
| judge | `goal-judge` |
| worker | `goal-worker` |

If Task reports unknown `subagent_type`, run `goalbuddy install`, then **restart Cursor** so `~/.cursor/agents/goal-*.md` reload.

Upstream prompt scripts emit `goal_scout` (underscore). Map to hyphenated Cursor names when spawning.

## PM loop (each /goal turn)

**Use goalbuddy MCP tools** — see [commands-src/goal.md](commands-src/goal.md). Mandatory sequence:

1. `get_active_task` → `validate_state` (stop if errors)
2. `render_task_prompt` → spawn Task subagent (scout/judge/worker)
3. `validate_receipt` before writing state
4. PM updates `state.yaml`
5. `validate_state` again → `append_session_note`

CLI equivalents (fallback only):

```bash
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs prompt docs/goals/<slug> --task <T###> --json
node ~/.cursor/skills/goalbuddy/scripts/check-goal-state.mjs docs/goals/<slug>
```

## Auto-loop (Phase C)

Requires `CURSOR_API_KEY` from [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations).

```bash
export CURSOR_API_KEY="cursor_..."
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs run docs/goals/<slug> --auto 3
```

| Flag | Purpose |
|------|---------|
| `--auto N` | Run up to N PM turns via `@cursor/sdk` |
| `--parallel` | Use `parallel_plan` spawn hints for disjoint Workers |
| `--dry-run` | Offline loop test with `GOALBUDDY_MOCK_AGENT_TEXT` |
| `--json` | Machine-readable run report |

The runner uses the same validators as MCP (`validate_state`, `validate_receipt`) and writes `notes/SESSION.md` each turn. `/goal` remains for manual single-turn control.

Package: `packages/goal-runner` (`@goalbuddy/runner`).

## Parallel work (read-only recommendations)

```bash
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs parallel-plan docs/goals/<slug> --json
```

Reports safe parallel Scout or disjoint Worker scopes; does not mutate state or spawn agents.

## Local board

```bash
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs board docs/goals/<slug>
```

Default hub: `http://goalbuddy.localhost:41737/<slug>/`. Share as a Markdown link so it is clickable.

## CLI reference

| Command | Purpose |
|---------|---------|
| `install` | Copy agents + slash commands + merge MCP config |
| `doctor [--goal-ready]` | Node, files, agents, MCP config, MCP smoke, DNS, port |
| `reset` | Remove installer-managed agents/commands only |
| `update` | Check npm `goalbuddy` version; refresh vendored scripts |
| `prompt <slug>` | Compact task handoff (Cursor agent names) |
| `parallel-plan <slug>` | Parallel safety report |
| `receipt <file\|json>` | Validate `goalbuddy_receipt_v1` JSON |
| `completion-check <slug>` | Check readiness for `goal.status: done` |
| `stale [--days 7]` | List stale goals under `docs/goals/` |
| `hub [--json]` | Multi-goal hub summary |
| `run <slug> --auto N` | SDK auto-loop runner (Phase C) |
| `board <slug>` | Start local board server |

Skill root: `~/.cursor/skills/goalbuddy/`. Never install skills under `~/.cursor/skills-cursor/` (reserved).

## Templates

Copy from `templates/` when scaffolding manually:

- `templates/goal.md`, `templates/state.yaml`, `templates/note.md`

## Pitfalls

1. **Wrong skill directory** — use `~/.cursor/skills/goalbuddy/`, not `skills-cursor/`.
2. **Subagent lag** — new `~/.cursor/agents/goal-*.md` files may require a Cursor restart before `Task` recognizes them.

## License

MIT — see [LICENSE](LICENSE). Ported from [tolibear/goalbuddy](https://github.com/tolibear/goalbuddy).
