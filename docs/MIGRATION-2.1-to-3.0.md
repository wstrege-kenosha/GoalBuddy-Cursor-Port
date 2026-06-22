# Migrate Cursor Curator 2.1.0 → 3.0.0

Use this guide when upgrading from **2.1.0** (GoalBuddy-branded port) to **3.0.0** (**Cursor Curator**).

## What changed (summary)

| Area | 2.1.0 | 3.0.0 |
|------|-------|-------|
| Product name | GoalBuddy Cursor Port | **Cursor Curator** |
| Skill folder | `goalbuddy/` | `cursor-curator/` |
| Prep skill | `goal-prep/` | `curator-prep/` |
| CLI | `goalbuddy` | `curator` |
| MCP server key | `goalbuddy` | `cursor-curator` |
| Env vars | `GOALBUDDY_*` | `CURATOR_*` |
| Board dotdir | `.goalbuddy-board/` | `.cursor-curator-board/` |
| Hub host | `goalbuddy.localhost` | `curator.localhost` |
| Receipt schema | `goalbuddy_receipt_v1` | `cursor_curator_receipt_v1` |
| Finish line | `goal.oracle` | `objective.success_criteria` |
| Gate subagent | Judge (`goal-judge`, `type: judge`) | **Approval Gate** (`goal-approval-gate`, `type: approval_gate`) |

**Breaking:** Existing objective boards must be migrated. Validation no longer accepts `goal.oracle` or `type: judge`.

---

## Quick upgrade

```bash
cd Cursor-Curator
git pull
npm install
npm run install:cursor
node cursor-curator/scripts/curator.mjs migrate
```

Then in Cursor:

1. **Settings → MCP** — disable/remove `goalbuddy`; enable **`cursor-curator`**.
2. Remove legacy install artifacts (if present):
   - `~/.cursor/skills/goalbuddy/`
   - `~/.cursor/bin/goalbuddy` and `goalbuddy.cmd`
3. **Restart Cursor** (agents, commands, MCP reload).
4. Verify:

```bash
npm run check
node cursor-curator/scripts/curator.mjs doctor --objective-ready
```

Confirm `cursorPortVersion` is **3.0.0**:

```bash
node -e "console.log(require('./cursor-curator/version.json').cursorPortVersion)"
```

---

## Migrate existing objective boards

The migration script updates `state.yaml`, `objective.md`, notes, embedded commands, and renames `.goalbuddy-board/` → `.cursor-curator-board/`.

Dry run:

```bash
node cursor-curator/scripts/curator.mjs migrate --dry-run
```

Single objective:

```bash
node cursor-curator/scripts/curator.mjs migrate --path docs/objectives/my-goal
```

All goals under `docs/objectives/` in the current repo:

```bash
node cursor-curator/scripts/curator.mjs migrate
```

---

## Manual checklist

- [ ] GitHub repo renamed to `Cursor-Curator` (optional but recommended; update clone URL in README)
- [ ] `curator` on PATH (`~/.cursor/bin`)
- [ ] Agents: `goal-scout`, `goal-approval-gate`, `goal-worker` in `~/.cursor/agents/`
- [ ] Commands: `curator-prep.md`, `objective.md`, `objective-board.md` in `~/.cursor/commands/`
- [ ] Hub: http://curator.localhost:41737/ (or http://127.0.0.1:41737/ if `.localhost` does not resolve)

---

## Upstream attribution

Cursor Curator is a Cursor port forked from [tolibear/goalbuddy](https://github.com/tolibear/goalbuddy) 0.3.8. Parity notes: [docs/PARITY.md](PARITY.md).
