# Local Objective Board

Generate a small local Cursor Curator board for an objective directory and watch it update live while agents work.

The surface reads board state from **`.cursor-curator/curator.db`** (SQLite). It writes static web app files into the objective directory and serves them from a local-only Bun server. The browser subscribes to Server-Sent Events, so cards update when the database, `notes/`, or linked depth-1 sub-objective state change without a manual reload.

## Source layout

| Path | Role |
|------|------|
| `cursor-curator/src/board/` | Canonical board TypeScript (`.mts`) |
| `cursor-curator/dist/board/` | Compiled ESM consumed at runtime |
| `cursor-curator/scripts/local-objective-board.mjs` | CLI entry (re-exports `dist/board/`) |
| `cursor-curator/surfaces/local-objective-board/examples/` | Sample objective directories for tests (board state seeded from `scripts/test/fixtures/board-examples/`) |
| `cursor-curator/surfaces/local-objective-board/scripts/local-objective-board.mjs` | Surface CLI entry (re-exports `dist/board/`) |

## Use When

- A human wants a local board view during a Cursor Curator run.
- The team wants GitHub-Projects-like visibility without GitHub credentials.
- An objective should expose in-progress, completed, and blocked cards from local files.
- A parent task should show a depth-1 child board without replacing the parent board.

## Generate And Serve

```bash
bunx curator board docs/objectives/<slug>
```

The generated app includes the bundled `assets/curator-mark.png`, so the board keeps the Cursor Curator mark anywhere the package is installed.

The command writes:

```text
docs/objectives/<slug>/.cursor-curator-board/
  index.html
  styles.css
  app.js
```

Then it starts or reuses the shared local board hub at `http://curator.localhost:41737/`. The server still binds to loopback, so no `/etc/hosts` setup is required. The printed board URL includes the objective slug, like `http://curator.localhost:41737/my-goal/`. When multiple objective boards are active, each board shows a switcher in the header so you can move between parent boards, child boards, and parallel runs without leaving the board view.

## Check Without A Long-Running Server

```bash
bunx curator board docs/objectives/<slug> \
  --once \
  --json
```

## Live Updates

The server watches:

- `.cursor-curator/curator.db` (and WAL sidecars) at the workspace root
- `docs/objectives/<slug>/notes/`
- linked `docs/objectives/<slug>/subobjectives/**/notes/`

When either changes, the server re-reads the objective board and pushes a fresh board payload to connected browsers over `/events`.

## Board Mapping

- `queued` tasks appear under **Todo**.
- `active` tasks appear under **In Progress**.
- `blocked` tasks appear under **Blocked**.
- `done` tasks appear under **Completed**, the right-most column.

Clicking a card opens a detail modal with the task objective, status, assignee, inputs, constraints, expected output, verify commands, allowed files, stop conditions, and receipt details. If the task links a sub-objective, the modal includes a read-only child board. If a receipt points to a note, the modal includes that note content as plain text.

## Verification

```bash
bun run build
bun test cursor-curator/surfaces/local-objective-board/test/*.test.mjs
bun cursor-curator/scripts/local-objective-board.mjs \
  --objective cursor-curator/surfaces/local-objective-board/examples/sample-objective \
  --once \
  --json
```

## Boundaries

- **SQLite** (`curator.db`) is canonical at runtime; legacy `state.json` is import-only.
- The server binds to `127.0.0.1:41737` by default, advertises `http://curator.localhost:41737/`, and reuses that URL as a multi-board hub with in-board header navigation.
- Sub-objectives are file-rendered depth-1 child boards; the UI does not create, mutate, or recurse sub-objectives.
- The generated UI renders file content as text, not raw HTML.
- Skill-only installs bundle runtime deps via `cursor-curator/package.json` (`zod`, `yaml`, MCP SDK) when you run `bun scripts/install-from-repo.mjs`.
