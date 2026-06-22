# Local Objective Board

Generate a small local Cursor Curator board for a objective directory and watch it update live while agents work.

The surface keeps `state.yaml` authoritative. It writes static web app files into the objective directory and serves them from a local-only Node server. The browser subscribes to Server-Sent Events, so cards update as `state.yaml`, `notes/`, or linked depth-1 sub-objective state changes without a manual reload.

## Use When

- A human wants a local board view during a Cursor Curator run.
- The team wants GitHub-Projects-like visibility without GitHub credentials.
- An objective should expose in-progress, completed, and blocked cards from local files.
- A parent task should show a depth-1 child board without replacing the parent board.

## Generate And Serve

```bash
npx curator board docs/objectives/<slug>
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
npx curator board docs/objectives/<slug> \
  --once \
  --json
```

## Live Updates

The server watches:

- `docs/objectives/<slug>/state.yaml`
- `docs/objectives/<slug>/notes/`
- linked `docs/objectives/<slug>/subgoals/**/state.yaml`
- linked `docs/objectives/<slug>/subgoals/**/notes/`

When either changes, the server re-reads the objective board and pushes a fresh board payload to connected browsers over `/events`.

## Board Mapping

- `queued` tasks appear under **Todo**.
- `active` tasks appear under **In Progress**.
- `blocked` tasks appear under **Blocked**.
- `done` tasks appear under **Completed**, the right-most column.

Clicking a card opens a detail modal with the task objective, status, assignee, inputs, constraints, expected output, verify commands, allowed files, stop conditions, and receipt details. If the task links a sub-objective, the modal includes a read-only child board. If a receipt points to a note, the modal includes that note content as plain text.

## Verification

```bash
node --test cursor-curator/surfaces/local-goal-board/test/*.test.mjs
node curator/surfaces/local-goal-board/scripts/local-goal-board.mjs \
  --goal cursor-curator/surfaces/local-goal-board/examples/sample-goal \
  --once \
  --json
```

## Boundaries

- `state.yaml` remains the source of truth.
- The server binds to `127.0.0.1:41737` by default, advertises `http://curator.localhost:41737/`, and reuses that URL as a multi-board hub with in-board header navigation.
- Sub-objectives are file-rendered depth-1 child boards; the UI does not create, mutate, or recurse sub-objectives.
- The generated UI renders file content as text, not raw HTML.
- No package dependencies are required.
