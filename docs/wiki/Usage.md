# Usage

## In Cursor (PM loop)

1. `/objective-prep` — describe your outcome; Cursor Curator scaffolds `docs/objectives/<slug>/` in your workspace.
2. `/objective Follow docs/objectives/<slug>/objective.md.` — PM runs Scout → Approval Gate → Worker using **cursor-curator MCP tools** each turn.

### MCP tool sequence (each `/objective` turn)

0. `session_resume_digest` — turn-0 handoff; use `list_objectives` with `stale_days: 7` when objectives may be idle
1. `get_active_task` → `validate_state` (stop if errors)
2. `misfire_audit_check` / `subobjective_rollup_check` when rules require them
3. `render_task_prompt` → spawn Task subagent (`objective-scout` | `objective-approval-gate` | `objective-worker`)
4. `validate_receipt` → `verify_worker_receipt` for done Workers (writes `checks.last_verification` patch)
5. PM updates `state.json`
6. `validate_state` again → `append_session_note`

## CLI (after install)

Add `%USERPROFILE%\.cursor\bin` (Windows) or `~/.cursor/bin` (macOS/Linux) to PATH. Then from any repo with an objective:

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
node ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs doctor --objective-ready
```

## Local board and hub

- **Hub** (all objectives): http://curator.localhost:41737/
- **Single objective**: http://curator.localhost:41737/<slug>/

Use http://127.0.0.1:41737/ if `curator.localhost` does not resolve.

## Repo layout

| Path | Purpose |
|------|---------|
| `cursor-curator/src/` | TypeScript sources (state, CLI, MCP, board) |
| `cursor-curator/dist/` | Compiled ESM for CLI, MCP, and board |
| `cursor-curator/scripts/lib/objective-*.mjs` | PM helper shims (import `dist/`; dual-read via `loadState`) |
| `objective-prep/` | Prep skill |
| `scripts/install-from-repo.mjs` | Install into `~/.cursor/skills` + skill runtime deps |

Canonical board truth is **`state.json`** (v3, Zod-validated in `cursor-curator/src/state/` → `dist/state/`). `loadState()` resolves JSON first, then legacy `state.yaml` v2 with a deprecation warning. Board UI and hub code live in `cursor-curator/src/board/` → `dist/board/`.
