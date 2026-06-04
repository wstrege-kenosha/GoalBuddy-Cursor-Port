# Receipts

Receipts are durable evidence that a Scout, Judge, or Worker task finished. Long content goes in `notes/`; summaries go in `state.yaml` task `receipt` fields.

## File naming

```
notes/T001-scout.md
notes/T002-judge.md
notes/T003-worker.md
```

## JSON receipt (returned by subagents)

Scout, Judge, and Worker subagents return a parseable JSON object with `goalbuddy_receipt_v1`. The PM (orchestrator) merges this into the board.

## PM duties after receipt

1. Validate receipt against task `expected_output`
2. Update `tasks[].receipt` in `state.yaml`
3. Set task `status` to `done` or `blocked`
4. Advance `active_task` to the next queued task per board rules
5. Run `node <skill>/scripts/check-goal-state.mjs <goal-dir>` when state changes are non-trivial

## Blocked tasks

If `result: blocked`, do not advance blindly. Queue Judge triage or PM reorientation.
