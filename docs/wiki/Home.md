# GoalBuddy Cursor Port

Git-installable [GoalBuddy](https://github.com/tolibear/goalbuddy) for Cursor (`cursorPortVersion` **2.1.0**, `upstreamVersion` **0.3.8**).

| Page | Topic |
|------|--------|
| [Migration 2.0 → 2.1](Migration-2.0-to-2.1) | SDK auto-loop removed |
| [Migration 1.0 → 2.0](Migration-1.0-to-2.0) | Upgrade from 1.0.0 |
| [Install](Install) | Clone, install skills, MCP, verify |
| [Usage](Usage) | `/goal-prep`, `/goal`, MCP, board |
| [GoalBuddy loop](GoalBuddy-Loop) | Scout, Judge, Worker, oracle, MCP gates |
| [Upstream parity](Upstream-Parity) | vs [tolibear/goalbuddy](https://github.com/tolibear/goalbuddy) |
| [Troubleshooting](Troubleshooting) | Common fixes |

**Repo:** https://github.com/wstrege-kenosha/GoalBuddy-Cursor-Port

This port is not on npm; install from git only.

## Highlights (2.1.0)

- Multi-goal **hub** at http://goalbuddy.localhost:41737/
- **MCP server** for validation and prompt gates in `/goal`
- **Manual PM loop** via `/goal` in Cursor chat
- Global **`goalbuddy` CLI** for `doctor`, `board`, `hub`, and gates
