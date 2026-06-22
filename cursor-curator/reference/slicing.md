# Slice sizing

Safe does not mean small. Safe means **bounded, explicit, verified, and reversible**.

Cursor Curator optimizes for the **largest safe useful slice**:

- A working screen
- A working API path
- A data pipeline step
- A backend vertical slice
- A real bug fix with evidence
- A milestone review

## Anti-patterns

Reject micro-slices when the board keeps adding:

- Helpers without outcome movement
- Contracts or proof files without implementation
- Doc-only notes without verification progress

## Policy (state.yaml)

```yaml
rules:
  slice_policy:
    max_consecutive_tiny_tasks: 2
    prefer_vertical_slices: true
    approval_gate_picks_largest_safe_slice: true
    worker_completes_whole_slice: true
```

## Approval Gate responsibility

Choose one coherent Worker package with:

- `objective` — outcome-moving, not helper-only
- `allowed_files` — explicit globs or paths
- `verify` — commands that prove the slice
- `stop_if` — when to block instead of guessing

## Worker responsibility

Complete the **whole** assigned slice inside `allowed_files`. Do not stop after the first helper if verification is still feasible.
