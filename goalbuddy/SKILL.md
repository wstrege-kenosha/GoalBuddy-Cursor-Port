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

1. Read `docs/goals/<slug>/state.yaml` and `goal.md`.
2. Identify `active_task` and its `type`.
3. Render handoff prompt:

   ```bash
   node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs prompt docs/goals/<slug> --task <T###> --json
   ```

4. Spawn the matching subagent with the rendered prompt in `Task` `prompt`.
5. Parse `goalbuddy_receipt_v1` from the subagent result; write `notes/T###-<role>.md` if needed.
6. Update `state.yaml` (task receipt, status, advance `active_task` when done).
7. Optionally validate:

   ```bash
   node ~/.cursor/skills/goalbuddy/scripts/check-goal-state.mjs docs/goals/<slug>
   ```

8. Repeat until Judge/PM audit maps receipts to the oracle and records full outcome complete.

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
| `install` | Copy agents + slash commands into `~/.cursor/` |
| `doctor [--goal-ready]` | Node, files, agents, DNS, port checks |
| `reset` | Remove installer-managed agents/commands only |
| `update` | Check npm `goalbuddy` version; refresh vendored scripts |
| `prompt <slug>` | Compact task handoff (Cursor agent names) |
| `parallel-plan <slug>` | Parallel safety report |
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
