# Usage

## In Cursor (manual PM loop)

1. `/goal-prep` — describe your outcome; GoalBuddy scaffolds `docs/goals/<slug>/` in your workspace.
2. `/goal Follow docs/goals/<slug>/goal.md.` — PM runs Scout → Judge → Worker using **goalbuddy MCP tools** each turn.

### MCP tool sequence (each `/goal` turn)

1. `get_active_task` → `validate_state` (stop if errors)
2. `render_task_prompt` → spawn Task subagent (`goal-scout` | `goal-judge` | `goal-worker`)
3. `validate_receipt` before writing state
4. PM updates `state.yaml`
5. `validate_state` again → `append_session_note`

## Auto-loop (SDK)

Requires `CURSOR_API_KEY` from [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations).

```bash
export CURSOR_API_KEY="cursor_..."
node goalbuddy/scripts/goalbuddy.mjs run docs/goals/<slug> --auto 3
```

| Flag | Purpose |
|------|---------|
| `--auto N` | Up to N PM turns via `@cursor/sdk` |
| `--parallel` | Parallel Workers when `parallel_plan` says safe |
| `--dry-run` | Offline test with `GOALBUDDY_MOCK_AGENT_TEXT` |
| `--json` | Machine-readable run report |

`/goal` remains for manual single-turn control; `run` is for batch velocity.

## CLI (after install)

```bash
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs doctor --goal-ready
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs hub --json
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs board docs/goals/<slug>
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs prompt docs/goals/<slug> --task T001 --json
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs completion-check docs/goals/<slug>
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs stale --days 7
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs receipt notes/T003-worker.md --role worker
```

## Local board and hub

- **Hub** (all goals): http://goalbuddy.localhost:41737/
- **Single goal**: http://goalbuddy.localhost:41737/<slug>/

Use http://127.0.0.1:41737/ if `goalbuddy.localhost` does not resolve.

## Repo layout

| Path | Purpose |
|------|---------|
| `goalbuddy/` | Main skill (scripts, MCP, agents, board) |
| `goal-prep/` | Prep skill |
| `packages/goal-runner/` | SDK auto-loop (`@goalbuddy/runner`) |
| `scripts/install-from-repo.mjs` | Install into `~/.cursor/skills` |
