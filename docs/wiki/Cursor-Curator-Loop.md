# Cursor Curator loop

```
Intent → Success criteria → Surface → Loop → Proof
```

## Roles

| Role | Job |
|------|-----|
| **Scout** | Read-only map of repo and constraints |
| **Approval Gate** | Pick the largest safe useful slice; set Worker contract |
| **Worker** | Implement one slice with `allowed_files` and verify commands |
| **PM** | Owns board state (SQLite `curator.db`), advances the board |

## Source of truth

- Charter: `docs/objectives/<slug>/objective.md`
- Board: `.cursor-curator/curator.db` (logical path `db:<slug>`)
- Long notes: `docs/objectives/<slug>/notes/`
- Session log: `docs/objectives/<slug>/notes/SESSION.md` (optional)

## Success criteria

Every objective needs an observable finish line (tests, demo, public URL, review). The objective does not complete on planning alone. Record proof in `objective.success_criteria` and `objective.intake.completion_proof`.

## Cursor surfaces

Requires [Bun](https://bun.sh) and `bun run install:cursor` (see [Install](Install)).

After install:

| Surface | Purpose |
|---------|---------|
| `/objective-prep` | Scaffold a new objective |
| `/objective` | Manual PM loop (MCP-gated) |
| `/objective-board` | Open local board |
| `objective-scout` / `objective-approval-gate` / `objective-worker` | Task subagents |
| **cursor-curator MCP** | Validation, prompts, receipts, verification, completion gates |

## MCP tools

| Tool | When to use |
|------|-------------|
| `session_resume_digest` | Turn-0 handoff; stale nudge via `list_objectives` |
| `validate_state` | Before and after PM edits state |
| `render_task_prompt` | Before spawning a subagent |
| `validate_receipt` | Before writing receipt into state |
| `verify_worker_receipt` | After done Worker — cross-check vs `task.verify` |
| `misfire_audit_check` / `subobjective_rollup_check` | Intake audit / child rollup when due |
| `blocked_tasks` | When tasks are blocked — triage hints |
| `completion_check` | Before `objective.status: done` |
| `parallel_plan` | **Every turn** before Task spawn — batch-spawn `spawn_plan` when safe; Workers need disjoint parent/subobjective `allowed_files` and `max_write_workers >= 2` |
| `list_objectives` / `hub` | Multi-objective visibility |

## Proof loop

1. Subagent returns `cursor_curator_receipt_v1` JSON
2. PM validates receipt (MCP or `curator receipt` CLI)
3. For done Workers, PM runs `verify_worker_receipt` and writes `checks.last_verification`
4. PM writes receipt summary via MCP (`apply_receipt` / `patch_task`)
5. `check-objective` / `validate_state` must pass before advancing

## Shared libraries

Implementation lives under `cursor-curator/src/` (compiled to `dist/`). Board rendering is in `src/board/`.
