# Migration: state.yaml v2 → state.json v3

> **Superseded at runtime by [Migration 6.0](Migration-6.0.md).** Use this guide only for one-time YAML→JSON conversion; board state then lives in `.cursor-curator/curator.db`.

Fork modernization introduces **JSON v3** state validated by Zod. Runtime code is **JSON-only**; use the one-time migration script for legacy YAML boards.

## What changed

| Before | After |
|--------|-------|
| `state.yaml`, `version: 2` | `state.json`, `version: 3` |
| Regex YAML validation + dual-read | Zod `StateV3Schema` in `cursor-curator/src/schema/state-v3.ts` |
| `scripts/lib/*.mjs` shims | TypeScript `cursor-curator/src/` → `dist/` |
| `bun cursor-curator/scripts/curator.mjs` | `bun cursor-curator/dist/cli/curator.mjs` or `curator` after install |
| MCP `cursor-curator/mcp/server.mjs` | `cursor-curator/dist/mcp/server.mjs` |

**Unchanged:** `objective.md` charter, `notes/`, `subobjectives/` layout, MCP tool names, PM loop semantics.

## Automated migration (YAML → JSON)

From your repo root (requires `bun install` for `yaml` dev dep):

```bash
bun scripts/migrate-5.0.mts docs/objectives/<slug>
# preview only:
bun scripts/migrate-5.0.mts docs/objectives/<slug> --dry-run
```

The script writes `state.json` and bumps `version` to 3. It does not delete `state.yaml`; remove YAML manually after you confirm the JSON board validates.

Validate:

```bash
bun cursor-curator/dist/cli/curator.mjs db import --slug <slug>
bun cursor-curator/dist/cli/curator.mjs check-objective <slug>
```

## Install / build

```bash
bun install
bun run build
bun scripts/install-from-repo.mjs
```

`install-from-repo.mjs` builds `dist/` when missing and runs `bun install --production` inside the copied skill.

## Manual checklist

1. Run `scripts/migrate-5.0.mts` per objective still on YAML.
2. Update docs/scripts that hard-code `state.yaml` paths to `state.json`.
3. Run `bun run build && bun run check`.
4. Reinstall Cursor surfaces: `bun scripts/install-from-repo.mjs`.
5. Restart the **cursor-curator** MCP server after dist changes.

## JSON-only policy

Runtime board state now lives in **SQLite** ([Migration 6.0](Migration-6.0.md)). After JSON conversion, run `curator db import`. Explicit `.yaml` paths are rejected at validation time.
