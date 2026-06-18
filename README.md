# GoalBuddy Cursor Port

Git-installable [GoalBuddy](https://github.com/tolibear/goalbuddy) port for Cursor (`cursorPortVersion` **2.1.0**, `upstreamVersion` **0.3.8**).

Upstream parity matrix: [docs/PARITY.md](docs/PARITY.md). **Wiki:** [GoalBuddy Cursor Port wiki](https://github.com/wstrege-kenosha/GoalBuddy-Cursor-Port/wiki).

**Upgrading from 2.0.0?** See [docs/MIGRATION-2.0-to-2.1.md](docs/MIGRATION-2.0-to-2.1.md). **From 1.0.0?** See [docs/MIGRATION-1.0-to-2.0.md](docs/MIGRATION-1.0-to-2.0.md).

## What's in 2.1.0

- **Manual PM loop** — `/goal-prep` and `/goal` with **goalbuddy MCP tools** each turn
- **Multi-goal hub** at `http://goalbuddy.localhost:41737/` with goal discovery
- **MCP server** (`goalbuddy`) — validate state, render prompts, validate receipts, completion gates
- **CLI** — `doctor`, `board`, `hub`, `prompt`, `receipt`, `completion-check`, `stale`
- **Global `goalbuddy` command** — after install, add `~/.cursor/bin` to PATH

SDK auto-loop (`run --auto N`) was removed in 2.1.0; use `/goal` in Cursor chat instead.

## Install

```bash
git clone https://github.com/wstrege-kenosha/GoalBuddy-Cursor-Port.git
cd GoalBuddy-Cursor-Port
npm install
node scripts/install-from-repo.mjs
```

Or:

```bash
npm run install:cursor
```

The installer copies `goalbuddy/` and `goal-prep/` into your Cursor skills directory (`~/.cursor/skills` on macOS/Linux, `%USERPROFILE%\.cursor\skills` on Windows), runs `goalbuddy.mjs install` to register agents and slash commands, and merges the **goalbuddy** MCP entry into `.cursor/mcp.json`.

Enable the `goalbuddy` MCP server in Cursor settings after install.

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

**Canonical port board:** `docs/goals/goalbuddy-cursor-port/` (ported from [tolibear/goalbuddy](https://github.com/tolibear/goalbuddy)).

Open the hub: http://goalbuddy.localhost:41737/ — see `docs/goals/sample-cursor-smoke/goal.md`.

## Usage

### PM loop (chat)

1. `/goal-prep` — scaffold `docs/goals/<slug>/`
2. `/goal Follow docs/goals/<slug>/goal.md.` — PM uses **goalbuddy MCP tools** each turn

### CLI (after install)

Add `%USERPROFILE%\.cursor\bin` (Windows) or `~/.cursor/bin` (macOS/Linux) to PATH, then from any repo with a goal:

```bash
goalbuddy doctor --goal-ready
goalbuddy hub --json
goalbuddy board docs/goals/<slug>
goalbuddy completion-check docs/goals/<slug>
```

## Layout

| Path | Purpose |
|------|---------|
| `goalbuddy/` | Main skill (scripts, MCP server, agents, board) |
| `goal-prep/` | `/goal-prep` skill |
| `.cursor/mcp.json` | Project MCP config (goalbuddy server) |
| `scripts/install-from-repo.mjs` | Copy skills + run Cursor install |

## Publishing

Public repo: [github.com/wstrege-kenosha/GoalBuddy-Cursor-Port](https://github.com/wstrege-kenosha/GoalBuddy-Cursor-Port).

Re-run [Verify](#verify) from a fresh clone. Not on npm; upstream [tolibear/goalbuddy](https://github.com/tolibear/goalbuddy).
