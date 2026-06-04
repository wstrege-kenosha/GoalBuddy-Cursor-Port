---
name: goal-prep
description: >-
  GoalBuddy Goal Prep for Cursor. Prepares docs/goals/<slug>/ boards with goal.md,
  state.yaml, and notes/ for long-running work. Use when the user runs /goal-prep,
  wants a goal board, or needs structured intake before /goal.
disable-model-invocation: true
---

# Goal Prep (Cursor)

`/goal-prep` prepares a GoalBuddy board. It does **not** run `/goal` automatically.

## Boundary (strict)

During Goal Prep, do **not**:

- Implement the user's product request
- Edit files outside `docs/goals/<slug>/`
- Spawn subagents for implementation work

Allowed:

- Run update check: `node ~/.cursor/skills/goalbuddy/scripts/check-update.mjs --json`
- Ask intake questions (one at a time when vague)
- Create `docs/goals/<slug>/goal.md`, `state.yaml`, `notes/.gitkeep`, `.goalbuddy-board/` as needed
- Start local board (unless user opts out)
- Run `goalbuddy doctor` for agent status (read-only)
- Print the exact next command: `/goal Follow docs/goals/<slug>/goal.md.`

## Intake (minimum)

Collect or infer:

1. **Original request** — shortest faithful user wording
2. **Interpreted outcome** — one sentence of what must become true
3. **Oracle** — observable proof (test, demo, artifact, metric, review, source-backed answer, decision)
4. **Slug** — kebab-case directory name under `docs/goals/`

For vague goals, ask one guided question at a time with 2–3 options and a recommended default. Stop after each question until intake is sufficient or the user accepts defaults.

## Scaffold steps

1. Choose slug `<goal-slug>` (unique under `docs/goals/`).
2. Create directory `docs/goals/<goal-slug>/`.
3. Copy templates from `~/.cursor/skills/goalbuddy/templates/`:
   - `goal.md` — fill title, outcome, oracle, constraints from intake
   - `state.yaml` — set `goal.slug`, `goal.title`, `goal.oracle`, `intake.*`, initial `T001` scout task
   - `notes/.gitkeep`
4. Set `agents.scout|worker|judge` from doctor if available, else `bundled_not_installed`.
5. Set `visual_board.local.command` to:

   ```text
   node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs board docs/goals/<goal-slug>
   ```

6. Unless user opts out of visual board, run board command and include clickable link:

   `[Open GoalBuddy board](http://goalbuddy.localhost:41737/<goal-slug>/)`

7. Print exactly:

   ```text
   /goal Follow docs/goals/<goal-slug>/goal.md.
   ```

8. Ask: start `/goal` now, refine board, or stop.

## Board shape by input

| Input shape | First tasks |
|-------------|-------------|
| vague | Scout T001, Judge T002, Worker T003 queued |
| specific | Scout or Judge first per evidence gaps |
| existing_plan | PM/Judge validate plan facts, then Worker slices |
| recovery | Scout/Judge triage before writes |
| audit | read-only until user approves execution |

Use template `state.yaml` as the starting skeleton; adjust `tasks` and `active_task` accordingly.

## Update check

At start, if `check-update.mjs` reports `update_available`, mention once:

```text
GoalBuddy <version> is available on npm. Refresh vendored scripts with:
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs update
```

Do not block prep on network failure.

## Related

Full loop: [goalbuddy SKILL.md](../goalbuddy/SKILL.md). Oracle detail: [reference/oracle.md](../goalbuddy/reference/oracle.md).
