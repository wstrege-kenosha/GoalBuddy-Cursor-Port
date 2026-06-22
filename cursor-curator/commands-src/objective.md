# objective

Cursor Curator PM orchestrator for Cursor.

## Input

The user message after this command is the objective path or charter reference, typically:

```text
Follow docs/objectives/<slug>/objective.md.
```

Resolve `docs/objectives/<slug>/state.yaml` relative to the workspace root.

## MCP required (Phase B)

Use the **cursor-curator** MCP server for every turn. Do not advance `state.yaml` or spawn Task subagents until the mandatory tool sequence below succeeds.

If MCP tools are unavailable, stop and tell the user to run:

```bash
node ~/.cursor/skills/cursor-curator/scripts/curator.mjs install
```

Then enable the `curator` server in Cursor MCP settings and retry.

## Each turn (mandatory sequence)

0. **session_resume_digest** `{ "objective": "<slug>" }` — turn-0 handoff (session preview, validation, last verification). If stale, also **list_objectives** `{ "stale_days": 7 }`.
1. **get_active_task** `{ "objective": "<slug>" }` — confirm `active_task` and task type.
2. **validate_state** `{ "objective": "<slug>" }` — if `ok` is false, report errors and **stop**; do not advance.
2b. **misfire_audit_check** `{ "objective": "<slug>" }` — if `due`, queue an Approval Gate misfire audit before spawning a new Worker.
2c. **subgoal_rollup_check** `{ "objective": "<slug>" }` — if pending rollups, PM writes `rollup_receipt` on the parent task.
3. If task type is **pm**, execute directly (no Task spawn). After edits, call **validate_state** again before reporting done.
4. For scout | approval_gate | worker:
   - **render_task_prompt** `{ "objective": "<slug>", "task_id": "<T###>" }`
   - Spawn **Task** with:
     - `subagent_type`: value from `metadata.cursor_task_subagent_type` (`objective-scout` | `objective-approval-gate` | `objective-worker`)
     - `description`: short title like `Cursor Curator Scout T001`
     - `prompt`: full rendered prompt JSON plus board path and task objective
5. Parse `cursor_curator_receipt_v1` from the subagent response. If missing, treat as blocked.
6. **validate_receipt** with the parsed JSON, `role`, and `task_id`. If `ok` is false, **stop**; do not write to state.
6b. For Worker + `result: done`, **verify_worker_receipt** — cross-check `receipt.commands` against `task.verify`; PM writes `checks.last_verification` (receipt cross-check only; no shell re-run).
7. Write receipt notes under `docs/objectives/<slug>/notes/<task_id>-<role>.md` when useful.
8. Update `state.yaml` (PM-owned):
   - Set task `receipt` summary and `status` (done | blocked)
   - Advance `active_task` when done and rules allow
   - Apply Approval Gate `required_board_updates` as PM-owned edits
   - On blocked tasks, use **blocked_tasks** `{ "objective": "<slug>", "triage": true }` for triage hints
9. **validate_state** again after substantial state changes. If `ok` is false, **stop** and fix before continuing.
10. **append_session_note** `{ "objective_slug": "<slug>", "task_id": "<T###>", "summary": "<one line>" }` for session handoff.
11. Report: active task, receipt summary, validation status, next step.

## Parallel workers

Before spawning multiple Workers in one turn:

```text
parallel_plan { "objective": "<slug>" }
```

Only spawn entries in `spawn_plan` when `safe_to_parallelize` is true. PM still merges receipts and owns state.

## Completion

Before setting `objective.status: done`:

```text
completion_check { "objective": "<slug>" }
```

Only mark full outcome complete when `ready` is true and Approval Gate/PM audit maps receipts to `objective.success_criteria`.

## Subagent discovery

If Task fails with unknown `subagent_type`:

```bash
node ~/.cursor/skills/cursor-curator/scripts/curator.mjs install
```

Then ask the user to restart Cursor and retry.

## Reference

See `cursor-curator/SKILL.md`, `reference/receipts.md`, and `reference/success-criteria.md`.
