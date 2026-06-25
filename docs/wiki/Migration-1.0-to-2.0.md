# Migrate 1.0.0 → 2.0.0

Upgrade guide for existing Cursor Curator installs.

> **Upgrading from 2.0.0?** SDK auto-loop was removed in **2.1.0**. See [Migration 2.0 → 2.1](Migration-2.0-to-2.1).

## Quick steps

```bash
cd Cursor-Curator
git pull
npm install
npm run install:cursor
```

1. **Cursor Settings → MCP** — enable `curator`
2. **Restart Cursor**
3. Verify: `node cursor-curator/dist/cli/curator.mjs doctor --objective-ready`

## What you must do differently

| 1.0.0 | 2.0.0 |
|-------|-------|
| `/objective` + CLI prompts | `/objective` + **MCP tools** (`validate_state`, `render_task_prompt`, `validate_receipt`) |
| Install skills only | Install skills **and** MCP config |
| Manual turns only | Manual `/objective` each turn (same in 2.1.0) |

**No `state.yaml` migration** — existing goals work as-is.

## Verify version

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync('cursor-curator/version.json','utf8')).cursorPortVersion)"
# 2.1.0
```

See [Usage](Usage) and [Troubleshooting](Troubleshooting) for MCP issues.
