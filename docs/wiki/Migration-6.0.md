# Migration: state.json v3 → SQLite (6.0)

Board state now lives in a workspace SQLite database instead of per-objective `state.json` files.

## Database location

```
<workspace>/.cursor-curator/curator.db
```

The file is gitignored. Objective directories (`docs/objectives/<slug>/`) remain for `objective.md`, `notes/`, and generated board UI.

## Steps

1. **Import legacy JSON boards** (one-time per workspace):

   ```bash
   bun cursor-curator/dist/cli/curator.mjs db import
   ```

   Or a single slug:

   ```bash
   bun cursor-curator/dist/cli/curator.mjs db import --slug sample-cursor-smoke
   ```

2. **Verify**:

   ```bash
   bun cursor-curator/dist/cli/curator.mjs check-objective sample-cursor-smoke
   ```

3. **Remove committed `state.json`** from objective directories after confirming import. Test fixtures under `cursor-curator/scripts/test/fixtures/` remain the canonical import seeds (including `sample-cursor-smoke/` for CI).

4. **Update PM workflow** — mutate state only through MCP/CLI write tools:
   - `apply_receipt`
   - `patch_task`
   - `patch_objective`
   - `register_objective`

## Runtime

The application **never reads per-objective `state.json` at runtime**. Only `curator db import` / MCP `db_import` read legacy JSON files to seed `curator.db`.

| Before | After |
|--------|-------|
| `state.json` source of truth | `.cursor-curator/curator.db` |
| PM edits JSON in chat | PM calls MCP write tools |
| `board_path` = file path | `board_path` = `db:<slug>` |
| `check-state` | `check-objective` (alias: `check-state`) |

## Bun-only runtime

Install, MCP, and CLI shims use **Bun** (`bun:sqlite` for storage). See [Migration Node → Bun](Migration-Node-to-Bun.md).
