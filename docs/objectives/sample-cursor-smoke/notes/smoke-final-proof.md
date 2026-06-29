# Smoke final proof — board URL

**Board:** `db:sample-cursor-smoke` in `.cursor-curator/curator.db`

## Success criteria (final_proof)

- `check-objective sample-cursor-smoke` pass — verified T003 and T004
- Board URL captured in notes — this file

## Local board URL

From `visual_board.local.url` in state:

http://curator.localhost:41737/sample-cursor-smoke/

Loopback fallback: http://127.0.0.1:41737/sample-cursor-smoke/

## Verify

```bash
bun cursor-curator/dist/cli/curator.mjs check-objective sample-cursor-smoke
```
