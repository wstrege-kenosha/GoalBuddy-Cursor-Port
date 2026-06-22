# Cursor Curator

Git-installable Cursor port of [tolibear/goalbuddy](https://github.com/tolibear/goalbuddy) for Cursor (`cursorPortVersion` **4.0.0**, `upstreamVersion` **0.3.8**).

Upstream parity matrix: [docs/PARITY.md](docs/PARITY.md). **Wiki:** [Cursor Curator wiki](https://github.com/wstrege-kenosha/Cursor-Curator/wiki).

**Upgrading from 2.1.0?** See [docs/MIGRATION-2.1-to-3.0.md](docs/MIGRATION-2.1-to-3.0.md). **From 2.0.0?** See [docs/MIGRATION-2.0-to-2.1.md](docs/MIGRATION-2.0-to-2.1.md). **From 1.0.0?** See [docs/MIGRATION-1.0-to-2.0.md](docs/MIGRATION-1.0-to-2.0.md).

## What's in 4.0.0

- **Structural Objective paths:** `docs/objectives/`, `objective.md`, YAML `objective:`, `/objective`, `/objective-board`
- MCP tools `list_objectives`, `get_objective_state`; param `objective`
- Migration: [docs/MIGRATION-3.0-to-4.0.md](docs/MIGRATION-3.0-to-4.0.md)

## What's in 3.0.0

- **Cursor Curator rebrand** — skill tree `cursor-curator/`, CLI `curator`, MCP key `cursor-curator`
- **Success criteria** — replaces GoalBuddy “oracle” (`objective.success_criteria` in `state.yaml`)
- **Approval Gate** — replaces Judge subagent (`objective-approval-gate`, `type: approval_gate`)
- **Manual PM loop** — `/objective-prep` and `/objective` with **cursor-curator MCP tools** each turn
- **Multi-objective hub** at `http://curator.localhost:41737/` with objective discovery
- **MCP server** (`cursor-curator`) — validate state, render prompts, validate receipts, completion gates
- **CLI** — `doctor`, `board`, `hub`, `prompt`, `receipt`, `completion-check`, `stale`, `migrate`
- **Global `curator` command** — after install, add `~/.cursor/bin` to PATH

## Install

```bash
git clone https://github.com/wstrege-kenosha/Cursor-Curator.git
cd Cursor-Curator
npm install
node scripts/install-from-repo.mjs
```

Or:

```bash
npm run install:cursor
```

The installer copies `cursor-curator/` and `objective-prep/` into your Cursor skills directory (`~/.cursor/skills` on macOS/Linux, `%USERPROFILE%\.cursor\skills` on Windows), runs `curator.mjs install` to register agents and slash commands, and merges the **cursor-curator** MCP entry into `.cursor/mcp.json`.

Enable the `cursor-curator` MCP server in Cursor settings after install.

## Verify

```bash
npm run check
node cursor-curator/scripts/curator.mjs doctor
node cursor-curator/scripts/curator.mjs doctor --objective-ready
```

## Smoke objective

```bash
node cursor-curator/scripts/check-objective-state.mjs docs/objectives/sample-cursor-smoke/state.yaml
node cursor-curator/scripts/curator.mjs board docs/objectives/sample-cursor-smoke
```

**Canonical port board:** `docs/objectives/cursor-curator/` (ported from [tolibear/goalbuddy](https://github.com/tolibear/goalbuddy)).

Open the hub: http://curator.localhost:41737/ — see `docs/objectives/sample-cursor-smoke/objective.md`.

## Usage

### PM loop (chat)

1. `/objective-prep` — scaffold `docs/objectives/<slug>/`
2. `/objective Follow docs/objectives/<slug>/objective.md.` — PM uses **cursor-curator MCP tools** each turn

### CLI (after install)

Add `%USERPROFILE%\.cursor\bin` (Windows) or `~/.cursor/bin` (macOS/Linux) to PATH, then from any repo with an objective:

```bash
curator doctor --objective-ready
curator hub --json
curator board docs/objectives/<slug>
curator completion-check docs/objectives/<slug>
```

## Layout

| Path | Purpose |
|------|---------|
| `cursor-curator/` | Main skill (scripts, MCP server, agents, board) |
| `objective-prep/` | `/objective-prep` skill |
| `.cursor/mcp.json` | Project MCP config (cursor-curator server) |
| `scripts/install-from-repo.mjs` | Copy skills + run Cursor install |

## Publishing

Public repo: [github.com/wstrege-kenosha/Cursor-Curator](https://github.com/wstrege-kenosha/Cursor-Curator).

Re-run [Verify](#verify) from a fresh clone. Not on npm; upstream [tolibear/goalbuddy](https://github.com/tolibear/goalbuddy).
