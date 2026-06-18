# Migrate 1.0.0 → 2.0.0

Upgrade guide for existing GoalBuddy Cursor Port installs.

**Full doc in repo:** `docs/MIGRATION-1.0-to-2.0.md`

> **Upgrading from 2.0.0?** SDK auto-loop was removed in **2.1.0**. See [Migration 2.0 → 2.1](Migration-2.0-to-2.1).

## Quick steps

```bash
cd GoalBuddy-Cursor-Port
git pull
npm install
npm run install:cursor
```

1. **Cursor Settings → MCP** — enable `goalbuddy`
2. **Restart Cursor**
3. Verify: `node goalbuddy/scripts/goalbuddy.mjs doctor --goal-ready`

## What you must do differently

| 1.0.0 | 2.0.0 |
|-------|-------|
| `/goal` + CLI prompts | `/goal` + **MCP tools** (`validate_state`, `render_task_prompt`, `validate_receipt`) |
| Install skills only | Install skills **and** MCP config |
| Manual turns only | Manual `/goal` each turn (same in 2.1.0) |

**No `state.yaml` migration** — existing goals work as-is.

## Verify version

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('goalbuddy/version.json','utf8')).cursorPortVersion)"
# 2.1.0
```

See [Usage](Usage) and [Troubleshooting](Troubleshooting) for MCP issues.
