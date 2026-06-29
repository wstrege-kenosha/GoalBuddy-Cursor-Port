# Cursor Curator

Git-installable [Cursor Curator](https://github.com/tolibear/cursor-curator) for Cursor (`cursorPortVersion` **4.0.0**, `upstreamVersion` **0.3.8**).

| Page | Topic |
|------|--------|
| [Migration Node → Bun](Migration-Node-to-Bun) | Node/npm → Bun runtime |
| [Migration 5.0](Migration-5.0) | YAML v2 → JSON v3 (fork) |
| [Migration 2.0 → 2.1](Migration-2.0-to-2.1) | SDK auto-loop removed |
| [Migration 1.0 → 2.0](Migration-1.0-to-2.0) | Upgrade from 1.0.0 |
| [Install](Install) | Clone, install skills, MCP, verify |
| [Usage](Usage) | `/objective-prep`, `/objective`, MCP, board |
| [Cursor Curator loop](Cursor-Curator-Loop) | Scout, Approval Gate, Worker, success criteria, MCP gates |
| [Upstream parity](Upstream-Parity) | vs [tolibear/cursor-curator](https://github.com/tolibear/cursor-curator) |
| [Troubleshooting](Troubleshooting) | Common fixes |

**Repo:** https://github.com/wstrege-kenosha/Cursor-Curator

**Runtime:** [Bun](https://bun.sh) required (`bun install`, `bun run build`). This port is not published to npm; install from git only.

## Highlights (4.0.0)

- **Objective paths:** `docs/objectives/`, `objective.md`, YAML `objective:`, shared `objective-*.mjs` libs
- Multi-objective **hub** at http://curator.localhost:41737/
- **MCP server** for validation, prompts, receipts, verification, session resume, blocked/misfire/rollup
- **Manual PM loop** via `/objective` in Cursor chat
- Global **`curator` CLI** for `doctor`, `board`, `hub`, `resume`, `verify-receipt`, and gates
