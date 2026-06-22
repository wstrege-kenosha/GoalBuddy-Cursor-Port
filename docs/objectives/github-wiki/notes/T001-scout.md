# T001 Scout — GitHub wiki mapping

**Board:** `docs/objectives/github-wiki/state.yaml`  
**Repo:** [wstrege-kenosha/Cursor-Curator](https://github.com/wstrege-kenosha/Cursor-Curator)

## Wiki state (2026-06-04)

| Check | Result |
|-------|--------|
| `GET …/wiki` | HTTP **200** (HTML shell; content likely client-rendered) |
| GitHub API `has_wiki` | **true** |
| `git ls-remote` `…Cursor-Curator.wiki.git` | **fatal: Repository not found** (typical before first wiki page or without auth) |
| `gh` on scout host | **not in PATH** (`where.exe gh` — no matches) |

**Wiki git remote (standard pattern):** `https://github.com/wstrege-kenosha/Cursor-Curator.wiki.git` — clone/push after operator creates first page or has wiki write access.

**Publish options (ranked):**

1. **GitHub web UI** — Settings → Wikis (enabled); create Home, then sibling pages. No `gh` required.
2. **Git push to `.wiki.git`** — after first page exists; needs git credentials with wiki write.
3. **`gh wiki`** — unavailable on this host until `gh` is installed and on PATH.

## README bug (install)

```bash
git clone https://github.com/wstrege-kenosha/Cursor-Curator.git
cd cursor-curator   # ← wrong vs clone dir Cursor-Curator
```

Wiki **Install** page should use `cd Cursor-Curator` (or document case on Windows). Approval Gate may pair wiki publish with README fix in main repo.

## Source → wiki page outline

| Wiki page | Primary sources | Content |
|-----------|-----------------|---------|
| **Home** | README intro, success criteria | Port purpose; versions 1.0.0 / upstream 0.3.8; links to all pages; upstream link [tolibear/cursor-curator](https://github.com/tolibear/cursor-curator) |
| **Install** | README § Install, `scripts/install-from-repo.mjs` | Clone URL; **correct** `cd`; `node scripts/install-from-repo.mjs` or `npm run install:cursor`; skills path note |
| **Usage** | README § Usage, Verify, Smoke objective | `/objective-prep`, `/objective`; `npm run check`; doctor; sample smoke path |
| **Cursor-Curator-Loop** | README Usage + `objective.md` success criteria | Scout/Approval Gate/Worker loop; `state.yaml`; board command; no secrets |
| **Upstream-Parity** | `docs/PARITY.md` | Matrix summary; deferred (npm, Codex/Claude plugins, CI); verify block |
| **Troubleshooting** | PARITY + skill hints | `doctor --objective-ready`; reinstall `install-from-repo.mjs`; Task/subagent → restart Cursor after install; wiki/git auth blockers |

## Wiki readiness checklist

- [x] Repo public; wiki feature enabled (`has_wiki: true`)
- [ ] At least one wiki page live (success criteria)
- [ ] Home cross-links Install, Usage, Cursor-Curator-Loop, Upstream-Parity, Troubleshooting
- [ ] Install uses correct clone folder name
- [ ] No machine-specific paths or secrets
- [ ] Publish receipt (UI steps or git remote + commit)

## Ranked Worker slices (for Approval Gate)

1. **Web UI vertical slice** — Home + Install + Usage (fix `cd` in Install only on wiki).
2. **Git wiki repo** — after first page; optional `docs/wiki/*.md` in main as source of truth.
3. **README parity fix** — align `cd` in README with wiki Install.
4. **Full oracle** — add Cursor-Curator-Loop, Upstream-Parity, Troubleshooting + T999 audit.

## Local vs remote naming

- GitHub repo: `Cursor-Curator`
- Local workspace folder: `Cursor CuratorCursorPort` (operator clone may differ)
