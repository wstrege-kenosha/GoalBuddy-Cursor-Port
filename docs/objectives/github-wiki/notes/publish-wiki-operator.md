# Publish wiki — operator steps

Wiki source in this repo: `docs/wiki/*.md`.

## Option A — GitHub web UI (first time)

1. Open https://github.com/wstrege-kenosha/Cursor-Curator/wiki
2. Click **Create the first page** (initializes the wiki git repo).
3. Paste `docs/wiki/Home.md` content; title **Home**; Save.
4. For each page, **New Page**: Install, Usage, Cursor-Curator-Loop, Upstream-Parity, Troubleshooting (copy from `docs/wiki/`).

## Option B — Git push (after wiki exists)

```bash
node scripts/publish-wiki.mjs
```

Requires git credentials for `https://github.com/wstrege-kenosha/Cursor-Curator.wiki.git`.

## Verify

- https://github.com/wstrege-kenosha/Cursor-Curator/wiki shows Home with links to child pages
- Install page uses `cd Cursor-Curator`
