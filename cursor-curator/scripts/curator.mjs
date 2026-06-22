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
  ensureProjectMcpConfig,
  installMcpConfig,
} from "./install-mcp.mjs";
import { installCliBin } from "./install-cli-bin.mjs";
import { getWorkspaceRoot, registerKnownWorkspace } from "../mcp/path-utils.mjs";
import { runMcpSmokeTest } from "../mcp/tools.mjs";
import { renderTaskPrompt } from "./render-task-prompt.mjs";
import { checkCompletionReadiness } from "./lib/objective-completion.mjs";
import { buildBlockedTriagePlan, listBlockedTasks } from "./lib/objective-blocked.mjs";
import { buildHubPayload } from "./lib/objective-hub.mjs";
import { misfireAuditStatus } from "./lib/objective-misfire.mjs";
import { validateReceipt } from "./lib/objective-receipt.mjs";
import { buildResumeDigest } from "./lib/objective-session.mjs";
import { checkSubgoalRollup } from "./lib/objective-subgoal.mjs";
import { findStaleGoals } from "./lib/objective-stale.mjs";
import { parseReceiptFromText } from "./lib/objective-state-write.mjs";
import { verifyWorkerReceiptForTask } from "./lib/objective-verify.mjs";
import { loadBoard, selectTask } from "./render-task-prompt.mjs";
import { runMigrate as runMigrate30 } from "./migrate-3.0.mjs";
import { runMigrate as runMigrate40 } from "./migrate-4.0.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(__dirname, "..");
const cursorHome = resolve(process.env.CURSOR_HOME || join(homedir(), ".cursor"));
const versionInfo = JSON.parse(readFileSync(join(skillRoot, "version.json"), "utf8"));

const CURSOR_AGENT_MAP = {
  objective_scout: "objective-scout",
  objective_approval_gate: "objective-approval-gate",
  objective_worker: "objective-worker",
};

const REQUIRED_AGENTS = ["objective-scout.md", "objective-approval-gate.md", "objective-worker.md"];
const REQUIRED_COMMANDS = ["objective-prep.md", "objective.md", "objective-board.md"];
const REQUIRED_SCRIPTS = [
  "check-objective-state.mjs",
  "check-update.mjs",
  "parallel-plan.mjs",
  "render-task-prompt.mjs",
  "local-goal-board.mjs",
  "lib/objective-board.mjs",
  "lib/objective-state.mjs",
  "lib/objective-receipt.mjs",
  "lib/objective-completion.mjs",
  "lib/objective-stale.mjs",
  "lib/objective-hub.mjs",
  "lib/objective-session.mjs",
  "lib/objective-state-write.mjs",
  "lib/objective-verify.mjs",
  "lib/objective-misfire.mjs",
  "lib/objective-blocked.mjs",
  "lib/objective-subgoal.mjs",
  "run-mcp-server.mjs",
  "install-mcp.mjs",
  "install-cli-bin.mjs",
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
    case "resume":
      runResume();
      break;
    case "verify-receipt":
      runVerifyReceipt();
      break;
    case "blocked":
      runBlocked();
      break;
    case "misfire-audit":
      runMisfireAudit();
      break;
    case "subgoal-rollup":
      runSubgoalRollup();
      break;
    case "hub":
      runHub();
      break;
    case "migrate":
      runMigrateCommand();
      break;
    case "workspace":
      runWorkspace(args[1] || "register");
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
  console.log(`Cursor Curator for Cursor (port ${versionInfo.cursorPortVersion}, upstream ${versionInfo.upstreamVersion})

Usage:
  node curator.mjs [install] [--force]
  node curator.mjs reset
  node curator.mjs doctor [--objective-ready] [--json]
  node curator.mjs update [--json]
  node curator.mjs check-update [--json]
  node curator.mjs prompt <docs/objectives/slug> [--task T###] [--json]
  node curator.mjs parallel-plan <docs/objectives/slug> [--json]
  node curator.mjs receipt <file|json> [--role scout|approval_gate|worker] [--task T###] [--json]
  node curator.mjs completion-check <docs/objectives/slug> [--json]
  node curator.mjs resume <docs/objectives/slug> [--json]
  node curator.mjs verify-receipt <docs/objectives/slug> [--task T###] [--receipt-file ...] [--json]
  node curator.mjs blocked <docs/objectives/slug> [--json]
  node curator.mjs misfire-audit <docs/objectives/slug> [--json]
  node curator.mjs subgoal-rollup <docs/objectives/slug> [--json]
  node curator.mjs stale [--days 7] [--json]
  node curator.mjs hub [--json]
  node curator.mjs board <docs/objectives/slug> [--host <host>] [--port <port>] [--once] [--json]
  node curator.mjs migrate [--path docs/objectives/<slug>] [--dry-run]
  node curator.mjs workspace register [--json]

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

  const projectRoots = defaultProjectRootsFromSkill(skillRoot);
  const mcpResult = installMcpConfig({
    skillRoot,
    projectRoots,
    cursorHome,
    repoRoot: process.env.CURATOR_REPO_ROOT || projectRoots[0],
  });
  if (mcpResult.errors.length) {
    console.error(mcpResult.errors.join("\n"));
    process.exit(1);
  }

  const cliResult = installCliBin({ cursorHome, skillRoot });
  if (!cliResult.ok) {
    console.error(cliResult.error);
    process.exit(1);
  }

  console.log(`Cursor Curator install complete.`);
  console.log(`Skills: ${join(cursorHome, "skills", "cursor-curator")}`);
  console.log(`CLI: ${cliResult.cmdPath}`);
  console.log(`Agents: ${join(cursorHome, "agents")}`);
  console.log(`Commands: ${join(cursorHome, "commands")}`);
  for (const entry of mcpResult.installed) {
    console.log(`MCP: ${entry.configPath}`);
  }
  console.log(cliResult.pathHint);
  console.log(`Next: enable the cursor-curator MCP server in Cursor Settings → MCP, then /objective-prep and /objective.`);
  console.log(`User-level MCP (~/.cursor/mcp.json) works in every workspace; project .cursor/mcp.json is written for repos with docs/objectives/.`);
}

function runWorkspace(subcommand) {
  if (subcommand !== "register") {
    console.error("Usage: node curator.mjs workspace register [--json]");
    process.exit(2);
  }

  const workspaceRoot = resolve(process.cwd());
  const json = hasFlag("--json");
  const registered = registerKnownWorkspace(workspaceRoot);
  const mcp = ensureProjectMcpConfig(workspaceRoot, skillRoot);
  const payload = {
    ok: registered.ok && mcp.ok,
    workspace_root: workspaceRoot,
    registered,
    mcp,
  };

  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    if (registered.ok) {
      console.log(`Registered workspace: ${workspaceRoot}`);
    } else {
      console.error(`Could not register workspace: ${registered.reason}`);
    }
    if (mcp.ok) {
      console.log(`MCP config: ${mcp.configPath}`);
    } else if (mcp.reason) {
      console.error(`MCP config skipped: ${mcp.reason}`);
    }
  }

  if (!payload.ok) {
    process.exit(1);
  }
}

function runReset() {
  const { removed } = resetCursorSurfaces();
  console.log(`Reset removed ${removed.length} file(s). Skill payload kept at ${skillRoot}`);
}

async function runDoctor() {
  const goalReady = hasFlag("--objective-ready");
  const json = hasFlag("--json");
  const checks = [];
  const cwd = resolve(process.cwd());
  if (existsSync(join(cwd, "docs", "objectives"))) {
    registerKnownWorkspace(cwd);
    ensureProjectMcpConfig(cwd, skillRoot);
  }

  checks.push(nodeVersionCheck());
  checks.push(...requiredFilesCheck());
  checks.push(...installSurfacesCheck());
  checks.push(...mcpConfigCheck());
  checks.push(mcpSmokeCheck());
  if (goalReady) {
    checks.push(...agentFrontmatterCheck());
    checks.push(...legacyInstallCheck());
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
    if (!ok) console.error("\nDoctor found issues. Run: node curator.mjs install");
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
    "assets/curator-mark.png",
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
  const candidates = [
    join(process.cwd(), ".cursor", "mcp.json"),
    join(skillRoot, "..", ".cursor", "mcp.json"),
    join(cursorHome, "mcp.json"),
  ];
  const checks = candidates.map((configPath) => checkMcpConfig(configPath, skillRoot));
  const ok = checks.find((check) => check.ok);
  return ok ? [ok] : [checks[0]];
}

function mcpSmokeCheck() {
  try {
    const smoke = runMcpSmokeTest({
      workspaceRoot: getWorkspaceRoot(),
      objective: "sample-cursor-smoke",
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
    const ok = /^---\s*\nname:\s*objective-(scout|approval-gate|worker)/m.test(text);
    results.push({ name: `frontmatter:${file}`, ok, detail: ok ? "valid" : "invalid frontmatter" });
  }
  return results;
}

async function dnsCheck() {
  try {
    const records = await dns.lookup("curator.localhost");
    const ok = records.address === "127.0.0.1" || records.address === "::1";
    return { name: "dns:curator.localhost", ok, detail: records.address };
  } catch (error) {
    // Windows may not resolve *.localhost; board still works at http://127.0.0.1:41737/
    return {
      name: "dns:curator.localhost",
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
    console.log(JSON.stringify({ check: payload, skillRoot, note: "Vendored scripts live in ~/.cursor/skills/cursor-curator. Re-clone upstream or run npm pack curator to refresh." }, null, 2));
  } else {
    if (payload.update_available) {
      console.log(`npm curator ${payload.latest_version} available (installed port tracks ${versionInfo.upstreamVersion}).`);
      console.log("To refresh vendored files, re-run the port installer or copy from a fresh upstream clone.");
    } else {
      console.log(`Cursor Curator Cursor port is current with vendored upstream ${versionInfo.upstreamVersion}.`);
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
  const options = { objectiveRoot: "", boardPath: "", taskId: "", json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--task") options.taskId = argv[++i] || "";
    else if (arg.startsWith("--task=")) options.taskId = arg.slice(7);
    else if (arg === "--board") options.boardPath = argv[++i] || "";
    else if (arg.startsWith("--board=")) options.boardPath = arg.slice(8);
    else if (!arg.startsWith("-") && !options.objectiveRoot) options.objectiveRoot = resolve(arg);
  }
  if (!options.objectiveRoot && !options.boardPath) {
    throw new Error("Usage: curator prompt <goal-root> [--task T###] [--json]");
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
    "# Cursor Curator task handoff (Cursor)",
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
    console.error("Usage: curator receipt <file|json> [--role scout|approval_gate|worker] [--task T###] [--json]");
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

function runResume() {
  const json = hasFlag("--json");
  const statePath = resolveBoardStatePath();
  const objectiveDir = dirname(statePath);
  const result = buildResumeDigest(objectiveDir, statePath, {
    stale_days: Number(flagValue("--stale-days") || "7") || undefined,
  });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Resume: ${result.slug} · active ${result.active_task || "none"}`);
  if (result.session.preview) console.log(`Session: ${result.session.preview}`);
  if (result.stale_nudge) console.log(`Stale: ${result.stale_nudge}`);
  if (!result.validation.ok) {
    for (const error of result.validation.errors) console.error(`error: ${error}`);
  }
}

function runVerifyReceipt() {
  const json = hasFlag("--json");
  const statePath = resolveBoardStatePath();
  const board = loadBoard(statePath);
  const taskId = flagValue("--task") || board.document.active_task;
  const task = selectTask(board, taskId);
  const receiptFile = flagValue("--receipt-file");
  const positional = args.slice(1).filter((arg) => !arg.startsWith("-") && !["verify-receipt"].includes(arg));
  let receiptInput = receiptFile ? readFileSync(resolve(receiptFile), "utf8") : positional[1];
  if (!receiptInput) {
    console.error("Usage: curator verify-receipt <docs/objectives/slug> [--task T###] [--receipt-file path] [--json]");
    process.exit(2);
  }
  const parsed = parseReceiptFromText(receiptInput);
  if (!parsed) {
    console.error("Could not parse cursor_curator_receipt_v1 from input.");
    process.exit(1);
  }
  const validation = validateReceipt(parsed.envelope, { role: "worker", expectedTaskId: taskId });
  if (!validation.ok) {
    if (json) console.log(JSON.stringify(validation, null, 2));
    else for (const error of validation.errors) console.error(error);
    process.exit(1);
  }
  const result = verifyWorkerReceiptForTask({ id: task.id, verify: task.verify || [] }, validation.receipt);
  const payload = { state_path: statePath, task_id: taskId, ...result };
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(result.ok ? "Verification pass" : "Verification fail");
    for (const error of result.cross_check.errors) console.error(`- ${error}`);
    console.log("\nlast_verification YAML:\n" + result.last_verification_yaml);
  }
  process.exit(result.ok ? 0 : 1);
}

function runBlocked() {
  const json = hasFlag("--json");
  const statePath = resolveBoardStatePath();
  const payload = {
    state_path: statePath,
    blocked_tasks: listBlockedTasks(statePath),
    triage: buildBlockedTriagePlan(statePath),
  };
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (payload.blocked_tasks.length === 0) {
    console.log("No blocked tasks.");
    return;
  }
  for (const task of payload.blocked_tasks) {
    console.log(`${task.id} (${task.type}): ${task.stopped_because || task.receipt_summary || "blocked"}`);
  }
}

function runMisfireAudit() {
  const json = hasFlag("--json");
  const statePath = resolveBoardStatePath();
  const result = misfireAuditStatus(statePath);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(result.must_audit ? (result.due ? "Audit due" : "Audit not due") : "Misfire audit not required");
  console.log(result.recommendation);
}

function runSubgoalRollup() {
  const json = hasFlag("--json");
  const statePath = resolveBoardStatePath();
  const result = checkSubgoalRollup(statePath);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.pending_count === 0) {
    console.log("No pending subgoal rollups.");
    return;
  }
  for (const pending of result.pending_rollups) {
    console.log(`${pending.parent_task_id}: ${pending.reason} (${pending.subgoal_path})`);
  }
}

function runMigrateCommand() {
  const dryRun = hasFlag("--dry-run");
  const pathValue = flagValue("--path");
  const paths = pathValue ? [pathValue] : undefined;
  const roots = [process.cwd()];
  const result30 = runMigrate30({ dryRun, paths, roots });
  const result40 = runMigrate40({ dryRun, paths, roots });
  const merged = {
    dry_run: dryRun,
    migrated: (result30.migrated || 0) + (result40.migrated || 0),
    legacy_3_0: result30,
    structural_4_0: result40,
  };
  if (hasFlag("--json")) {
    console.log(JSON.stringify(merged, null, 2));
    return;
  }
  if (merged.migrated === 0) {
    console.log("No objective boards needed migration.");
    return;
  }
  for (const goal of result30.goals || []) {
    console.log(`${goal.objective_dir} (3.0):`);
    for (const change of goal.changes) console.log(`  - ${change}`);
  }
  for (const entry of result40.objectives || []) {
    if (entry.objective_dir) {
      console.log(`${entry.objective_dir} (4.0):`);
      for (const change of entry.changes) console.log(`  - ${change}`);
    } else if (entry.workspace_root) {
      console.log(`${entry.workspace_root} (4.0 workspace):`);
      for (const change of entry.changes) {
        if (typeof change === "string") console.log(`  - ${change}`);
        else if (change.objective_dir) {
          console.log(`  ${change.objective_dir}:`);
          for (const item of change.changes) console.log(`    - ${item}`);
        }
      }
    }
  }
  if (dryRun) console.log("\n(dry run — no files written)");
}

function legacyInstallCheck() {
  const legacySkill = join(cursorHome, "skills", "goalbuddy");
  const legacyCli = join(cursorHome, "bin", "goalbuddy");
  const legacyCliCmd = join(cursorHome, "bin", "goalbuddy.cmd");
  const legacyMcpPath = join(cursorHome, "mcp.json");
  const findings = [];
  if (existsSync(legacySkill)) findings.push(`remove legacy skill: ${legacySkill}`);
  if (existsSync(legacyCli) || existsSync(legacyCliCmd)) {
    findings.push(`remove legacy CLI: ${legacyCli} (and goalbuddy.cmd if present)`);
  }
  if (existsSync(legacyMcpPath)) {
    try {
      const config = JSON.parse(readFileSync(legacyMcpPath, "utf8"));
      if (config?.mcpServers?.goalbuddy) {
        findings.push("remove mcpServers.goalbuddy from ~/.cursor/mcp.json and enable cursor-curator");
      }
    } catch {
      /* ignore */
    }
  }
  return [{
    name: "legacy:goalbuddy",
    ok: true,
    detail: findings.length
      ? `cleanup recommended: ${findings.join("; ")}`
      : "no legacy GoalBuddy install artifacts detected",
  }];
}

function runHub() {
  const json = hasFlag("--json");
  const payload = buildHubPayload({ roots: [process.cwd()] });
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    for (const goal of payload.goals) {
      console.log(`${goal.title} [${goal.status}] active=${goal.active_task || "none"} success_criteria=${goal.success_criteria_health}`);
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
    console.error("Missing goal path: docs/objectives/<slug>");
    process.exit(2);
  }
  return resolve(goalArg);
}

function hasFlag(name) {
  return args.includes(name);
}
