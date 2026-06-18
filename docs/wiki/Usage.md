# Usage

## In Cursor (PM loop)

1. `/goal-prep` — describe your outcome; GoalBuddy scaffolds `docs/goals/<slug>/` in your workspace.
2. `/goal Follow docs/goals/<slug>/goal.md.` — PM runs Scout → Judge → Worker using **goalbuddy MCP tools** each turn.

### MCP tool sequence (each `/goal` turn)

1. `get_active_task` → `validate_state` (stop if errors)
2. `render_task_prompt` → spawn Task subagent (`goal-scout` | `goal-judge` | `goal-worker`)
3. `validate_receipt` before writing state
4. PM updates `state.yaml`
5. `validate_state` again → `append_session_note`

## CLI (after install)

Add `%USERPROFILE%\.cursor\bin` (Windows) or `~/.cursor/bin` (macOS/Linux) to PATH. Then from any repo with a goal:

```bash
goalbuddy doctor --goal-ready
goalbuddy hub --json
goalbuddy board docs/goals/<slug>
goalbuddy prompt docs/goals/<slug> --task T001 --json
goalbuddy completion-check docs/goals/<slug>
goalbuddy stale --days 7
goalbuddy receipt notes/T003-worker.md --role worker
```

Or use the full path:

```bash
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs doctor --goal-ready
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
| `scripts/install-from-repo.mjs` | Install into `~/.cursor/skills` |
