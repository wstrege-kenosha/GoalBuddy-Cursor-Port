# T001 Scout — sample-cursor-smoke

Smoke objective: validate Cursor port without editing `cursor-curator`.

**Verify commands:**

- `npm run check`
- `node curator/scripts/curator.mjs doctor --objective-ready`
- `node curator/scripts/check-objective-state.mjs docs/objectives/sample-cursor-smoke/state.yaml`
- `node curator/scripts/curator.mjs board docs/objectives/sample-cursor-smoke`
