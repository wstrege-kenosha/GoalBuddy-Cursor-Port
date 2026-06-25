# Sub-objectives

Use subobjectives for bounded child work that belongs to a parent task.

## Constraints

- **Depth 1 only** — child boards live under `subobjectives/<task-id>-<slug>/`
- **Non-recursive** — no subobjectives inside subobjectives
- **Single parent link** — exactly one parent task references the child
- Approval Gate must approve via `approve_subobjective` before PM promotes

## Layout

```
docs/objectives/<parent-slug>/
  state.yaml
  subobjectives/
    T004-board-view/
      objective.md
      state.yaml
      notes/
```

## When to use

- Parent task is too large for one Worker package but still one outcome branch
- Parallel read-only Scout work on a child board (never mutate parent from child Worker unless parent `state.yaml` is in `allowed_files`)

## Multiple boards

Use **separate** `docs/objectives/<slug>/` directories when parallel agents or separate objective runs are active at the same time — not subobjectives.
