# GoalBuddy Cursor Port

Git-installable [GoalBuddy](https://github.com/tolibear/goalbuddy) port for Cursor (`cursorPortVersion` **1.0.0**, `upstreamVersion` **0.3.8**).

Upstream parity matrix: [docs/PARITY.md](docs/PARITY.md).

## Install

```bash
git clone <this-repo-url>
cd GoalBuddyCursorPort
node scripts/install-from-repo.mjs
```

Or after clone:

```bash
npm run install:cursor
```

The installer copies `goalbuddy/` and `goal-prep/` into your Cursor skills directory (`~/.cursor/skills` on macOS/Linux, `%USERPROFILE%\.cursor\skills` on Windows), then runs `goalbuddy.mjs install` to register agents and slash commands.

## Verify

```bash
npm run check
node goalbuddy/scripts/goalbuddy.mjs doctor
node goalbuddy/scripts/goalbuddy.mjs doctor --goal-ready
```

## Smoke goal

After install, validate a minimal completed Scout/Judge/Worker board:

```bash
node goalbuddy/scripts/check-goal-state.mjs docs/goals/sample-cursor-smoke/state.yaml
node goalbuddy/scripts/goalbuddy.mjs board docs/goals/sample-cursor-smoke
```

See `docs/goals/sample-cursor-smoke/goal.md`.

## Usage

1. In any workspace: `/goal-prep` to scaffold `docs/goals/<slug>/`.
2. Then: `/goal Follow docs/goals/<slug>/goal.md.`

CLI entry (after install):

```bash
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs doctor --goal-ready
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs board docs/goals/<slug>
```

## Layout

| Path | Purpose |
|------|---------|
| `goalbuddy/` | Main GoalBuddy skill (scripts, agents-src, commands-src, board surface) |
| `goal-prep/` | `/goal-prep` skill |
| `scripts/install-from-repo.mjs` | Copy skills + run Cursor install |
