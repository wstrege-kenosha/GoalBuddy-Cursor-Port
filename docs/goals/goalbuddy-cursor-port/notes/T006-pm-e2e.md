# T006 PM — Live operator E2E

**Date:** 2026-06-04

## Goal Prep (live equivalent)

Operator ran Goal Prep flow in Cursor session (PM), creating:

- `docs/goals/goal-prep-live-test/goal.md`
- `docs/goals/goal-prep-live-test/state.yaml`
- `docs/goals/goal-prep-live-test/notes/`

**Next command printed:**

```text
/goal Follow docs/goals/goal-prep-live-test/goal.md.
```

## Live Scout → Judge → Worker

| Task | Agent | Transcript |
|------|-------|------------|
| T001 | goal-scout | a3af28a6 |
| T002 | goal-judge | 22848679 |
| T003 | goal-worker | c269b1d3 |

Proof artifact: `docs/goals/goal-prep-live-test/notes/live-cycle-proof.md`

## Board

[Open live test board](http://goalbuddy.localhost:41737/goal-prep-live-test/)

## Verify

```text
node goalbuddy/scripts/check-goal-state.mjs docs/goals/goal-prep-live-test/state.yaml
```

Result: `ok: true` (2026-06-04)

## Distinction from sample-cursor-smoke

`sample-cursor-smoke` was Worker-scaffolded fixture receipts. `goal-prep-live-test` was prep-created then advanced by live Task spawns in this session.
