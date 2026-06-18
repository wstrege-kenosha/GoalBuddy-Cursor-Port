#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import dns from "node:dns/promises";
import net from "node:net";
import { installCursorSurfaces, resetCursorSurfaces } from "./install-agents.mjs";
import {
  checkMcpConfig,
  defaultProjectRootsFromSkill,
  installMcpConfig,
} from "./install-mcp.mjs";
import { runMcpSmokeTest } from "../mcp/tools.mjs";
import { renderTaskPrompt } from "./render-task-prompt.mjs";
import { checkCompletionReadiness } from "./lib/goal-completion.mjs";
import { buildHubPayload } from "./lib/goal-hub.mjs";
import { validateReceipt } from "./lib/goal-receipt.mjs";
import { findStaleGoals } from "./lib/goal-stale.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(__dirname, "..");
const cursorHome = resolve(process.env.CURSOR_HOME || join(homedir(), ".cursor"));
const versionInfo = JSON.parse(readFileSync(join(skillRoot, "version.json"), "utf8"));

const CURSOR_AGENT_MAP = {
  goal_scout: "goal-scout",
  goal_judge: "goal-judge",
  goal_worker: "goal-worker",
};

const REQUIRED_AGENTS = ["goal-scout.md", "goal-judge.md", "goal-worker.md"];
const REQUIRED_COMMANDS = ["goal-prep.md", "goal.md", "goal-board.md"];
const REQUIRED_SCRIPTS = [
  "check-goal-state.mjs",
  "check-update.mjs",
  "parallel-plan.mjs",
  "render-task-prompt.mjs",
  "local-goal-board.mjs",
  "lib/goal-board.mjs",
  "lib/goal-state.mjs",
  "lib/goal-receipt.mjs",
  "lib/goal-completion.mjs",
  "lib/goal-stale.mjs",
  "lib/goal-hub.mjs",
  "lib/goal-session.mjs",
  "../mcp/server.mjs",
  "../mcp/tools.mjs",
];

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith("-") ? args[0] : "default";

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

async function main() {
  switch (command) {
    case "default":
    case "install":
      runInstall();
      break;
    case "reset":
      runReset();
      break;
    case "doctor":
      await runDoctor();
      break;
    case "update":
      await runUpdate();
      break;
    case "check-update":
    case "update-check":
      runCheckUpdate();
      break;
    case "prompt":
      runPrompt();
      break;
    case "parallel-plan":
      runParallelPlan();
      break;
    case "board":
      await runBoard();
      break;
    case "receipt":
      runReceiptValidate();
      break;
    case "completion-check":
      runCompletionCheck();
      break;
    case "stale":
      runStale();
      break;
    case "hub":
      runHub();
      break;
    case "help":
    case "--help":
    case "-h":
      usage();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      usage();
      process.exit(2);
  }
}

function usage() {
  console.log(`GoalBuddy for Cursor (port ${versionInfo.cursorPortVersion}, upstream ${versionInfo.upstreamVersion})

Usage:
  node goalbuddy.mjs [install] [--force]
  node goalbuddy.mjs reset
  node goalbuddy.mjs doctor [--goal-ready] [--json]
  node goalbuddy.mjs update [--json]
  node goalbuddy.mjs check-update [--json]
  node goalbuddy.mjs prompt <docs/goals/slug> [--task T###] [--json]
  node goalbuddy.mjs parallel-plan <docs/goals/slug> [--json]
  node goalbuddy.mjs receipt <file|json> [--role scout|judge|worker] [--task T###] [--json]
  node goalbuddy.mjs completion-check <docs/goals/slug> [--json]
  node goalbuddy.mjs stale [--days 7] [--json]
  node goalbuddy.mjs hub [--json]
  node goalbuddy.mjs board <docs/goals/slug> [--host <host>] [--port <port>] [--once] [--json]

Skill root: ${skillRoot}
`);
}

function runInstall() {
  const force = hasFlag("--force");
  const result = installCursorSurfaces({ force, quiet: false });
  if (result.errors.length) {
    console.error(result.errors.join("\n"));
    process.exit(1);
  }

  const mcpResult = installMcpConfig({
    skillRoot,
    projectRoots: defaultProjectRootsFromSkill(skillRoot),
    cursorHome,
  });
  if (mcpResult.errors.length) {
    console.error(mcpResult.errors.join("\n"));
    process.exit(1);
  }

  console.log(`GoalBuddy Cursor install complete.`);
  console.log(`Skills: ${join(cursorHome, "skills", "goalbuddy")}`);
  console.log(`Agents: ${join(cursorHome, "agents")}`);
  console.log(`Commands: ${join(cursorHome, "commands")}`);
  for (const entry of mcpResult.installed) {
    console.log(`MCP: ${entry.configPath}`);
  }
  console.log(`Next: enable the goalbuddy MCP server in Cursor, then /goal-prep and /goal.`);
}

function runReset() {
  const { removed } = resetCursorSurfaces();
  console.log(`Reset removed ${removed.length} file(s). Skill payload kept at ${skillRoot}`);
}

async function runDoctor() {
  const goalReady = hasFlag("--goal-ready");
  const json = hasFlag("--json");
  const checks = [];

  checks.push(nodeVersionCheck());
  checks.push(...requiredFilesCheck());
  checks.push(...installSurfacesCheck());
  checks.push(...mcpConfigCheck());
  checks.push(mcpSmokeCheck());
  if (goalReady) {
    checks.push(...agentFrontmatterCheck());
    checks.push(await dnsCheck());
    checks.push(await portCheck());
  }

  const ok = checks.every((c) => c.ok);
  const report = { ok, target: "cursor", checks, skillRoot, version: versionInfo };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const c of checks) {
      console.log(`${c.ok ? "ok" : "fail"} ${c.name}${c.detail ? `: ${c.detail}` : ""}`);
    }
    if (!ok) console.error("\nDoctor found issues. Run: node goalbuddy.mjs install");
    if (goalReady && ok) console.log("\nGoal-ready: Cursor surfaces look good. Restart Cursor if Task subagents are missing.");
  }
  if (!ok) process.exit(1);
}

function nodeVersionCheck() {
  const major = Number(process.versions.node.split(".")[0]);
  return { name: "node>=18", ok: major >= 18, detail: process.versions.node };
}

function requiredFilesCheck() {
  const results = [];
  for (const rel of [
    "SKILL.md",
    "LICENSE",
    "version.json",
    "assets/goalbuddy-mark.png",
    ...REQUIRED_SCRIPTS.map((s) => `scripts/${s}`),
  ]) {
    const path = join(skillRoot, rel);
    results.push({ name: `file:${rel}`, ok: existsSync(path), detail: path });
  }
  return results;
}

function installSurfacesCheck() {
  const results = [];
  for (const file of REQUIRED_AGENTS) {
    const path = join(cursorHome, "agents", file);
    results.push({ name: `agent:${file}`, ok: existsSync(path), detail: path });
  }
  for (const file of REQUIRED_COMMANDS) {
    const path = join(cursorHome, "commands", file);
    results.push({ name: `command:${file}`, ok: existsSync(path), detail: path });
  }
  return results;
}

function mcpConfigCheck() {
  const configPath = join(process.cwd(), ".cursor", "mcp.json");
  const check = checkMcpConfig(configPath, skillRoot);
  if (check.ok) return [check];
  const skillConfig = checkMcpConfig(join(skillRoot, "..", ".cursor", "mcp.json"), skillRoot);
  return [skillConfig.ok ? skillConfig : check];
}

function mcpSmokeCheck() {
  try {
    const smoke = runMcpSmokeTest({
      workspaceRoot: process.cwd(),
      goal: "sample-cursor-smoke",
    });
    return {
      name: "mcp:smoke",
      ok: smoke.ok,
      detail: smoke.validation_ok
        ? `validate_state ok on ${smoke.state_path}`
        : `validation failed on ${smoke.state_path}`,
    };
  } catch (error) {
    return { name: "mcp:smoke", ok: false, detail: error.message };
  }
}

function agentFrontmatterCheck() {
  const results = [];
  for (const file of REQUIRED_AGENTS) {
    const path = join(cursorHome, "agents", file);
    if (!existsSync(path)) {
      results.push({ name: `frontmatter:${file}`, ok: false, detail: "missing" });
      continue;
    }
    const text = readFileSync(path, "utf8");
    const ok = /^---\s*\nname:\s*goal-(scout|judge|worker)/m.test(text);
    results.push({ name: `frontmatter:${file}`, ok, detail: ok ? "valid" : "invalid frontmatter" });
  }
  return results;
}

async function dnsCheck() {
  try {
    const records = await dns.lookup("goalbuddy.localhost");
    const ok = records.address === "127.0.0.1" || records.address === "::1";
    return { name: "dns:goalbuddy.localhost", ok, detail: records.address };
  } catch (error) {
    // Windows may not resolve *.localhost; board still works at http://127.0.0.1:41737/
    return {
      name: "dns:goalbuddy.localhost",
      ok: true,
      detail: `${error.code || error.message}; use http://127.0.0.1:41737/<slug>/ if .localhost fails`,
    };
  }
}

function portCheck() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => {
      resolve({ name: "port:41737", ok: true, detail: "in use (board may already be running)" });
    });
    server.once("listening", () => {
      server.close(() => {
        resolve({ name: "port:41737", ok: true, detail: "available" });
      });
    });
    server.listen(41737, "127.0.0.1");
  });
}

async function runUpdate() {
  const child = spawnSync(process.execPath, [join(__dirname, "check-update.mjs"), "--json"], {
    encoding: "utf8",
    cwd: skillRoot,
  });
  let payload = {};
  try {
    payload = JSON.parse(child.stdout || "{}");
  } catch {
    payload = { raw: child.stdout };
  }
  if (hasFlag("--json")) {
    console.log(JSON.stringify({ check: payload, skillRoot, note: "Vendored scripts live in ~/.cursor/skills/goalbuddy. Re-clone upstream or run npm pack goalbuddy to refresh." }, null, 2));
  } else {
    if (payload.update_available) {
      console.log(`npm goalbuddy ${payload.latest_version} available (installed port tracks ${versionInfo.upstreamVersion}).`);
      console.log("To refresh vendored files, re-run the port installer or copy from a fresh upstream clone.");
    } else {
      console.log(`GoalBuddy Cursor port is current with vendored upstream ${versionInfo.upstreamVersion}.`);
    }
  }
}

function runCheckUpdate() {
  const child = spawnSync(process.execPath, [join(__dirname, "check-update.mjs"), ...args.slice(1)], {
    stdio: "inherit",
    cwd: skillRoot,
  });
  process.exit(child.status ?? 0);
}

function runPrompt() {
  const promptArgs = mapCursorAgentNamesInArgs(args.slice(1));
  const result = renderTaskPrompt(parsePromptArgs(promptArgs));
  if (result.json) {
    const payload = mapCursorAgentsInPayload(result.payload);
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(formatCursorPrompt(result.payload));
  }
}

function parsePromptArgs(argv) {
  const options = { goalRoot: "", boardPath: "", taskId: "", json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--task") options.taskId = argv[++i] || "";
    else if (arg.startsWith("--task=")) options.taskId = arg.slice(7);
    else if (arg === "--board") options.boardPath = argv[++i] || "";
    else if (arg.startsWith("--board=")) options.boardPath = arg.slice(8);
    else if (!arg.startsWith("-") && !options.goalRoot) options.goalRoot = resolve(arg);
  }
  if (!options.goalRoot && !options.boardPath) {
    throw new Error("Usage: goalbuddy prompt <goal-root> [--task T###] [--json]");
  }
  return options;
}

function mapCursorAgentsInPayload(payload) {
  const agent = payload.metadata.recommended_agent;
  const mapped = CURSOR_AGENT_MAP[agent] || agent;
  return {
    ...payload,
    metadata: {
      ...payload.metadata,
      recommended_agent: mapped,
      required_spawn_agent_type: mapped === "PM" ? null : mapped,
      cursor_task_subagent_type: mapped === "PM" ? null : mapped,
    },
  };
}

function formatCursorPrompt(payload) {
  const m = payload.metadata;
  const t = payload.task;
  return [
    "# GoalBuddy task handoff (Cursor)",
    "",
    `- board_path: ${m.board_path}`,
    `- task_id: ${t.id}`,
    `- type: ${t.type}`,
    `- cursor Task subagent_type: ${m.cursor_task_subagent_type || "PM (no spawn)"}`,
    `- objective: ${t.objective}`,
    "",
    "## Task",
    JSON.stringify(t, null, 2),
    "",
    "## Receipt schema",
    JSON.stringify(payload.receipt_schema, null, 2),
  ].join("\n");
}

function mapCursorAgentNamesInArgs(argv) {
  return argv;
}

function runParallelPlan() {
  const goal = positionalGoalPath();
  const child = spawnSync(process.execPath, [join(__dirname, "parallel-plan.mjs"), goal, ...(hasFlag("--json") ? ["--json"] : [])], {
    encoding: "utf8",
    cwd: process.cwd(),
  });
  if (child.status !== 0) {
    console.error(child.stderr || child.stdout);
    process.exit(child.status || 1);
  }
  let out = child.stdout;
  if (hasFlag("--json")) {
    try {
      const data = JSON.parse(out);
      const mapAgent = (r) => ({
        ...r,
        recommended_agent: CURSOR_AGENT_MAP[r.recommended_agent] || r.recommended_agent,
        cursor_task_subagent_type: CURSOR_AGENT_MAP[r.recommended_agent] || r.recommended_agent,
      });
      data.recommendations = (data.recommendations || []).map(mapAgent);
      data.candidates = (data.candidates || []).map(mapAgent);
      out = JSON.stringify(data, null, 2);
    } catch {
      /* keep raw */
    }
  }
  process.stdout.write(out);
}

async function runBoard() {
  const goal = positionalGoalPath();
  const boardScript = join(__dirname, "local-goal-board.mjs");
  const boardArgs = [boardScript, "--goal", goal, ...args.slice(2).filter((a) => a !== "board")];
  const child = spawnSync(process.execPath, boardArgs, { stdio: "inherit", cwd: process.cwd() });
  process.exit(child.status ?? 0);
}

function runReceiptValidate() {
  const json = hasFlag("--json");
  const role = flagValue("--role");
  const expectedTaskId = flagValue("--task");
  const positional = args.slice(1).filter((arg) => !arg.startsWith("-") && arg !== "receipt");
  const target = positional[0];
  if (!target) {
    console.error("Usage: goalbuddy receipt <file|json> [--role scout|judge|worker] [--task T###] [--json]");
    process.exit(2);
  }

  let input = target;
  if (existsSync(resolve(target))) {
    input = readFileSync(resolve(target), "utf8");
  }

  const result = validateReceipt(input, { role, expectedTaskId });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log(`Receipt valid for ${result.role} task ${result.receipt.task_id}.`);
    for (const warning of result.warnings) console.log(`warning: ${warning}`);
  } else {
    for (const error of result.errors) console.error(error);
    for (const warning of result.warnings) console.log(`warning: ${warning}`);
  }
  process.exit(result.ok ? 0 : 1);
}

function runCompletionCheck() {
  const json = hasFlag("--json");
  const statePath = resolveBoardStatePath();
  const result = checkCompletionReadiness(statePath);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ready) {
    console.log(`Completion ready: ${statePath}`);
  } else {
    console.error(`Completion not ready: ${statePath}`);
    for (const blocker of result.blockers) console.error(`- ${blocker}`);
    for (const warning of result.warnings) console.log(`warning: ${warning}`);
  }
  process.exit(result.ready ? 0 : 1);
}

function runStale() {
  const json = hasFlag("--json");
  const days = Number(flagValue("--days") || "7");
  const result = findStaleGoals({ days, roots: [process.cwd()] });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.goals.length === 0) {
    console.log(`No stale goals found (threshold: ${result.stale_days} days).`);
  } else {
    console.log(`Stale goals (threshold: ${result.stale_days} days):`);
    for (const goal of result.goals) {
      console.log(`- ${goal.slug}: ${goal.reasons.join("; ")}`);
      for (const suggestion of goal.suggestions) console.log(`  → ${suggestion}`);
    }
  }
  process.exit(0);
}

function runHub() {
  const json = hasFlag("--json");
  const payload = buildHubPayload({ roots: [process.cwd()] });
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    for (const goal of payload.goals) {
      console.log(`${goal.title} [${goal.status}] active=${goal.active_task || "none"} oracle=${goal.oracle_health}`);
    }
  }
}

function resolveBoardStatePath() {
  const goal = positionalGoalPath();
  return basename(resolve(goal)) === "state.yaml" ? resolve(goal) : resolve(goal, "state.yaml");
}

function flagValue(name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  const inline = args[index].includes("=") ? args[index].split("=")[1] : "";
  return inline || args[index + 1] || "";
}

function positionalGoalPath() {
  const pos = args.slice(1).filter((a) => !a.startsWith("-") && !["--task", "--board", "--host", "--port"].includes(a));
  const goalArg = pos[0];
  if (!goalArg) {
    console.error("Missing goal path: docs/goals/<slug>");
    process.exit(2);
  }
  return resolve(goalArg);
}

function hasFlag(name) {
  return args.includes(name);
}
