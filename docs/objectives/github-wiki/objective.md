# GitHub Wiki for Cursor Curator

## Objective

Create and publish a useful [GitHub wiki](https://github.com/wstrege-kenosha/Cursor-Curator/wiki) for [wstrege-kenosha/Cursor-Curator](https://github.com/wstrege-kenosha/Cursor-Curator) so visitors get install, usage, and Cursor Curator workflow docs without reading the whole repo tree.

## Original Request

https://github.com/wstrege-kenosha/Cursor-Curator/wiki — can you create a wiki for this?

## Intake Summary

- Input shape: `specific`
- Audience: Cursor users cloning the public port repo
- Authority: `requested`
- Proof type: `artifact` (with `review` for content accuracy vs README)
- Completion proof: Wiki home URL loads with linked pages covering install, verify, `/objective-prep` + `/objective`, upstream attribution, and troubleshooting
- Success criteria: `https://github.com/wstrege-kenosha/Cursor-Curator/wiki` shows a Home page plus at least Install, Usage, and Upstream pages; content matches README/`docs/PARITY.md` facts; no machine-specific paths or secrets
- Likely misfire: Empty wiki shell, duplicate README verbatim without wiki navigation, or wiki git push blocked without documenting web-UI fallback
- Blind spots considered: wiki enabled on repo vs empty; edit via `Cursor-Curator.wiki.git` vs GitHub UI; wiki-only vs also adding `docs/wiki/` in main repo as source of truth
- Existing plan facts: Public repo published; README has install/verify/usage; local `docs/PARITY.md` exists; publish goal largely complete

## Success criteria

The wiki home page is live at the repo wiki URL with cross-linked pages (Install, Usage, Cursor Curator loop, Upstream/parity) derived from README and PARITY; a task receipt records how pages were published (git push to wiki remote or documented UI steps) and a spot-check that install commands use the real clone URL `wstrege-kenosha/Cursor-Curator`.

## Goal Kind

`specific`

## Current Tranche

Scout wiki mechanics and current wiki state → Approval Gate picks content + publish slice → Worker authors pages and publishes → final audit.

## Non-Negotiable Constraints

- Attribute upstream [tolibear/cursor-curator](https://github.com/tolibear/cursor-curator); do not imply official upstream ownership
- No secrets, tokens, or local machine paths in wiki content
- Wiki content must use public clone URL and correct repo/folder names
- Push to wiki requires operator `gh`/git auth; block and document UI path if auth missing

## Stop Rule

Stop when final audit confirms the wiki success criteria; not after drafting markdown only in the main repo without publishing to the wiki.

## Canonical Board

`docs/objectives/github-wiki/state.yaml`

## Run Command

```text
/objective Follow docs/objectives/github-wiki/objective.md.
```

## PM Loop

Read charter and `state.yaml`; one active task per turn; receipts in `state.yaml`.
