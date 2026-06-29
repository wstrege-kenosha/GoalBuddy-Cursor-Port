# Sample Cursor smoke objective

## Objective

Demonstrate a completed Scout → Approval Gate → Worker cycle on a minimal v2 objective board for Cursor port verification.

## Original Request

Smoke-test Cursor Curator Cursor install and objective-state validation without touching production goals.

## Intake Summary

- Input shape: `specific`
- Audience: Cursor port operators
- Authority: `requested`
- Proof type: `artifact`
- Completion proof: `curator check-objective sample-cursor-smoke` passes; board URL opens
- Success criteria: `bun cursor-curator/dist/cli/curator.mjs check-objective sample-cursor-smoke` exits 0
- Likely misfire: Board looks complete but receipts or allowed_files are invalid
- Blind spots considered: Windows path for `~/.cursor`
- Existing plan facts: Scaffold only; no implementation in this goal

## Success criteria

`bun cursor-curator/dist/cli/curator.mjs check-objective sample-cursor-smoke` returns `ok: true`.

## Goal Kind

`specific`

## Current Tranche

Validate board schema and receipts for T001–T003; final audit deferred to T999.

## Non-Negotiable Constraints

- Read-only smoke; do not modify port implementation from this goal.

## Stop Rule

Stop when T999 Approval Gate records `full_outcome_complete: true` after verification.

## Canonical Board

`.cursor-curator/curator.db` (`db:sample-cursor-smoke`)

## Run Command

```text
/objective Follow docs/objectives/sample-cursor-smoke/objective.md.
```
