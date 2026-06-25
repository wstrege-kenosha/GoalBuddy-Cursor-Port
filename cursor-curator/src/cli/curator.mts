import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { homedir } from "node:os";
import dns from "node:dns/promises";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { installCursorSurfaces, resetCursorSurfaces } from "../install/install-agents.mjs";
import {
  checkMcpConfig,
  defaultProjectRootsFromSkill,
  ensureProjectMcpConfig,
  installMcpConfig,
} from "../install/install-mcp.mjs";
import { installCliBin } from "../install/install-cli-bin.mjs";
import { getWorkspaceRoot, registerKnownWorkspace } from "../mcp/path-utils.mjs";
import { runMcpSmokeTest } from "../mcp/tools.mjs";
import { renderTaskPrompt } from "../prompt/render-task-prompt.mjs";
import { checkCompletionReadiness } from "../completion/objective-completion.mjs";
import { buildBlockedTriagePlan, listBlockedTasks } from "../blocked/objective-blocked.mjs";
import { buildHubPayload } from "../hub/objective-hub.mjs";
import { misfireAuditStatus } from "../misfire/objective-misfire.mjs";
import { validateReceipt } from "../receipt/objective-receipt.mjs";
import { buildResumeDigest } from "../session/objective-session.mjs";
import { checkSubobjectiveRollup } from "../subobjective/objective-subobjective.mjs";
import { findStaleObjectives } from "../stale/objective-stale.mjs";
import { parseReceiptFromText } from "../state/objective-state-write.mjs";
import { verifyWorkerReceiptForTask } from "../verify/objective-verify.mjs";
import { validateObjectiveStateFile } from "../mcp/validate-state-bridge.mjs";
import { loadBoard, selectTask } from "../prompt/render-task-prompt.mjs";
import { createParallelPlan, formatPlan } from "../prompt/parallel-plan.mjs";
import { buildUpdateReport, runCheckUpdate } from "./check-update.mjs";
import { main as boardMain } from "../board/local-objective-board.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(__dirname, "../..");
const cursorHome = resolve(process.env.CURSOR_HOME || join(homedir(), ".cursor"));
const versionInfo = JSON.parse(readFileSync(join(skillRoot, "version.json"), "utf8")) as {
  cursorPortVersion?: string;
  upstreamVersion?: string;
};

const CURSOR_AGENT_MAP: Record<string, string> = {
  objective_scout: "objective-scout",
  objective_approval_gate: "objective-approval-gate",
  objective_worker: "objective-worker",
};

const REQUIRED_AGENTS = ["objective-scout.md", "objective-approval-gate.md", "objective-worker.md"];
const REQUIRED_COMMANDS = ["objective-prep.md", "objective.md", "objective-board.md"];

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith("-") ? args[0] : "default";

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main(): Promise<void> {
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
      process.exit(runCheckUpdate(args.slice(1)));
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
    case "subobjective-rollup":
      runSubobjectiveRollup();
      break;
    case "hub":
      runHub();
      break;
    case "check-state":
      runCheckState();
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

function usage(): void {
  console.log(`Cursor Curator for Cursor (port ${versionInfo.cursorPortVersion}, upstream ${versionInfo.upstreamVersion})

Usage:
  node dist/cli/curator.mjs [install] [--force]
  curator [install] [--force]   (after install-cli-bin)
  node dist/cli/curator.mjs reset
  node dist/cli/curator.mjs doctor [--objective-ready] [--json]
  node dist/cli/curator.mjs update [--json]
  node dist/cli/curator.mjs check-update [--json]
  node dist/cli/curator.mjs prompt <docs/objectives/slug> [--task T###] [--json]
  node dist/cli/curator.mjs parallel-plan <docs/objectives/slug> [--json]
  node dist/cli/curator.mjs receipt <file|json> [--role scout|approval_gate|worker] [--task T###] [--json]
  node dist/cli/curator.mjs completion-check <docs/objectives/slug> [--json]
  node dist/cli/curator.mjs check-state <docs/objectives/slug|state.json> [--json]
  node dist/cli/curator.mjs resume <docs/objectives/slug> [--json]
  node dist/cli/curator.mjs verify-receipt <docs/objectives/slug> [--task T###] [--receipt-file ...] [--json]
  node dist/cli/curator.mjs blocked <docs/objectives/slug> [--json]
  node dist/cli/curator.mjs misfire-audit <docs/objectives/slug> [--json]
  node dist/cli/curator.mjs subobjective-rollup <docs/objectives/slug> [--json]
  node dist/cli/curator.mjs stale [--days 7] [--json]
  node dist/cli/curator.mjs hub [--json]
  node dist/cli/curator.mjs board <docs/objectives/slug> [--host <host>] [--port <port>] [--once] [--json]
  node dist/cli/curator.mjs migrate   (legacy removed — use scripts/migrate-5.0.mts at repo root)
  node dist/cli/curator.mjs workspace register [--json]

Skill root: ${skillRoot}
`);
}

function runInstall(): void {
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

  console.log("Cursor Curator install complete.");
  console.log(`Skills: ${join(cursorHome, "skills", "cursor-curator")}`);
  console.log(`CLI: ${cliResult.cmdPath}`);
  console.log(`Agents: ${join(cursorHome, "agents")}`);
  console.log(`Commands: ${join(cursorHome, "commands")}`);
  for (const entry of mcpResult.installed) {
    console.log(`MCP: ${entry.configPath}`);
  }
  console.log(cliResult.pathHint);
  console.log("Next: enable the cursor-curator MCP server in Cursor Settings → MCP, then /objective-prep and /objective.");
  console.log("User-level MCP (~/.cursor/mcp.json) works in every workspace; project .cursor/mcp.json is written for repos with docs/objectives/.");
}

function runWorkspace(subcommand: string): void {
  if (subcommand !== "register") {
    console.error("Usage: node dist/cli/curator.mjs workspace register [--json]");
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

function runReset(): void {
  const { removed } = resetCursorSurfaces();
  console.log(`Reset removed ${removed.length} file(s). Skill payload kept at ${skillRoot}`);
}

async function runDoctor(): Promise<void> {
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
    if (!ok) console.error("\nDoctor found issues. Run: node dist/cli/curator.mjs install");
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
    "dist/mcp/server.mjs",
    "dist/mcp/tools.mjs",
    "dist/mcp/path-utils.mjs",
    "dist/cli/curator.mjs",
    "dist/board/objective-board.mjs",
    "dist/board/board-theme.mjs",
    "dist/board/port-metadata.mjs",
    "dist/board/local-objective-board.mjs",
    "dist/install/install-agents.mjs",
    "dist/install/install-mcp.mjs",
    "dist/install/install-cli-bin.mjs",
    "dist/prompt/render-task-prompt.mjs",
    "dist/prompt/parallel-plan.mjs",
    "dist/cli/check-update.mjs",
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
    return { name: "mcp:smoke", ok: false, detail: error instanceof Error ? error.message : String(error) };
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
    const err = error as NodeJS.ErrnoException;
    return {
      name: "dns:curator.localhost",
      ok: true,
      detail: `${err.code || err.message}; use http://127.0.0.1:41737/<slug>/ if .localhost fails`,
    };
  }
}

function portCheck(): Promise<{ name: string; ok: boolean; detail: string }> {
  return new Promise((resolvePromise) => {
    const server = net.createServer();
    server.once("error", () => {
      resolvePromise({ name: "port:41737", ok: true, detail: "in use (board may already be running)" });
    });
    server.once("listening", () => {
      server.close(() => {
        resolvePromise({ name: "port:41737", ok: true, detail: "available" });
      });
    });
    server.listen(41737, "127.0.0.1");
  });
}

async function runUpdate(): Promise<void> {
  const payload = buildUpdateReport();
  if (hasFlag("--json")) {
    console.log(JSON.stringify({
      check: payload,
      skillRoot,
      note: "Vendored dist lives in ~/.cursor/skills/cursor-curator. Re-clone upstream or run npm pack curator to refresh.",
    }, null, 2));
  } else if (payload.update_available) {
    console.log(`npm curator ${payload.latest_version} available (installed port tracks ${versionInfo.upstreamVersion}).`);
    console.log("To refresh vendored files, re-run the port installer or copy from a fresh upstream clone.");
  } else {
    console.log(`Cursor Curator Cursor port is current with vendored upstream ${versionInfo.upstreamVersion}.`);
  }
}

function runPrompt(): void {
  const promptArgs = mapCursorAgentNamesInArgs(args.slice(1));
  const result = renderTaskPrompt(parsePromptArgs(promptArgs));
  if (result.json) {
    const payload = mapCursorAgentsInPayload(result.payload);
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(formatCursorPrompt(result.payload));
  }
}

function parsePromptArgs(argv: string[]) {
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

function mapCursorAgentsInPayload(payload: Record<string, unknown>) {
  const metadata = payload.metadata as Record<string, unknown>;
  const agent = metadata.recommended_agent as string;
  const mapped = CURSOR_AGENT_MAP[agent] || agent;
  return {
    ...payload,
    metadata: {
      ...metadata,
      recommended_agent: mapped,
      required_spawn_agent_type: mapped === "PM" ? null : mapped,
      cursor_task_subagent_type: mapped === "PM" ? null : mapped,
    },
  };
}

function formatCursorPrompt(payload: Record<string, unknown>): string {
  const m = payload.metadata as Record<string, unknown>;
  const t = payload.task as Record<string, unknown>;
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

function mapCursorAgentNamesInArgs(argv: string[]): string[] {
  return argv;
}

function runParallelPlan(): void {
  const goal = positionalObjectivePath();
  const plan = createParallelPlan({ objectiveRoot: goal, json: hasFlag("--json") });
  if (hasFlag("--json")) {
    const mapAgent = (r: Record<string, unknown>) => {
      const agent = r.recommended_agent as string;
      const mapped = CURSOR_AGENT_MAP[agent] || agent;
      return {
        ...r,
        recommended_agent: mapped,
        cursor_task_subagent_type: mapped,
      };
    };
    const data = {
      ...plan,
      candidates: plan.candidates.map(mapAgent),
      spawn_plan: plan.spawn_plan.map((entry) => ({
        ...entry,
        cursor_task_subagent_type: entry.cursor_task_subagent_type
          ? CURSOR_AGENT_MAP[String(entry.cursor_task_subagent_type).replace(/-/g, "_")] || entry.cursor_task_subagent_type
          : entry.cursor_task_subagent_type,
        task_prompt: entry.task_prompt ? mapCursorAgentsInPayload(entry.task_prompt as Record<string, unknown>) : entry.task_prompt,
      })),
    };
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(formatPlan(plan));
  }
}

async function runBoard(): Promise<void> {
  const goal = positionalObjectivePath();
  const boardArgv = [
    process.argv[0],
    "local-objective-board",
    "--objective",
    goal,
    ...args.slice(2).filter((a) => a !== "board"),
  ];
  const saved = process.argv;
  process.argv = boardArgv;
  try {
    await boardMain();
  } finally {
    process.argv = saved;
  }
}

function runReceiptValidate(): void {
  const json = hasFlag("--json");
  const role = flagValue("--role");
  const expectedTaskId = flagValue("--task");
  const positional = args.slice(1).filter((arg) => !arg.startsWith("-") && arg !== "receipt");
  const target = positional[0];
  if (!target) {
    console.error("Usage: curator receipt <file|json> [--role scout|approval_gate|worker] [--task T###] [--json]");
    process.exit(2);
  }

  let input: string = target;
  if (existsSync(resolve(target))) {
    input = readFileSync(resolve(target), "utf8");
  }

  const result = validateReceipt(input, { role, expectedTaskId });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok && result.receipt) {
    console.log(`Receipt valid for ${result.role} task ${result.receipt.task_id}.`);
    for (const warning of result.warnings) console.log(`warning: ${warning}`);
  } else {
    for (const error of result.errors) console.error(error);
    for (const warning of result.warnings) console.log(`warning: ${warning}`);
  }
  process.exit(result.ok ? 0 : 1);
}

function runCompletionCheck(): void {
  const json = hasFlag("--json");
  const statePath = resolveBoardStatePath();
  const result = completionCheckResult(statePath);
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

function runCheckState(): void {
  const json = hasFlag("--json");
  const pathValue = flagValue("--path");
  const positional = args.slice(1).filter((arg) => !arg.startsWith("-") && arg !== "check-state");
  let statePath = pathValue ? resolve(pathValue) : "";
  if (!statePath && positional[0]) {
    const resolved = resolve(positional[0]);
    statePath = basename(resolved).toLowerCase() === "state.json"
      ? resolved
      : join(resolved, "state.json");
  }
  if (!statePath) {
    try {
      statePath = resolveBoardStatePath();
    } catch {
      console.error("Usage: curator check-state <docs/objectives/slug|state.json> [--json]");
      process.exit(2);
    }
  }

  const validation = validateObjectiveStateFile(statePath);
  if (json) {
    console.log(JSON.stringify({ ...validation, state_path: statePath }, null, 2));
  } else if (validation.ok) {
    console.log(`State valid: ${statePath}`);
  } else {
    console.error(`State invalid: ${statePath}`);
    for (const error of validation.errors) console.error(`- ${error}`);
  }
  process.exit(validation.ok ? 0 : 1);
}

function runStale(): void {
  const json = hasFlag("--json");
  const days = Number(flagValue("--days") || "7");
  const result = findStaleObjectives({ days, roots: [process.cwd()] });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.objectives.length === 0) {
    console.log(`No stale objectives found (threshold: ${result.stale_days} days).`);
  } else {
    console.log(`Stale objectives (threshold: ${result.stale_days} days):`);
    for (const objective of result.objectives) {
      console.log(`- ${objective.slug}: ${objective.reasons.join("; ")}`);
      for (const suggestion of objective.suggestions) console.log(`  → ${suggestion}`);
    }
  }
  process.exit(0);
}

function runResume(): void {
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

function runVerifyReceipt(): void {
  const json = hasFlag("--json");
  const statePath = resolveBoardStatePath();
  const board = loadBoard(statePath);
  const taskId = flagValue("--task") || board.document.active_task || "";
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
  if (!validation.ok || !validation.receipt) {
    if (json) console.log(JSON.stringify(validation, null, 2));
    else for (const error of validation.errors) console.error(error);
    process.exit(1);
  }
  const result = verifyWorkerReceiptForTask(
    { id: task.id, verify: stringList(task.verify) },
    validation.receipt,
  );
  const payload = { state_path: statePath, task_id: taskId, ...result };
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(result.ok ? "Verification pass" : "Verification fail");
    for (const error of result.cross_check.errors) console.error(`- ${error}`);
    console.log("\nlast_verification:\n" + JSON.stringify(result.last_verification, null, 2));
  }
  process.exit(result.ok ? 0 : 1);
}

function runBlocked(): void {
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

function runMisfireAudit(): void {
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

function runSubobjectiveRollup(): void {
  const json = hasFlag("--json");
  const statePath = resolveBoardStatePath();
  const result = checkSubobjectiveRollup(statePath);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.pending_count === 0) {
    console.log("No pending subobjective rollups.");
    return;
  }
  for (const pending of result.pending_rollups) {
    console.log(`${pending.parent_task_id}: ${pending.reason} (${pending.subobjective_path})`);
  }
}

function runMigrateCommand(): void {
  const payload = {
    ok: false,
    error: "Legacy migrate (3.0/4.0/4.1) removed from CLI. Use scripts/migrate-5.0.mts at the repo root.",
  };
  if (hasFlag("--json")) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.error(payload.error);
  }
  process.exit(2);
}

function legacyInstallCheck() {
  const legacySkill = join(cursorHome, "skills", "goalbuddy");
  const legacyCli = join(cursorHome, "bin", "goalbuddy");
  const legacyCliCmd = join(cursorHome, "bin", "goalbuddy.cmd");
  const legacyMcpPath = join(cursorHome, "mcp.json");
  const findings: string[] = [];
  if (existsSync(legacySkill)) findings.push(`remove legacy skill: ${legacySkill}`);
  if (existsSync(legacyCli) || existsSync(legacyCliCmd)) {
    findings.push(`remove legacy CLI: ${legacyCli} (and goalbuddy.cmd if present)`);
  }
  if (existsSync(legacyMcpPath)) {
    try {
      const config = JSON.parse(readFileSync(legacyMcpPath, "utf8")) as { mcpServers?: Record<string, unknown> };
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
      : "no legacy goalbuddy-branded install artifacts detected",
  }];
}

function runHub(): void {
  const json = hasFlag("--json");
  const payload = buildHubPayload({ roots: [process.cwd()] });
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    for (const objective of payload.objectives) {
      console.log(`${objective.title} [${objective.status}] active=${objective.active_task || "none"} success_criteria=${objective.success_criteria_health}`);
    }
  }
}

function resolveBoardStatePath(): string {
  const goal = positionalObjectivePath();
  const resolved = resolve(goal);
  const base = basename(resolved).toLowerCase();
  if (base === "state.json") return resolved;
  return join(resolved, "state.json");
}

function flagValue(name: string): string {
  const index = args.indexOf(name);
  if (index === -1) return "";
  const inline = args[index].includes("=") ? args[index].split("=")[1] : "";
  return inline || args[index + 1] || "";
}

function positionalObjectivePath(): string {
  const skip = new Set(["--task", "--board", "--host", "--port", "--path", "--receipt-file", "--role", "--days", "--stale-days"]);
  const pos = args.slice(1).filter((a) => !a.startsWith("-") && !skip.has(a) && !a.startsWith("--task=") && !a.startsWith("--board="));
  const goalArg = pos[0];
  if (!goalArg) {
    console.error("Missing goal path: docs/objectives/<slug>");
    process.exit(2);
  }
  return resolve(goalArg);
}

function hasFlag(name: string): boolean {
  return args.includes(name);
}

function completionCheckResult(statePath: string) {
  const result = checkCompletionReadiness(statePath);
  const validation = validateObjectiveStateFile(statePath);
  return {
    ...result,
    validation_ok: validation.ok,
    state_path: statePath,
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined).map(String) : [];
}
