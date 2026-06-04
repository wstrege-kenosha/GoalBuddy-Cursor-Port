# Publish Cursor Port to Public GitHub

## Objective

Publish the GoalBuddy Cursor port as a public GitHub repository so strangers can clone it, follow README install steps, and pass verification without access to private paths or leaked secrets.

## Original Request

I'd like to publish this port to a public GitHub repo.

## Intake Summary

- Input shape: `specific`
- Audience: Cursor users and contributors discovering the port on GitHub
- Authority: `requested`
- Proof type: `artifact` (with `review` for secret/history hygiene)
- Completion proof: Public `https://github.com/<owner>/<repo>` exists; fresh clone + `node scripts/install-from-repo.mjs` + `npm run check` + `doctor --goal-ready` pass per README
- Goal oracle: A third party (or documented fresh-clone run) can clone the public repo URL, install, and pass doctor/check without private remotes or secrets in tracked files or recent history
- Likely misfire: Push local-only git with goal boards containing machine-specific paths; publish without replacing README placeholders; push secrets or `.cursor` install manifests with user paths
- Blind spots considered: repo name/owner choice; whether to include all `docs/goals/*` history boards; relationship to upstream tolibear/goalbuddy attribution; GitHub org vs personal; default branch name
- Existing plan facts: LICENSE, README, `docs/PARITY.md`, vendored skills, local git commits; README uses `OWNER` placeholder until push

## Goal Oracle

Public GitHub clone URL in README; fresh clone passes install, `npm run check`, and `doctor --goal-ready` (receipt-backed); no secrets in tracked files or history. Finish when Judge audit records `full_outcome_complete: true`.

## Goal Kind

`specific`

## Current Tranche

Scout publish-readiness → Judge first slice (likely: sanitize + .gitignore + README real URL + initial push) → Worker execution → verify clone path → final audit.

## Non-Negotiable Constraints

- MIT license and upstream attribution to [tolibear/goalbuddy](https://github.com/tolibear/goalbuddy) must remain accurate
- Do not force-push or publish secrets; stop and mark blocked if credentials are required and not provided
- User must approve/create GitHub remote (owner/repo name); Worker may prepare locally, push only when remote exists and user has authorized it
- Do not claim official upstream maintainership

## Stop Rule

Stop when final audit proves the outcome complete—not after planning or a single slice if publish/clone-verify work remains.

## Canonical Board

Machine truth lives at:

`docs/goals/publish-public-github/state.yaml`

## Run Command

```text
/goal Follow docs/goals/publish-public-github/goal.md.
```

## PM Loop

Read charter and `state.yaml`; one active task per turn; receipts in `state.yaml`.
