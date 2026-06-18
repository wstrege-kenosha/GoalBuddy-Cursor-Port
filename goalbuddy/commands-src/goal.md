# goal

GoalBuddy PM orchestrator for Cursor.

## Input

The user message after this command is the goal path or charter reference, typically:

```text
Follow docs/goals/<slug>/goal.md.
```

Resolve `docs/goals/<slug>/state.yaml` relative to the workspace root.

## MCP required (Phase B)

Use the **goalbuddy** MCP server for every turn. Do not advance `state.yaml` or spawn Task subagents until the mandatory tool sequence below succeeds.

If MCP tools are unavailable, stop and tell the user to run:

```bash
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs install
```

Then enable the `goalbuddy` server in Cursor MCP settings and retry.

## Each turn (mandatory sequence)

1. **get_active_task** `{ "goal": "<slug>" }` — confirm `active_task` and task type.
2. **validate_state** `{ "goal": "<slug>" }` — if `ok` is false, report errors and **stop**; do not advance.
3. If task type is **pm**, execute directly (no Task spawn). After edits, call **validate_state** again before reporting done.
4. For scout | judge | worker:
   - **render_task_prompt** `{ "goal": "<slug>", "task_id": "<T###>" }`
   - Spawn **Task** with:
     - `subagent_type`: value from `metadata.cursor_task_subagent_type` (`goal-scout` | `goal-judge` | `goal-worker`)
     - `description`: short title like `GoalBuddy Scout T001`
     - `prompt`: full rendered prompt JSON plus board path and task objective
5. Parse `goalbuddy_receipt_v1` from the subagent response. If missing, treat as blocked.
6. **validate_receipt** with the parsed JSON, `role`, and `task_id`. If `ok` is false, **stop**; do not write to state.
7. Write receipt notes under `docs/goals/<slug>/notes/<task_id>-<role>.md` when useful.
8. Update `state.yaml` (PM-owned):
   - Set task `receipt` summary and `status` (done | blocked)
   - Advance `active_task` when done and rules allow
   - Apply Judge `required_board_updates` as PM-owned edits
9. **validate_state** again after substantial state changes. If `ok` is false, **stop** and fix before continuing.
10. **append_session_note** `{ "goal_slug": "<slug>", "task_id": "<T###>", "summary": "<one line>" }` for session handoff.
11. Report: active task, receipt summary, validation status, next step.

## Parallel workers

Before spawning multiple Workers in one turn:

```text
parallel_plan { "goal": "<slug>" }
```

Only spawn entries in `spawn_plan` when `safe_to_parallelize` is true. PM still merges receipts and owns state.

## Completion

Before setting `goal.status: done`:

```text
completion_check { "goal": "<slug>" }
```

Only mark full outcome complete when `ready` is true and Judge/PM audit maps receipts to `goal.oracle`.

## Subagent discovery

If Task fails with unknown `subagent_type`:

```bash
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs install
```

Then ask the user to restart Cursor and retry.

## Reference

Skill: `~/.cursor/skills/goalbuddy/SKILL.md`
MCP tools: `list_goals`, `get_goal_state`, `get_active_task`, `validate_state`, `render_task_prompt`, `parallel_plan`, `validate_receipt`, `completion_check`, `append_session_note`
