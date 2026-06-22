# T002 Judge — first Worker slice (T003 contract)

**Decision:** Approve T003 as largest safe vertical slice after T001 scout.

## Rationale

Scout confirms wiki enabled (`has_wiki: true`), `.wiki.git` not yet reachable (empty or auth), `gh` absent on host. Goal rules require continuing without credentials: in-repo `docs/wiki/` as source of truth plus operator publish path is correct. Six pages + README `cd` fix + wiki link moves toward success criteria without claiming live wiki. Partial Worker completion is valid; T999 audits live pages.

## T003 Worker contract (PM must patch `state.yaml`)

| Field | Value |
|-------|--------|
| **task_id** | T003 |
| **objective** | Author GitHub-wiki source under `docs/wiki/` (Home, Install, Usage, Cursor-Curator-Loop, Upstream-Parity, Troubleshooting) from README + `docs/PARITY.md`; fix Install `cd` to `Cursor-Curator` in wiki and README; link README to wiki; add `scripts/publish-wiki.mjs` (or `docs/objectives/github-wiki/notes/publish-wiki-operator.md`) documenting clone/push to `https://github.com/wstrege-kenosha/Cursor-Curator.wiki.git` and web-UI fallback. Attempt publish if credentials exist; else stop with operator steps in receipt—no fake live-wiki claim. |
| **allowed_files** | `docs/wiki/**`, `README.md`, `scripts/publish-wiki.mjs`, `docs/objectives/github-wiki/notes/**` |
| **verify** | See below |
| **stop_if** | Cannot push to `.wiki.git` without operator auth (document UI/git steps; do not mark goal complete) |

### Wiki source files (create)

- `docs/wiki/Home.md` — hub with links to all pages; versions 1.0.0 / upstream 0.3.8
- `docs/wiki/Install.md` — clone URL; `cd Cursor-Curator`; install commands; no secrets
- `docs/wiki/Usage.md` — `/objective-prep`, `/objective`, verify, smoke objective pointer
- `docs/wiki/Cursor-Curator-Loop.md` — Scout/Approval Gate/Worker; `state.yaml`; board command
- `docs/wiki/Upstream-Parity.md` — summary from `docs/PARITY.md`
- `docs/wiki/Troubleshooting.md` — doctor, reinstall, wiki/git auth, restart Cursor after install

### Verify commands

```bash
node scripts/check-port.mjs
test -f docs/wiki/Home.md && test -f docs/wiki/Install.md && test -f docs/wiki/Usage.md && test -f docs/wiki/Cursor-Curator-Loop.md && test -f docs/wiki/Upstream-Parity.md && test -f docs/wiki/Troubleshooting.md
rg -n "cd Cursor-Curator" docs/wiki/Install.md README.md
rg -n "wiki" README.md
node scripts/publish-wiki.mjs --help
```

If `publish-wiki.mjs` is omitted, verify must include `test -f docs/objectives/github-wiki/notes/publish-wiki-operator.md` with git/UI steps instead.

### Receipt expectations (T003 Worker)

- `changed_files` list
- Publish method attempted (git push / dry-run / UI-only doc)
- `remaining_blockers`: live wiki URL spot-check if not pushed
- Do not set `full_outcome_complete`

## PM board updates

1. T001 → `done`; receipt pointer to `notes/T001-scout.md`
2. T002 → `done`; receipt pointer to this file + JSON
3. T003 → fill `objective`, `allowed_files`, `verify`, `stop_if` from table; `status: queued` then `active_task: T003`
4. `full_outcome_complete` remains false until T999
