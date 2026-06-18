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
- Session log: `docs/goals/<slug>/notes/SESSION.md` (optional)

## Oracle

Every goal needs an observable finish line (tests, demo, public URL, review). The goal does not complete on planning alone.

## Cursor surfaces

After install:

| Surface | Purpose |
|---------|---------|
| `/goal-prep` | Scaffold a new goal |
| `/goal` | Manual PM loop (MCP-gated) |
| `/goal-board` | Open local board |
| `goal-scout` / `goal-judge` / `goal-worker` | Task subagents |
| **goalbuddy MCP** | Validation, prompts, receipts, completion gates |

## MCP tools

| Tool | When to use |
|------|-------------|
| `validate_state` | Before and after PM edits state |
| `render_task_prompt` | Before spawning a subagent |
| `validate_receipt` | Before writing receipt into state |
| `completion_check` | Before `goal.status: done` |
| `parallel_plan` | Before parallel Workers |
| `list_goals` / `hub` | Multi-goal visibility |

## Proof loop

1. Subagent returns `goalbuddy_receipt_v1` JSON
2. PM validates receipt (MCP or `goalbuddy receipt` CLI)
3. PM writes receipt summary into `state.yaml`
4. `check-goal-state` / `validate_state` must pass before advancing
