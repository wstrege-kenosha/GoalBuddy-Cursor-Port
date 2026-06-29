# Receipts

Receipts are durable evidence that a Scout, Approval Gate, or Worker task finished. Long content goes in `notes/`; summaries live in the workspace database (`curator.db`) on each task's `receipt` field.

## File naming

```
notes/T001-scout.md
notes/T002-approval-gate.md
notes/T003-worker.md
```

## JSON receipt (returned by subagents)

Scout, Approval Gate, and Worker subagents return a parseable JSON object with `cursor_curator_receipt_v1`. Set `board_path` to the logical path `db:<slug>`.

## PM duties after receipt

1. Validate receipt against task `expected_output` (`validate_receipt` MCP tool)
2. For done Workers, cross-check `receipt.commands` against `task.verify` (`verify_worker_receipt` — no shell re-run)
3. **`apply_receipt`** — merge receipt summary, set task `status` (`done` | `blocked`), advance `active_task` when rules allow
4. Worker verification freshness is written via `apply_receipt` / `checks.last_verification` in the database
5. Use **`patch_task`** / **`patch_objective`** for Approval Gate `required_board_updates`
6. **`validate_state`** after non-trivial board changes
7. CLI fallback: `curator check-objective <slug>`

## Blocked tasks

If `result: blocked`, do not advance blindly. Call `blocked_tasks` with `triage: true` and queue Approval Gate triage or PM reorientation.
