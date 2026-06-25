# Smoke final proof — board URL

**Board:** `docs/objectives/sample-cursor-smoke/state.yaml`

## Success criteria (final_proof)

- `check-objective-state` pass — verified T003 and T004
- Board URL captured in notes — this file

## Local board URL

From `visual_board.local.url` in state:

http://curator.localhost:41737/sample-cursor-smoke/

Loopback fallback: http://127.0.0.1:41737/sample-cursor-smoke/

## Verify

```bash
node cursor-curator/scripts/check-objective-state.mjs docs/objectives/sample-cursor-smoke/state.yaml
```
