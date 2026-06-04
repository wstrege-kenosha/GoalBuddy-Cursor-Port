# Goal oracle

The oracle is the observable signal that proves the original owner outcome is actually true.

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

- Record the oracle in `state.yaml` under `goal.oracle` before shaping tasks.
- Re-test against the oracle after each Worker package and at final audit.
- No oracle, no serious goal — weak proof creates weak goals.
- Do not mark `full_outcome_complete: true` until receipts and verification map back to the oracle.

## In state.yaml

```yaml
goal:
  oracle:
    signal: "<what must be observable>"
    cadence: "after each Worker package and at final audit"
    final_proof: "<receipt-backed evidence required before completion>"
```
