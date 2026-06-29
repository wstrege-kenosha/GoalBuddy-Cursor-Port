# Migration: Node/npm → Bun

Cursor Curator now requires **Bun** instead of Node.js and npm.

## Steps

1. **Install Bun** from [bun.sh](https://bun.sh) if needed:

   ```bash
   bun --version
   ```

2. **In your Cursor-Curator clone:**

   ```bash
   rm -f package-lock.json   # Windows: del package-lock.json
   bun install
   bun run build
   ```

3. **Re-install Cursor surfaces** (rewrites MCP config, CLI shims, and hooks):

   ```bash
   bun run install:cursor
   ```

4. **Open a new terminal** and verify:

   ```bash
   curator doctor --objective-ready
   ```

5. **Restart Cursor** so MCP and integrated terminals pick up the Bun-based launcher.

## What changes

| Before | After |
|--------|-------|
| `npm install` | `bun install` |
| `npm run build` | `bun run build` |
| `node scripts/install-from-repo.mjs` | `bun scripts/install-from-repo.mjs` |
| MCP `"command": "node"` | MCP `"command": "bun"` |
| `~/.cursor/bin/curator` shim uses `node` | Shim uses `bun` |

## Stale installs

If MCP fails to start or `curator` still invokes `node`, you likely have a pre-migration install. Re-run `bun run install:cursor` from a fresh clone.

## Lockfile

This repo uses `bun.lock` instead of `package-lock.json`. Do not commit `package-lock.json` after migrating.
