# Sub-objectives

Use subgoals for bounded child work that belongs to a parent task.

## Constraints

- **Depth 1 only** — child boards live under `subgoals/<task-id>-<slug>/`
- **Non-recursive** — no subgoals inside subgoals
- **Single parent link** — exactly one parent task references the child
- Judge must approve via `approve_subgoal` before PM promotes

## Layout

```
docs/objectives/<parent-slug>/
  state.yaml
  subgoals/
    T004-board-view/
      objective.md
      state.yaml
      notes/
```

## When to use

- Parent task is too large for one Worker package but still one outcome branch
- Parallel read-only Scout work on a child board (never mutate parent from child Worker unless parent `state.yaml` is in `allowed_files`)

## Multiple boards

Use **separate** `docs/objectives/<slug>/` directories when parallel agents or separate goal runs are active at the same time — not subgoals.
