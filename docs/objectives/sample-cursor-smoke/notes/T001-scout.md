# T001 Scout — sample-cursor-smoke

Smoke objective: validate Cursor port without editing `cursor-curator`.

**Verify commands:**

- `bun run check`
- `bun cursor-curator/dist/cli/curator.mjs doctor --objective-ready`
- `bun cursor-curator/dist/cli/curator.mjs check-objective sample-cursor-smoke`
- `bun cursor-curator/dist/cli/curator.mjs board docs/objectives/sample-cursor-smoke`
