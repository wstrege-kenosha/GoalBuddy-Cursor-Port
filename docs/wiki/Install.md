# Install

## Clone

```bash
git clone https://github.com/wstrege-kenosha/GoalBuddy-Cursor-Port.git
cd GoalBuddy-Cursor-Port
node scripts/install-from-repo.mjs
```

Or:

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

```bash
node goalbuddy/scripts/check-goal-state.mjs docs/goals/sample-cursor-smoke/state.yaml
node goalbuddy/scripts/goalbuddy.mjs board docs/goals/sample-cursor-smoke
```

See [Usage](Usage) and the repo file `docs/goals/sample-cursor-smoke/goal.md`.
