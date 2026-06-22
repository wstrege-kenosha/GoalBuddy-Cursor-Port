# Receipts

Receipts are durable evidence that a Scout, Approval Gate, or Worker task finished. Long content goes in `notes/`; summaries go in `state.yaml` task `receipt` fields.

## File naming

```
notes/T001-scout.md
notes/T002-approval-gate.md
notes/T003-worker.md
```

## JSON receipt (returned by subagents)

Scout, Approval Gate, and Worker subagents return a parseable JSON object with `cursor_curator_receipt_v1`. The PM (orchestrator) merges this into the board.

## PM duties after receipt

1. Validate receipt against task `expected_output` (`validate_receipt` MCP tool)
2. For done Workers, cross-check `receipt.commands` against `task.verify` (`verify_worker_receipt` — no shell re-run)
3. Update `tasks[].receipt` in `state.yaml`
4. Write `checks.last_verification` when Worker verification passes
5. Set task `status` to `done` or `blocked`
6. Advance `active_task` to the next queued task per board rules
7. Run `node <skill>/scripts/check-objective-state.mjs <objective-dir>` when state changes are non-trivial

## Blocked tasks

If `result: blocked`, do not advance blindly. Call `blocked_tasks` with `triage: true` and queue Approval Gate triage or PM reorientation.
