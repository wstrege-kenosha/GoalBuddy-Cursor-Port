# T006 PM — Live operator E2E

**Date:** 2026-06-04

## Objective Prep (live equivalent)

Operator ran Objective Prep flow in Cursor session (PM), creating:

- `docs/objectives/curator-prep-live-test/objective.md`
- `docs/objectives/curator-prep-live-test/state.yaml`
- `docs/objectives/curator-prep-live-test/notes/`

**Next command printed:**

```text
/objective Follow docs/objectives/curator-prep-live-test/objective.md.
```

## Live Scout → Approval Gate → Worker

| Task | Agent | Transcript |
|------|-------|------------|
| T001 | objective-scout | a3af28a6 |
| T002 | objective-approval-gate | 22848679 |
| T003 | objective-worker | c269b1d3 |

Proof artifact: `docs/objectives/curator-prep-live-test/notes/live-cycle-proof.md`

## Board

[Open live test board](http://curator.localhost:41737/curator-prep-live-test/)

## Verify

```text
node curator/scripts/check-objective-state.mjs docs/objectives/curator-prep-live-test/state.yaml
```

Result: `ok: true` (2026-06-04)

## Distinction from sample-cursor-smoke

`sample-cursor-smoke` was Worker-scaffolded fixture receipts. `curator-prep-live-test` was prep-created then advanced by live Task spawns in this session.
