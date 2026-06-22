# Cursor Curator

Git-installable [Cursor Curator](https://github.com/tolibear/cursor-curator) for Cursor (`cursorPortVersion` **2.1.0**, `upstreamVersion` **0.3.8**).

| Page | Topic |
|------|--------|
| [Migration 2.0 → 2.1](Migration-2.0-to-2.1) | SDK auto-loop removed |
| [Migration 1.0 → 2.0](Migration-1.0-to-2.0) | Upgrade from 1.0.0 |
| [Install](Install) | Clone, install skills, MCP, verify |
| [Usage](Usage) | `/objective-prep`, `/objective`, MCP, board |
| [Cursor Curator loop](Cursor-Curator-Loop) | Scout, Judge, Worker, success criteria, MCP gates |
| [Upstream parity](Upstream-Parity) | vs [tolibear/cursor-curator](https://github.com/tolibear/cursor-curator) |
| [Troubleshooting](Troubleshooting) | Common fixes |

**Repo:** https://github.com/wstrege-kenosha/Cursor-Curator

This port is not on npm; install from git only.

## Highlights (2.1.0)

- Multi-goal **hub** at http://curator.localhost:41737/
- **MCP server** for validation and prompt gates in `/objective`
- **Manual PM loop** via `/objective` in Cursor chat
- Global **`curator` CLI** for `doctor`, `board`, `hub`, and gates
