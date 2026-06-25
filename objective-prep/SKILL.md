---
name: objective-prep
description: Cursor Curator Objective Prep for Cursor. Prepares docs/objectives/<slug>/ boards with objective.md, state.json, and notes/ for long-running work. Use when the user runs /objective-prep, wants an objective board, or needs structured intake before /objective.
disable-model-invocation: true
---

# Objective Prep (Cursor)

`/objective-prep` prepares a Cursor Curator board. It does **not** run `/objective` automatically.

## Boundary (strict)

During Objective Prep, do **not**:

- Implement the user's product request
- Edit files outside `docs/objectives/<slug>/`
- Spawn subagents for implementation work

Allowed:

- Run update check: `node ~/.cursor/skills/cursor-curator/scripts/check-update.mjs --json`
- Ask intake questions (one at a time when vague)
- Create `docs/objectives/<slug>/objective.md`, `state.json`, `notes/.gitkeep`, `.cursor-curator-board/` as needed
- Start local board (unless user opts out)
- Run `curator doctor` for agent status (read-only)
- Print the exact next command: `/objective Follow docs/objectives/<slug>/objective.md.`

## Intake (minimum)

Collect or infer:

1. **Original request** — shortest faithful user wording
2. **Interpreted outcome** — one sentence of what must become true
3. **Success criteria** — observable proof (test, demo, artifact, metric, review, source-backed answer, decision)
4. **Slug** — kebab-case directory name under `docs/objectives/`

For vague objectives, ask one guided question at a time with 2–3 options and a recommended default. Stop after each question until intake is sufficient or the user accepts defaults.

## Scaffold steps

1. Choose slug `<objective-slug>` (unique under `docs/objectives/`).
2. Create directory `docs/objectives/<objective-slug>/`.
3. Copy templates from `~/.cursor/skills/cursor-curator/templates/`:
   - `objective.md` — fill title, outcome, success criteria, constraints from intake
   - `state.json` — set `objective.slug`, `objective.title`, `objective.success_criteria`, `intake.*`, initial `T001` scout task
   - `notes/.gitkeep`
4. Set `agents.scout|worker|approval_gate` from doctor if available, else `bundled_not_installed`.
5. Set `visual_board.local.command` to:

   ```text
   node ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs board docs/objectives/<objective-slug>
   ```

6. Unless user opts out of visual board, run board command and include clickable link:

   `[Open Cursor Curator board](http://curator.localhost:41737/<objective-slug>/)`

7. Register this workspace for MCP (required once per project):

   ```bash
   node ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs workspace register
   ```

8. Print exactly:

   ```text
   /objective Follow docs/objectives/<objective-slug>/objective.md.
   ```

9. Ask: start `/objective` now, refine board, or stop.

## Board shape by input

| Input shape | First tasks |
|-------------|-------------|
| vague | Scout T001, Approval Gate T002, Worker T003 queued |
| specific | Scout or Approval Gate first per evidence gaps |
| existing_plan | PM/Approval Gate validate plan facts, then Worker slices |
| recovery | Scout/Approval Gate triage before writes |
| audit | read-only until user approves execution |

Use template `state.json` as the starting skeleton; adjust `tasks` and `active_task` accordingly.

## Update check

At start, if `check-update.mjs` reports `update_available`, mention once:

```text
Cursor Curator <version> is available on npm. Refresh vendored scripts with:
node ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs update
```

Do not block prep on network failure.

## Related

Full loop: [cursor SKILL.md](../cursor-curator/SKILL.md). Oracle detail: [reference/success-criteria.md](../cursor-curator/reference/success-criteria.md).
