# T003 Worker — wiki source + publish tooling

## Shipped in main repo

- `docs/wiki/`: Home, Install, Usage, GoalBuddy-Loop, Upstream-Parity, Troubleshooting
- `scripts/publish-wiki.mjs` — clones `.wiki.git` and pushes when wiki exists
- `README.md` — wiki link; `cd GoalBuddy-Cursor-Port` fix
- `notes/publish-wiki-operator.md` — web UI + git paths

## Publish attempt

`node scripts/publish-wiki.mjs` → `Repository not found` for `GoalBuddy-Cursor-Port.wiki.git` (wiki not initialized or no auth).

## Operator unblock

Create first wiki page at https://github.com/wstrege-kenosha/GoalBuddy-Cursor-Port/wiki (web UI), then run `node scripts/publish-wiki.mjs` or paste pages from `docs/wiki/`.
