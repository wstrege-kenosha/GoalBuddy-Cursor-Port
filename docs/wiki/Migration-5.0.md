# Migration: state.yaml v2 → state.json v3

Fork modernization introduces **JSON v3** state validated by Zod. Runtime code is **JSON-only**; use the one-time migration script for legacy YAML boards.

## What changed

| Before | After |
|--------|-------|
| `state.yaml`, `version: 2` | `state.json`, `version: 3` |
| Regex YAML validation + dual-read | Zod `StateV3Schema` in `cursor-curator/src/schema/state-v3.ts` |
| `scripts/lib/*.mjs` shims | TypeScript `cursor-curator/src/` → `dist/` |
| `node cursor-curator/scripts/curator.mjs` | `node cursor-curator/dist/cli/curator.mjs` or `curator` after install |
| MCP `cursor-curator/mcp/server.mjs` | `cursor-curator/dist/mcp/server.mjs` |

**Unchanged:** `objective.md` charter, `notes/`, `subobjectives/` layout, MCP tool names, PM loop semantics.

## Automated migration (YAML → JSON)

From your repo root (requires `npm install` for `tsx` and `yaml` dev deps):

```bash
node scripts/migrate-5.0.mts docs/objectives/<slug>
# preview only:
node scripts/migrate-5.0.mts docs/objectives/<slug> --dry-run
```

The script writes `state.json` and bumps `version` to 3. It does not delete `state.yaml`; remove YAML manually after you confirm the JSON board validates.

Validate:

```bash
node cursor-curator/dist/cli/curator.mjs check-state docs/objectives/<slug>/state.json
```

## Install / build

```bash
npm install
npm run build
node scripts/install-from-repo.mjs
```

`install-from-repo.mjs` builds `dist/` when missing and runs `npm install --omit=dev` inside the copied skill.

## Manual checklist

1. Run `scripts/migrate-5.0.mts` per objective still on YAML.
2. Update docs/scripts that hard-code `state.yaml` paths to `state.json`.
3. Run `npm run build && npm run check`.
4. Reinstall Cursor surfaces: `node scripts/install-from-repo.mjs`.
5. Restart the **cursor-curator** MCP server after dist changes.

## JSON-only policy

Runtime `loadState()` resolves **`state.json` only**. Explicit `.yaml` paths are rejected. One-time YAML→JSON conversion uses `scripts/migrate-5.0.mts` at the repo root (not the runtime CLI).
