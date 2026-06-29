# Success criteria

Success criteria are the observable signal that proves the original owner outcome is actually true.

Examples:

- Test suite green for the affected area
- Browser walkthrough of the feature path
- Demo transcript or screen recording
- Generated artifact on disk with expected content
- Benchmark or metric threshold
- Source-backed answer with citations
- Release checklist signed off
- Explicit human decision recorded in the board

## Rules

- Record success criteria in the workspace database under `objective.success_criteria` before shaping tasks (`register_objective` or `patch_objective`).
- Re-test against success criteria after each Worker package and at final audit.
- No success criteria, no serious objective — weak proof creates weak objectives.
- Do not mark `full_outcome_complete: true` until receipts and verification map back to success criteria.

## In board state (v3)

```json
"objective": {
  "success_criteria": {
    "signal": "<what must be observable>",
    "cadence": "after each Worker package and at final audit",
    "final_proof": "<receipt-backed evidence required before completion>"
  }
}
```

Read or validate via MCP `get_objective_state` / `validate_state`.
