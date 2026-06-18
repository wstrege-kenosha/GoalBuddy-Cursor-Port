# GoalBuddy Cursor Port

## Objective

Deliver a Cursor-native GoalBuddy port repository that reproduces the upstream operating loop (Goal Prep → board → Scout/Judge/Worker → proof against an oracle) for long `/goal` runs in Cursor, with install and runtime surfaces under `~/.cursor/` rather than Codex or Claude Code paths.

## Original Request

https://github.com/tolibear/goalbuddy — build a repo for a cursor port of this.

## Repositories

- **This port (canonical board):** [wstrege-kenosha/GoalBuddy-Cursor-Port](https://github.com/wstrege-kenosha/GoalBuddy-Cursor-Port) — clone and install from here.
- **Upstream (ported from):** [tolibear/goalbuddy](https://github.com/tolibear/goalbuddy) @ 0.3.8 — MIT lineage; see `docs/PARITY.md` for feature mapping.

## Intake Summary

- Input shape: `specific`
- Audience: Cursor users who want GoalBuddy-style `/goal` workflows without Codex or Claude Code
- Authority: `requested`
- Proof type: `artifact` (with `test` and `review` for install verification)
- Completion proof: A cloneable repo where Goal Prep scaffolds `docs/goals/<slug>/`, `/goal` drives the loop via bundled Cursor skills/commands/agents, `goalbuddy doctor --target cursor` (or equivalent) reports goal-ready, and a parity note maps core upstream 0.3.x behaviors to this port
- Goal oracle: Operator runs Goal Prep and `/goal` on a sample goal in Cursor; local board opens at `goalbuddy.localhost`; doctor/check scripts pass; README install path matches `~/.cursor/skills`, `~/.cursor/agents`, and `~/.cursor/commands`
- Likely misfire: Documentation-only fork, or a thin wrapper that still requires Codex/Claude install paths; port succeeds at copying files without a verified Cursor install and execution loop
- Blind spots considered: npm publish vs vendored-only; whether to vendor upstream JS or reimplement; MCP vs skills-only; Windows path handling; parity scope (full 0.3.8 vs MVP: prep + board + three agents)
- Existing plan facts: Upstream reference at https://github.com/tolibear/goalbuddy (MIT, npm `goalbuddy`, docs under `docs/goals/`, agents scout/judge/worker, local board hub). This workspace (`GoalBuddyCursorPort`) is empty at prep time.

## Goal Oracle

The oracle for this goal is:

**A Cursor operator can install from this repo, run Goal Prep on a test outcome, open the live board, and complete one Scout → Judge → Worker cycle with receipts in `state.yaml`, verified by `node` scripts and doctor output captured in task receipts.**

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`specific`

## Current Tranche

Map upstream GoalBuddy (structure, scripts, plugin model, board hub) against Cursor’s skills/commands/agents layout, then implement the largest safe vertical slice: installable Cursor surfaces + runnable prep/board scripts + README, with parity notes for gaps deferred explicitly.

## Non-Negotiable Constraints

- MIT-compatible with upstream; do not claim official upstream maintainership without evidence
- Do not require Codex or Claude Code install paths for the happy path
- `state.yaml` remains source of truth; board is a view
- Prep and PM work stay bounded: no product features outside goal scope unless a Worker slice owns them
- Preserve upstream concepts: oracle, receipts, largest safe useful slice, Scout/Judge/Worker roles

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if the user asked for working software or automation and a safe Worker task can be activated.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

Do not create one Worker/Judge pair per repeated file, table, route, or helper. Put repeated same-shape work into one Worker package and review the package as a whole.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice.

Small is not the goal. Useful is the goal.

A Worker should finish the whole assigned slice. A Judge should judge the whole assigned slice. A PM should reorient the board when tasks are safe but not moving the outcome.

## Canonical Board

Machine truth lives at:

`docs/goals/goalbuddy-cursor-port/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/goalbuddy-cursor-port/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Re-check the intake: original request, input shape, authority, proof, blind spots, existing plan facts, and likely misfire.
5. Work only on the active board task.
6. Assign Scout, Judge, Worker, or PM according to the task.
7. Write a compact task receipt.
8. Update the board.
9. If safe local work remains, choose the next largest reversible Worker package and continue unless blocked.
10. If a problem, suggestion, or follow-up should become a repo artifact, create an approved issue/PR or ask the operator whether to create one.
11. Review at phase, risk, rejected-verification, ambiguity, or final-completion boundaries; do not review every small Worker by habit.
12. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.

Issue and PR handoffs are supporting artifacts. `state.yaml` remains authoritative, and every external artifact decision must be recorded in a task receipt.
