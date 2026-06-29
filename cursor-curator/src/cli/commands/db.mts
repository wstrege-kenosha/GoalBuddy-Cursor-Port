import { join } from "node:path";
import { importLegacyObjectives } from "../../db/state-repository.mjs";
import { openDatabase } from "../../db/connection.mjs";
import type { CuratorCliContext } from "../curator-context.mjs";

export function runDbCommand(ctx: CuratorCliContext, subcommand: string): void {
  const json = ctx.hasFlag("--json");
  const workspaceRoot = process.cwd();
  if (subcommand === "migrate") {
    openDatabase(workspaceRoot);
    const payload = { ok: true, db_path: join(workspaceRoot, ".cursor-curator", "curator.db") };
    if (json) console.log(JSON.stringify(payload, null, 2));
    else console.log(`Database migrated: ${payload.db_path}`);
    return;
  }
  if (subcommand === "import") {
    const slug = ctx.flagValue("--slug") || undefined;
    const result = importLegacyObjectives(workspaceRoot, { slug });
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`Imported: ${result.imported.join(", ") || "(none)"}`);
      if (result.skipped.length) console.log(`Skipped: ${result.skipped.join(", ")}`);
      for (const error of result.errors) console.error(error);
    }
    process.exit(result.errors.length ? 1 : 0);
  }
  console.error("Usage: bun dist/cli/curator.mjs db migrate|import [--slug <slug>] [--json]");
  process.exit(2);
}
