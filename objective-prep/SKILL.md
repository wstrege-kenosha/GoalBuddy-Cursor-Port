---
name: objective-prep
description: Cursor Curator Objective Prep for Cursor. Prepares docs/objectives/<slug>/ with objective.md, SQLite board state in curator.db, and notes/ for long-running work. Use when the user runs /objective-prep, wants an objective board, or needs structured intake before /objective.
disable-model-invocation: true
---

# Objective Prep (Cursor)

`/objective-prep` prepares a Cursor Curator board. It does **not** run `/objective` automatically.

## Boundary (strict)

During Objective Prep, do **not**:

- Implement the user's product request
- Edit files outside `docs/objectives/<slug>/`
- Spawn subagents for implementation work
- Write `state.json` to disk (runtime board state lives in `.cursor-curator/curator.db`)

Allowed:

- Run update check: `bun ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs check-update --json`
- Ask intake questions (one at a time when vague)
- Create `docs/objectives/<slug>/objective.md`, `notes/.gitkeep`, `.cursor-curator-board/` as needed
- Register board state via MCP **`register_objective`** (or CLI `register-objective`)
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
3. Copy and fill `objective.md` from `~/.cursor/skills/cursor-curator/templates/objective.md` (title, outcome, success criteria, constraints from intake).
4. Create `notes/.gitkeep`.
5. **Register board state in SQLite** (required before `/objective` or board UI):
   - **Preferred (MCP):** `register_objective` with:
     - `objective`: `<objective-slug>`
     - `state`: full v3 board object built from `templates/state.json` skeleton — set `objective.slug`, `objective.title`, `objective.success_criteria`, `intake.*`, `tasks[]`, `active_task`, and `visual_board.local.command`
   - **CLI fallback:**

     ```bash
     bun ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs register-objective <objective-slug>
     ```

     For a custom board payload, pass the full `state` object to MCP `register_objective` (not a file on disk).

6. **`validate_state`** `{ "objective": "<objective-slug>" }` — stop and fix errors before continuing.
7. Set `agents.scout|worker|approval_gate` via **`patch_objective`** from doctor if available, else `bundled_not_installed`.
8. Set `visual_board.local.command` in the registered state to:

   ```text
   bun ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs board docs/objectives/<objective-slug>
   ```

9. Unless user opts out of visual board, run board command and include clickable link:

   `[Open Cursor Curator board](http://curator.localhost:41737/<objective-slug>/)`

10. Register this workspace for MCP (required once per project):

    ```bash
    bun ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs workspace register
    ```

11. Print exactly:

    ```text
    /objective Follow docs/objectives/<objective-slug>/objective.md.
    ```

12. Ask: start `/objective` now, refine board, or stop.

## Board shape by input

| Input shape | First tasks |
|-------------|-------------|
| vague | Scout T001, Approval Gate T002, Worker T003 queued |
| specific | Scout or Approval Gate first per evidence gaps |
| existing_plan | PM/Approval Gate validate plan facts, then Worker slices |
| recovery | Scout/Approval Gate triage before writes |
| audit | read-only until user approves execution |

Use `templates/state.json` as the in-memory skeleton when building the `state` payload for `register_objective`; adjust `tasks` and `active_task` accordingly. Do not treat per-objective `state.json` files as runtime source of truth.

## Legacy import

If an objective directory already has `state.json` from an older workflow, run once:

```bash
bun ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs db import --slug <objective-slug>
```

Then remove committed `state.json` after confirming `validate_state` passes.

## Update check

At start, if `check-update.mjs` reports `update_available`, mention once:

```text
Cursor Curator <version> is available. Refresh vendored scripts with:
bun ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs update
```

Do not block prep on network failure.

## Related

Full loop: [cursor SKILL.md](../cursor-curator/SKILL.md). SQLite migration: [Migration 6.0](https://github.com/wstrege-kenosha/Cursor-Curator/blob/master/docs/wiki/Migration-6.0.md). Oracle detail: [reference/success-criteria.md](../cursor-curator/reference/success-criteria.md).
