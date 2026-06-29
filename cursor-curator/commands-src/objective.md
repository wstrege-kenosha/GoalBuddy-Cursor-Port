# objective

Cursor Curator PM orchestrator for Cursor.

## Input

The user message after this command is the objective path or charter reference, typically:

```text
Follow docs/objectives/<slug>/objective.md.
```

Resolve `docs/objectives/<slug>/state.json` relative to the workspace root.

## MCP required (Phase B)

Use the **cursor-curator** MCP server for every turn. Do not advance `state.json` or spawn Task subagents until the mandatory tool sequence below succeeds.

If MCP tools are unavailable, stop and tell the user to run:

```bash
node ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs install
```

Then enable the `curator` server in Cursor MCP settings and retry.

## Each turn (mandatory sequence)

0. **session_resume_digest** `{ "objective": "<slug>" }` — turn-0 handoff (session preview, validation, last verification). If stale, also **list_objectives** `{ "stale_days": 7 }`.
1. **get_active_task** `{ "objective": "<slug>" }` — confirm `active_task` and task type.
2. **validate_state** `{ "objective": "<slug>" }` — if `ok` is false, report errors and **stop**; do not advance.
2b. **misfire_audit_check** `{ "objective": "<slug>" }` — if `due`, queue an Approval Gate misfire audit before spawning a new Worker.
2c. **subobjective_rollup_check** `{ "objective": "<slug>" }` — if pending rollups, PM writes `rollup_receipt` on the parent task.
3. If task type is **pm**, execute directly (no Task spawn). After edits, call **validate_state** again before reporting done.
3b. **parallel_plan** `{ "objective": "<slug>" }` — **mandatory** before any Task spawn when the active task is scout | approval_gate | worker. Read `spawn_plan`, `spawn_mode`, `max_write_workers`, and `worker_candidate_count`.
4. **Parallel spawn policy** (scout | approval_gate | worker only; PM tasks never batch-spawn):
   - If `spawn_plan.length >= 1`:
     - Spawn **all** `spawn_plan` entries in **one assistant turn** using multiple **Task** tool calls (parallel tool batching).
     - Use each entry's `task_prompt` directly — do **not** call `render_task_prompt` again for those entries.
     - Set `subagent_type` from `cursor_task_subagent_type`, `description` like `Cursor Curator Worker T004`, and `prompt` from `task_prompt` plus board path and task objective.
     - In Multitask Mode, set `run_in_background: true` on each Task call.
   - If `spawn_plan` is empty:
     - **render_task_prompt** `{ "objective": "<slug>", "task_id": "<T###>" }` for the root `active_task`
     - Spawn one **Task** as before.
5. Parse `cursor_curator_receipt_v1` from each subagent response. If any receipt is missing, treat that board as blocked.
6. **Receipt merge** (serial, per board — use each entry's `board_path` from `spawn_plan` or the root board):
   - **validate_receipt** with parsed JSON, `role`, and `task_id`. If `ok` is false for any receipt, **stop**; do not write to state for that board.
   - For Worker + `result: done`, **verify_worker_receipt** for that board's `task_id` — cross-check `receipt.commands` against `task.verify`; PM writes `checks.last_verification` on **that** board only.
   - Do not advance a board's `active_task` on partial batch failure; treat missing or invalid receipts as blocked for that board.
7. Write receipt notes under the matching objective's `notes/<task_id>-<role>.md` when useful.
8. Update each affected `state.json` (PM-owned):
   - Set task `receipt` summary and `status` (done | blocked) on the board named in the receipt's `board_path`
   - Advance `active_task` on that board when done and rules allow
   - Apply Approval Gate `required_board_updates` as PM-owned edits
   - On blocked tasks, use **blocked_tasks** `{ "objective": "<slug>", "triage": true }` for triage hints
9. **validate_state** again after substantial state changes. If `ok` is false, **stop** and fix before continuing.
10. **append_session_note** `{ "objective_slug": "<slug>", "task_id": "<T###>", "summary": "<one line>" }` for session handoff.
11. Report: active task, receipt summary(ies), validation status, `spawn_mode`, next step.

Parallel Workers require disjoint `allowed_files` across parent and subobjective boards and `rules.max_write_workers >= 2`. Approval Gate must approve that contract before PM expects `spawn_mode: "parallel"`.

## Completion

Before setting `objective.status: done`:

```text
completion_check { "objective": "<slug>" }
```

Only mark full outcome complete when `ready` is true and Approval Gate/PM audit maps receipts to `objective.success_criteria`.

## Subagent discovery

If Task fails with unknown `subagent_type`:

```bash
node ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs install
```

Then ask the user to restart Cursor and retry.

## Reference

See `cursor-curator/SKILL.md`, `reference/receipts.md`, and `reference/success-criteria.md`.
