# Cursor Curator Agents

Use three generic agents. The main `/objective` thread remains PM and owns the board.

| Agent | model_reasoning_effort | sandbox_mode | Purpose |
|---|---:|---|---|
| objective_scout | low | read-only | Targeted evidence mapping and candidate facts |
| objective_worker | medium | workspace-write | One coherent bounded implementation/recovery slice |
| objective_approval_gate | high | read-only | Strategic review, escalation, completion skepticism |

## PM Thinking Policy

The main `/objective` thread is the PM. It owns board truth, chooses active tasks, and decides when receipts are sufficient.

| Objective mode | PM thinking |
|---|---:|
| specific, bounded | medium |
| open-ended | high |
| recovery | high |
| audit | high |
| high-risk or multi-day final audit | xhigh optional |

Do not use `xhigh` by default. Use it only when a wrong board, scope, or completion decision would be materially more expensive than latency and cost.

Tasks may include optional `reasoning_hint: default | low | medium | high | xhigh`. Treat it as PM guidance, not permission to widen scope.

Recommended project config:

```toml
[agents]
max_threads = 4
max_depth = 1
job_max_runtime_seconds = 1800
```

Install:

```bash
mkdir -p .codex/agents
cp .codex/skills/cursor-curator/agents/objective_*.toml .codex/agents/
```

Rules:

- Only the PM loop chooses active tasks, marks tasks done, or completes the objective.
- Keep at most one write-capable Worker active unless disjoint write scopes are explicit in `state.yaml`.
- Worker defaults to medium reasoning for implementation tasks and should complete the whole assigned slice.
- Scout and Approval Gate are read-only and safe to parallelize when their board inputs are clear.
- Approval Gate is high thinking and should choose the largest safe useful slice, not the narrowest helper.
