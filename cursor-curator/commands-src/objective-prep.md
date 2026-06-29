# objective-prep

Cursor Curator Objective Prep for Cursor.

Load and follow the skill at `~/.cursor/skills/objective-prep/SKILL.md`.

Use the user's message after this command as the outcome to prepare. If empty, ask what outcome they want and run the intake flow.

Do not implement product work during prep. Scaffold only under `docs/objectives/<slug>/`.

Register board state in `.cursor-curator/curator.db` via MCP **`register_objective`** (see skill). Do not write runtime `state.json` to the objective directory.

When prep completes, print:

```text
/objective Follow docs/objectives/<slug>/objective.md.
```
