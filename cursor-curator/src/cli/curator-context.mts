import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface CuratorCliContext {
  args: string[];
  command: string;
  skillRoot: string;
  cursorHome: string;
  versionInfo: {
    cursorPortVersion?: string;
    upstreamVersion?: string;
  };
  hasFlag: (name: string) => boolean;
  flagValue: (name: string) => string;
  positionalObjectivePath: () => string;
}

export function createCliContext(argv: string[] = process.argv.slice(2)): CuratorCliContext {
  const skillRoot = resolve(__dirname, "../..");
  const cursorHome = resolve(process.env.CURSOR_HOME || join(homedir(), ".cursor"));
  const versionInfo = JSON.parse(readFileSync(join(skillRoot, "version.json"), "utf8")) as {
    cursorPortVersion?: string;
    upstreamVersion?: string;
  };
  const command = argv[0] && !argv[0].startsWith("-") ? argv[0] : "default";

  function hasFlag(name: string): boolean {
    return argv.includes(name);
  }

  function flagValue(name: string): string {
    const index = argv.indexOf(name);
    if (index === -1) return "";
    const inline = argv[index].includes("=") ? argv[index].split("=")[1] : "";
    return inline || argv[index + 1] || "";
  }

  function positionalObjectivePath(): string {
    const skip = new Set([
      "--task",
      "--board",
      "--host",
      "--port",
      "--path",
      "--receipt-file",
      "--role",
      "--days",
      "--stale-days",
    ]);
    const pos = argv.slice(1).filter(
      (a) => !a.startsWith("-") && !skip.has(a) && !a.startsWith("--task=") && !a.startsWith("--board="),
    );
    const goalArg = pos[0];
    if (!goalArg) {
      console.error("Missing goal path: docs/objectives/<slug>");
      process.exit(2);
    }
    return resolve(goalArg);
  }

  return {
    args: argv,
    command,
    skillRoot,
    cursorHome,
    versionInfo,
    hasFlag,
    flagValue,
    positionalObjectivePath,
  };
}

export function printUsage(ctx: CuratorCliContext): void {
  console.log(`Cursor Curator for Cursor (port ${ctx.versionInfo.cursorPortVersion}, upstream ${ctx.versionInfo.upstreamVersion})

Usage:
  bun dist/cli/curator.mjs [install] [--force] [--no-add-to-path]
  curator [install] [--force] [--no-add-to-path]   (after install-cli-bin)
  bun dist/cli/curator.mjs reinstall --clean [--json] [--no-add-to-path]
  bun dist/cli/curator.mjs reset
  bun dist/cli/curator.mjs doctor [--objective-ready] [--json]
  bun dist/cli/curator.mjs update [--json]
  bun dist/cli/curator.mjs check-update [--json]
  bun dist/cli/curator.mjs prompt <docs/objectives/slug> [--task T###] [--json]
  bun dist/cli/curator.mjs parallel-plan <docs/objectives/slug> [--json]
  bun dist/cli/curator.mjs receipt <file|json> [--role scout|approval_gate|worker] [--task T###] [--json]
  bun dist/cli/curator.mjs completion-check <docs/objectives/slug> [--json]
  bun dist/cli/curator.mjs check-objective <docs/objectives/slug> [--json]
  bun dist/cli/curator.mjs apply-receipt <slug> [--receipt-file path] [--role worker] [--task T###] [--dry-run] [--json]
  bun dist/cli/curator.mjs db migrate|import [--slug <slug>] [--json]
  bun dist/cli/curator.mjs register-objective <slug> [--json]
  bun dist/cli/curator.mjs resume <docs/objectives/slug> [--json]
  bun dist/cli/curator.mjs verify-receipt <docs/objectives/slug> [--task T###] [--receipt-file ...] [--json]
  bun dist/cli/curator.mjs blocked <docs/objectives/slug> [--json]
  bun dist/cli/curator.mjs misfire-audit <docs/objectives/slug> [--json]
  bun dist/cli/curator.mjs subobjective-rollup <docs/objectives/slug> [--json]
  bun dist/cli/curator.mjs stale [--days 7] [--json]
  bun dist/cli/curator.mjs hub [--json]
  bun dist/cli/curator.mjs board <docs/objectives/slug> [--host <host>] [--port <port>] [--once] [--json]
  bun dist/cli/curator.mjs migrate   (legacy removed — use scripts/migrate-5.0.mts at repo root)
  bun dist/cli/curator.mjs workspace register [--json]

Skill root: ${ctx.skillRoot}
`);
}
