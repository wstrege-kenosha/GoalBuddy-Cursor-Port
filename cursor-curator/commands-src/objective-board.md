# objective-board

Start or refresh the Cursor Curator local board for an objective in this workspace.

## Steps

1. Determine the objective directory:
   - If the user named `docs/objectives/<slug>`, use that path.
   - Else list objectives from the workspace DB (`curator hub --json`) or ask which slug.

2. Run the board server (background if long-running):

   ```bash
   bun ~/.cursor/skills/cursor-curator/dist/cli/curator.mjs board docs/objectives/<slug>
   ```

3. Tell the user the board URL as a clickable Markdown link:

   `[Open Cursor Curator board](http://curator.localhost:41737/<slug>/)`

4. If port 41737 is in use, follow script output — check `http://127.0.0.1:41737/api/boards` before killing processes.

## Reference

`~/.cursor/skills/cursor-curator/surfaces/local-objective-board/README.md`
