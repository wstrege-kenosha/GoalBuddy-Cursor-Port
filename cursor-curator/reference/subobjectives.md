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
  subobjectives/
    T004-ui/
      objective.md
      notes/
```

Board state for parent and child lives in `.cursor-curator/curator.db` (`db:<parent-slug>`, `db:<child-slug>`). Legacy `state.json` files are import-only.

## When to use

- Parent task is too large for one Worker package but still one outcome branch
- Parallel read-only Scout work on a child board (never mutate parent from child Worker unless parent board files are in `allowed_files`)
- Parallel parent + child Workers when write scopes are disjoint and `rules.max_write_workers >= 2`

## Parallel parent + child Workers

Approval Gate (or PM during setup) should structure parallel work like this:

```json
// Parent board (excerpt; stored in curator.db)
"rules": { "max_write_workers": 2 },
"tasks": [{
  "id": "T004",
  "type": "worker",
  "status": "active",
  "allowed_files": ["src/feature/tests/**"],
  "subobjective": {
    "status": "active",
    "path": "subobjectives/T004-ui",
    "depth": 1
  }
}]

// Child board db:T004-ui (excerpt)
"tasks": [{
  "id": "T002",
  "type": "worker",
  "status": "active",
  "allowed_files": ["src/feature/ui/**"]
}]
```

Requirements:

- Parent and child `allowed_files` must **not** overlap (no shared globs or paths).
- Parent board sets `rules.max_write_workers: 2` before PM expects parallel Worker spawns.
- Reject parallel Workers when one slice must finish before the other can verify.
- PM calls `parallel_plan` each turn; when `spawn_mode` is `parallel`, spawn all `spawn_plan` entries in one turn.

Overlapping scopes (for example, both Workers listing the same module path) are blocked by `parallel_plan` and surface as validation warnings.

## Multiple boards

Use **separate** `docs/objectives/<slug>/` directories when parallel agents or separate objective runs are active at the same time — not subobjectives.
