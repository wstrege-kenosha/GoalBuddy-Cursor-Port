# Cursor Curator loop

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

- Charter: `docs/objectives/<slug>/objective.md`
- Board: `docs/objectives/<slug>/state.yaml`
- Long notes: `docs/objectives/<slug>/notes/`
- Session log: `docs/objectives/<slug>/notes/SESSION.md` (optional)

## Oracle

Every objective needs an observable finish line (tests, demo, public URL, review). The objective does not complete on planning alone.

## Cursor surfaces

After install:

| Surface | Purpose |
|---------|---------|
| `/objective-prep` | Scaffold a new objective |
| `/objective` | Manual PM loop (MCP-gated) |
| `/objective-board` | Open local board |
| `objective-scout` / `objective-approval-gate` / `objective-worker` | Task subagents |
| **cursor-curator MCP** | Validation, prompts, receipts, completion gates |

## MCP tools

| Tool | When to use |
|------|-------------|
| `validate_state` | Before and after PM edits state |
| `render_task_prompt` | Before spawning a subagent |
| `validate_receipt` | Before writing receipt into state |
| `completion_check` | Before `objective.status: done` |
| `parallel_plan` | Before parallel Workers |
| `list_objectives` / `hub` | Multi-goal visibility |

## Proof loop

1. Subagent returns `cursor_curator_receipt_v1` JSON
2. PM validates receipt (MCP or `curator receipt` CLI)
3. PM writes receipt summary into `state.yaml`
4. `check-objective-state` / `validate_state` must pass before advancing
