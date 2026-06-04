# T005 PM — blocked on operator input

**Status:** blocked (not a goal failure; specific task waiting on you)

## Done locally (T003–T004)

- Initial commit `be8df17` — sanitize path leaks, `.gitignore` for local artifacts
- Commit `a22fde8` — README `OWNER` template, Publishing section, `package.json` public
- `git grep` clean for machine paths and tokens on tracked files
- `npm run check` passes

## Blockers

1. **`gh` CLI not on PATH** — cannot `gh repo create` / `gh auth status` from this machine
2. **GitHub owner not specified** — README still uses `OWNER` placeholder
3. **No `git remote`** — nothing pushed yet

## What you need to provide

1. GitHub **owner** (username or org), e.g. `yourname`
2. Confirm repo name **`goalbuddy-cursor-port`** (or alternate)
3. Install and auth GitHub CLI: https://cli.github.com/ then `gh auth login`

## Commands after that (operator)

```powershell
cd W:\Experimental\GoalBuddyCursorPort
# Replace YOUR_OWNER in README first, or:
(Get-Content README.md) -replace 'OWNER','YOUR_OWNER' | Set-Content README.md
git add README.md && git commit -m "docs: set GitHub owner in README"

gh repo create YOUR_OWNER/goalbuddy-cursor-port --public --source=. --remote=origin --push
```

Then fresh-clone verify per README Publishing section and run `/goal` again for T999 audit.
