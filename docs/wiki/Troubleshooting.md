# Troubleshooting

## `doctor` fails after install

- Node **>= 18** required.
- Re-run: `node scripts/install-from-repo.mjs`
- Restart Cursor so agents and commands reload.

## Board URL does not open

- Use http://127.0.0.1:41737/<slug>/ if `goalbuddy.localhost` does not resolve.
- Start the board: `node goalbuddy/scripts/goalbuddy.mjs board docs/goals/<slug>`

## Task subagents missing

```bash
node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs install
```

Restart Cursor.

## `check-goal-state` errors

- Done tasks need structured `receipt` blocks in `state.yaml`.
- Worker receipts need `changed_files`, `commands` with `status: pass`.

## Publish this wiki from the repo

See `docs/goals/github-wiki/notes/publish-wiki-operator.md` or run `node scripts/publish-wiki.mjs` after the GitHub wiki git repo exists (create the first page in the GitHub wiki UI if `git push` fails).
