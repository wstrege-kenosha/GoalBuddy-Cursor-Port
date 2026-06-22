# Migration: Cursor Curator 3.0 → 4.0

4.0 is a **breaking structural** release. User-facing “Objective” terminology from 3.0 is unchanged; paths, YAML keys, commands, and MCP parameter names move from `goal` to `objective`.

## What changed

| 3.0 | 4.0 |
|-----|-----|
| `docs/goals/<slug>/` | `docs/objectives/<slug>/` |
| `goal.md` | `objective.md` |
| YAML root `goal:` | `objective:` |
| `/goal` PM command | `/objective` |
| `/goal-board` | `/objective-board` |
| MCP `list_goals`, `get_goal_state` | `list_objectives`, `get_objective_state` |
| MCP param `goal` | `objective` |
| `check-goal-state.mjs` | `check-objective-state.mjs` |
| `/curator doctor --goal-ready` | `curator doctor --objective-ready` |
| `goal-scout` / `goal-approval-gate` / `goal-worker` | `objective-scout` / `objective-approval-gate` / `objective-worker` |
| `/curator-prep`, `curator-prep/` | `/objective-prep`, `objective-prep/` |

**Unchanged:** YAML `subgoal:`, upstream `tolibear/goalbuddy` attribution.

## Automated migration

From your repo root (with 3.0 boards still under `docs/goals/` or already partially moved):

```bash
node cursor-curator/scripts/curator.mjs migrate
# preview only:
node cursor-curator/scripts/curator.mjs migrate --dry-run
# single board:
node cursor-curator/scripts/curator.mjs migrate --path docs/goals/my-slug
```

Then reinstall Cursor surfaces:

```bash
node cursor-curator/scripts/curator.mjs install --force
```

Enable MCP server `cursor-curator` in Cursor Settings → MCP.

## Manual checklist

1. Rename `docs/goals/` → `docs/objectives/` if migrate did not run.
2. Rename each `goal.md` → `objective.md`.
3. In `state.yaml`, change top-level `goal:` to `objective:` (leave `subgoal:` as-is).
4. Update charter references: `/objective Follow docs/objectives/<slug>/objective.md`.
5. Update PM/agent prompts to pass MCP `"objective": "<slug>"` instead of `"goal"`.
6. Reinstall agents so `~/.cursor/agents/objective-*.md` replace legacy `goal-*.md`.
7. Run `npm run check` and `node cursor-curator/scripts/curator.mjs doctor --objective-ready`.

## Fresh install

New repos should scaffold under `docs/objectives/` via `/objective-prep` and use 4.0 conventions from the start.
