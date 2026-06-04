# goal

GoalBuddy PM orchestrator for Cursor.

## Input

The user message after this command is the goal path or charter reference, typically:

```text
Follow docs/goals/<slug>/goal.md.
```

Resolve `docs/goals/<slug>/state.yaml` relative to the workspace root.

## Each turn

1. Read `goal.md` and `state.yaml`.
2. Read `active_task` and that task's `type` (scout | judge | worker | pm).
3. Render handoff:

   ```bash
   node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs prompt docs/goals/<slug> --task <active_task_id> --json
   ```

4. Spawn the subagent via **Task** with:
   - `subagent_type`: `goal-scout` | `goal-judge` | `goal-worker` (hyphenated; map from prompt metadata if needed)
   - `description`: short title like `GoalBuddy Scout T001`
   - `prompt`: full rendered prompt from step 3 plus board path and task objective

5. Parse `goalbuddy_receipt_v1` from the subagent response. If missing, treat as blocked.

6. Write receipt notes under `docs/goals/<slug>/notes/<task_id>-<role>.md` when useful.

7. Update `state.yaml`:
   - Set task `receipt` summary and `status` (done | blocked)
   - Advance `active_task` to the next queued task when done and rules allow
   - For Judge `required_board_updates`, apply PM-owned edits (Worker task fields, blocked flags)

8. Validate when state changes are substantial:

   ```bash
   node ~/.cursor/skills/goalbuddy/scripts/check-goal-state.mjs docs/goals/<slug>
   ```

9. Report: active task, receipt summary, next step. Continue the loop in the same session if the user wants, or stop with clear handoff.

## PM-only tasks

When `active_task` type is `pm`, execute directly without Task spawn.

## Completion

Only mark full outcome complete after Judge/PM audit maps receipts and verification to `goal.oracle`. Set `goal.status: done` and `full_outcome_complete` per board schema.

## Subagent discovery

If Task fails with unknown `subagent_type`:

```bash
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs install
```

Then ask the user to restart Cursor and retry.

## Reference

Skill: `~/.cursor/skills/goalbuddy/SKILL.md`
