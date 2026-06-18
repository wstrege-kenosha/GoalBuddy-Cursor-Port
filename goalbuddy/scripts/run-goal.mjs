#!/usr/bin/env node
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSdkExecutor } from "@goalbuddy/runner";
import { runGoalLoop, buildMcpServersForRunner } from "./lib/goal-runner-loop.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(__dirname, "..");

function parseArgs(argv) {
  const options = {
    goal: "",
    maxTurns: 1,
    dryRun: false,
    parallel: false,
    json: false,
    sessionLog: true,
    workspaceRoot: process.cwd(),
  };

  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--auto") {
      options.maxTurns = Number(argv[++index] || "1");
    } else if (arg.startsWith("--auto=")) {
      options.maxTurns = Number(arg.slice(7) || "1");
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--parallel") {
      options.parallel = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--no-session-log") {
      options.sessionLog = false;
    } else if (arg === "--cwd") {
      options.workspaceRoot = resolve(argv[++index] || process.cwd());
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  options.goal = positional[0] || "";
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.goal) {
    console.error("Usage: run-goal.mjs <docs/goals/slug> --auto N [--dry-run] [--parallel] [--json]");
    process.exit(2);
  }

  const apiKey = process.env.CURSOR_API_KEY || "";
  if (!options.dryRun && !apiKey) {
    console.error("CURSOR_API_KEY is required for SDK runs. Use --dry-run for offline loop tests.");
    process.exit(1);
  }

  const mcpServers = buildMcpServersForRunner(skillRoot, options.workspaceRoot);
  const executeAgent = options.dryRun
    ? undefined
    : createSdkExecutor({
        apiKey,
        mcpServers,
        onText: options.json ? undefined : (chunk) => process.stdout.write(chunk),
      });

  const report = await runGoalLoop({
    goal: options.goal,
    workspaceRoot: options.workspaceRoot,
    skillRoot,
    maxTurns: options.maxTurns,
    dryRun: options.dryRun,
    parallel: options.parallel,
    json: options.json,
    sessionLog: options.sessionLog,
    executeAgent,
    mockAgentText: process.env.GOALBUDDY_MOCK_AGENT_TEXT,
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  }

  const failureReasons = new Set([
    "validation_error",
    "pm_task_manual",
    "unknown_task_type",
    "dry_run_no_mock",
    "agent_error",
    "parallel_agent_error",
    "missing_receipt",
    "receipt_apply_failed",
    "post_validation_error",
    "blocked",
  ]);

  process.exit(failureReasons.has(report.stop_reason) ? 1 : 0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
