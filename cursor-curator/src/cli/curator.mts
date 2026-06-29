import { createCliContext, printUsage, type CuratorCliContext } from "./curator-context.mjs";

type Route = (ctx: CuratorCliContext) => void | Promise<void>;

const ROUTES: Record<string, Route> = {
  default: async (ctx) => { (await import("./commands/lifecycle.mjs")).runInstall(ctx); },
  install: async (ctx) => { (await import("./commands/lifecycle.mjs")).runInstall(ctx); },
  reset: async (ctx) => { (await import("./commands/lifecycle.mjs")).runReset(ctx); },
  reinstall: async (ctx) => { (await import("./commands/lifecycle.mjs")).runReinstall(ctx); },
  doctor: async (ctx) => { await (await import("./commands/lifecycle.mjs")).runDoctor(ctx); },
  update: async (ctx) => { await (await import("./commands/lifecycle.mjs")).runUpdate(ctx); },
  "check-update": async (ctx) => {
    const { runCheckUpdate } = await import("./check-update.mjs");
    process.exit(runCheckUpdate(ctx.args.slice(1)));
  },
  "update-check": async (ctx) => {
    const { runCheckUpdate } = await import("./check-update.mjs");
    process.exit(runCheckUpdate(ctx.args.slice(1)));
  },
  workspace: async (ctx) => { (await import("./commands/lifecycle.mjs")).runWorkspace(ctx, ctx.args[1] || "register"); },
  prompt: async (ctx) => { (await import("./commands/objective.mjs")).runPrompt(ctx); },
  "parallel-plan": async (ctx) => { (await import("./commands/objective.mjs")).runParallelPlan(ctx); },
  board: async (ctx) => { await (await import("./commands/board.mjs")).runBoard(ctx); },
  receipt: async (ctx) => { (await import("./commands/receipt.mjs")).runReceiptValidate(ctx); },
  "completion-check": async (ctx) => { (await import("./commands/objective.mjs")).runCompletionCheck(ctx); },
  stale: async (ctx) => { (await import("./commands/objective.mjs")).runStale(ctx); },
  resume: async (ctx) => { (await import("./commands/objective.mjs")).runResume(ctx); },
  "verify-receipt": async (ctx) => { (await import("./commands/objective.mjs")).runVerifyReceipt(ctx); },
  blocked: async (ctx) => { (await import("./commands/objective.mjs")).runBlocked(ctx); },
  "misfire-audit": async (ctx) => { (await import("./commands/objective.mjs")).runMisfireAudit(ctx); },
  "subobjective-rollup": async (ctx) => { (await import("./commands/objective.mjs")).runSubobjectiveRollup(ctx); },
  hub: async (ctx) => { (await import("./commands/objective.mjs")).runHub(ctx); },
  usage: async (ctx) => {
    const { toolGetUsageSummary } = await import("../mcp/tools.mjs");
    const json = ctx.hasFlag("--json");
    const objectiveRef = ctx.positionalObjectivePath();
    const result = toolGetUsageSummary({
      objective: objectiveRef,
      include_subobjectives: !ctx.hasFlag("--no-subobjectives"),
      workspace_root: process.cwd(),
    });
    const usage = result.usage as {
      visible?: boolean;
      summary?: string;
      usage_warning?: string;
      agent_time?: string;
      tokens?: string;
    };
    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`Usage: ${result.objective_slug}`);
    if (usage?.visible) {
      console.log(usage.summary || `${usage.agent_time} · ${usage.tokens} tokens`);
    } else {
      console.log("No usage recorded yet.");
    }
    if (usage?.usage_warning) {
      console.log(`Warning: ${usage.usage_warning}`);
    }
  },
  "check-state": async (ctx) => { (await import("./commands/objective.mjs")).runCheckState(ctx); },
  "check-objective": async (ctx) => { (await import("./commands/objective.mjs")).runCheckState(ctx); },
  "apply-receipt": async (ctx) => { (await import("./commands/objective.mjs")).runApplyReceipt(ctx); },
  db: async (ctx) => { (await import("./commands/db.mjs")).runDbCommand(ctx, ctx.args[1] || ""); },
  "register-objective": async (ctx) => { (await import("./commands/objective.mjs")).runRegisterObjective(ctx); },
  migrate: async (ctx) => { (await import("./commands/objective.mjs")).runMigrateCommand(ctx); },
  help: (ctx) => { printUsage(ctx); },
  "--help": (ctx) => { printUsage(ctx); },
  "-h": (ctx) => { printUsage(ctx); },
};

async function main(): Promise<void> {
  const ctx = createCliContext();
  const route = ROUTES[ctx.command];
  if (!route) {
    console.error(`Unknown command: ${ctx.command}`);
    printUsage(ctx);
    process.exit(2);
  }
  await route(ctx);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
