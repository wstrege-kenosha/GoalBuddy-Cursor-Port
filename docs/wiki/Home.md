# GoalBuddy Cursor Port

Git-installable [GoalBuddy](https://github.com/tolibear/goalbuddy) for Cursor (`cursorPortVersion` **2.0.0**, `upstreamVersion` **0.3.8**).

| Page | Topic |
|------|--------|
| [Install](Install) | Clone, install skills, MCP, verify |
| [Usage](Usage) | `/goal-prep`, `/goal`, MCP, auto-loop, board |
| [GoalBuddy loop](GoalBuddy-Loop) | Scout, Judge, Worker, oracle, MCP gates |
| [Upstream parity](Upstream-Parity) | vs [tolibear/goalbuddy](https://github.com/tolibear/goalbuddy) |
| [Troubleshooting](Troubleshooting) | Common fixes |

**Repo:** https://github.com/wstrege-kenosha/GoalBuddy-Cursor-Port

This port is not on npm; install from git only.

## Highlights (2.0.0)

- Multi-goal **hub** at http://goalbuddy.localhost:41737/
- **MCP server** for validation and prompt gates in `/goal`
- **SDK auto-loop**: `goalbuddy run <slug> --auto N` with `CURSOR_API_KEY`
