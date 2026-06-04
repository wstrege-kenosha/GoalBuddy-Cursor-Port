# goal-prep

GoalBuddy Goal Prep for Cursor.

Load and follow the skill at `~/.cursor/skills/goal-prep/SKILL.md`.

Use the user's message after this command as the outcome to prepare. If empty, ask what outcome they want and run the intake flow.

Do not implement product work during prep. Scaffold only under `docs/goals/<slug>/`.

When prep completes, print:

```text
/goal Follow docs/goals/<slug>/goal.md.
```
