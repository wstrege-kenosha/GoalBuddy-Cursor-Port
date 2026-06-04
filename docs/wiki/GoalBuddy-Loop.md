# GoalBuddy loop

```
Intent → Oracle → Surface → Loop → Proof
```

## Roles

| Role | Job |
|------|-----|
| **Scout** | Read-only map of repo and constraints |
| **Judge** | Pick the largest safe useful slice; set Worker contract |
| **Worker** | Implement one slice with `allowed_files` and verify commands |
| **PM** | Owns `state.yaml`, advances the board |

## Source of truth

- Charter: `docs/goals/<slug>/goal.md`
- Board: `docs/goals/<slug>/state.yaml`
- Long notes: `docs/goals/<slug>/notes/`

## Oracle

Every goal needs an observable finish line (tests, demo, public URL, review). The goal does not complete on planning alone.

## Cursor agents

After install, Cursor exposes `goal-scout`, `goal-judge`, and `goal-worker` subagents plus `/goal-prep`, `/goal`, and `/goal-board` commands.
