# Usage

## In Cursor (PM loop)

1. `/objective-prep` — describe your outcome; Cursor Curator scaffolds `docs/objectives/<slug>/` in your workspace.
2. `/objective Follow docs/objectives/<slug>/objective.md.` — PM runs Scout → Approval Gate → Worker using **cursor-curator MCP tools** each turn.

### MCP tool sequence (each `/objective` turn)

0. `session_resume_digest` — turn-0 handoff; use `list_objectives` with `stale_days: 7` when objectives may be idle
1. `get_active_task` → `validate_state` (stop if errors)
2. `misfire_audit_check` / `subobjective_rollup_check` when rules require them
3. `parallel_plan` — mandatory before Task spawn; when `spawn_plan.length >= 1`, batch-spawn all entries in one turn using each `task_prompt`
4. If `spawn_plan` is empty: `render_task_prompt` → single Task spawn
5. `validate_receipt` → `verify_worker_receipt` per board (serial merge)
6. PM writes board state via MCP (`apply_receipt`, `patch_task`, `patch_objective`)
7. `validate_state` again → `append_session_note`

Parallel Workers require disjoint parent + subobjective `allowed_files` and `rules.max_write_workers >= 2`. See [subobjectives.md](../../cursor-curator/reference/subobjectives.md).

## CLI (after install)

Install adds `~/.cursor/bin` to User PATH by default (open a **new terminal** afterward). From the clone, use `bun run install:cursor` or `bun cursor-curator/dist/cli/curator.mjs install`; pass `--no-add-to-path` (or `bun run install:cursor -- --no-add-to-path`) to skip PATH. Once `curator` resolves globally, from any repo with an objective:

```bash
curator doctor --objective-ready
curator hub --json
curator board docs/objectives/<slug>
curator resume docs/objectives/<slug> --json
curator verify-receipt docs/objectives/<slug> --task T003 --receipt-file notes/T003-worker.md
curator blocked docs/objectives/<slug> --json
curator misfire-audit docs/objectives/<slug>
curator subobjective-rollup docs/objectives/<slug>
curator prompt docs/objectives/<slug> --task T001 --json
curator completion-check docs/objectives/<slug>
curator stale --days 7
curator receipt notes/T003-worker.md --role worker
```

Or use the full path:

```bash
bun ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs doctor --objective-ready
```

## Local board and hub

- **Hub** (all objectives): http://curator.localhost:41737/
- **Single objective**: http://curator.localhost:41737/<slug>/

Boards show **agent time and token usage** per task when Cursor hooks are installed (`curator install` writes `~/.cursor/hooks.json`). Metrics accumulate in `docs/objectives/<slug>/notes/usage.json` and appear on the board progress rail, task cards, and hub cards.

Use http://127.0.0.1:41737/ if `curator.localhost` does not resolve.

### Usage metrics (hooks)

Install registers two hooks that call `cursor-curator/scripts/hooks/append-usage-metrics.mjs`:

- **`stop`** — PM/agent session end; also appends `notes/SESSION.md`
- **`subagentStop`** (matcher: `objective-scout|objective-worker|objective-approval-gate`) — higher-fidelity per-task attribution

Each event reads `duration_ms`, `input_tokens`, `output_tokens`, and cache token fields from the Cursor hook payload (when present) and attributes usage to `active_task` in the workspace database when that task is `active`. Otherwise usage goes to an **unattributed** bucket (shown as a board warning).

`input_tokens` is the total input count Cursor reports (includes cache read/write). Rollups do not double-count cache fields.

For project-level hooks instead of user hooks, copy [`cursor-curator/hooks.example.json`](../../cursor-curator/hooks.example.json) to `.cursor/hooks.json` in your repo and adjust paths.

## Repo layout

| Path | Purpose |
|------|---------|
| `cursor-curator/src/` | TypeScript sources (state, CLI, MCP, board) |
| `cursor-curator/dist/` | Compiled ESM for CLI, MCP, and board |
| `cursor-curator/scripts/lib/objective-*.mjs` | PM helper shims (import `dist/`; dual-read via `loadState`) |
| `objective-prep/` | Prep skill |
| `bun scripts/install-from-repo.mjs` | Install into `~/.cursor/skills` + skill runtime deps |

Canonical board truth is **SQLite** in `.cursor-curator/curator.db` (v3 `StateV3`, Zod-validated in `cursor-curator/src/state/` → `dist/state/`). Import legacy JSON with `curator db import`. Board UI and hub code live in `cursor-curator/src/board/` → `dist/board/`.
