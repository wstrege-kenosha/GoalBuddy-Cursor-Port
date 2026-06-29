import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { renderTaskPrompt } from "../../prompt/render-task-prompt.mjs";
import { checkCompletionReadiness } from "../../completion/objective-completion.mjs";
import { buildBlockedTriagePlan, listBlockedTasks } from "../../blocked/objective-blocked.mjs";
import { buildHubPayload } from "../../hub/objective-hub.mjs";
import { misfireAuditStatus } from "../../misfire/objective-misfire.mjs";
import { validateReceipt } from "../../receipt/objective-receipt.mjs";
import { buildResumeDigest } from "../../session/objective-session.mjs";
import { checkSubobjectiveRollup } from "../../subobjective/objective-subobjective.mjs";
import { findStaleObjectives } from "../../stale/objective-stale.mjs";
import { parseReceiptFromText, applyReceiptToState } from "../../state/objective-state-write.mjs";
import { verifyWorkerReceiptForTask } from "../../verify/objective-verify.mjs";
import { validateObjectiveStateFile } from "../../mcp/validate-state-bridge.mjs";
import { loadBoard, selectTask } from "../../prompt/render-task-prompt.mjs";
import { createParallelPlan, formatPlan } from "../../prompt/parallel-plan.mjs";
import { registerObjective } from "../../db/state-repository.mjs";
import { resolveObjectiveDir, resolveObjectiveStatePath } from "../../mcp/path-utils.mjs";
import { resolveObjectiveSlug } from "../../state/objective-state.mjs";
import type { CuratorCliContext } from "../curator-context.mjs";

const CURSOR_AGENT_MAP: Record<string, string> = {
  objective_scout: "objective-scout",
  objective_approval_gate: "objective-approval-gate",
  objective_worker: "objective-worker",
};

export function runPrompt(ctx: CuratorCliContext): void {
  const promptArgs = mapCursorAgentNamesInArgs(ctx.args.slice(1));
  const result = renderTaskPrompt(parsePromptArgs(promptArgs));
  if (result.json) {
    const payload = mapCursorAgentsInPayload(result.payload);
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(formatCursorPrompt(result.payload));
  }
}

export function runParallelPlan(ctx: CuratorCliContext): void {
  const goal = ctx.positionalObjectivePath();
  const plan = createParallelPlan({ objectiveRoot: goal, json: ctx.hasFlag("--json") });
  if (ctx.hasFlag("--json")) {
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

export function runCompletionCheck(ctx: CuratorCliContext): void {
  const json = ctx.hasFlag("--json");
  const statePath = resolveBoardStatePath(ctx);
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

export function runCheckState(ctx: CuratorCliContext): void {
  const json = ctx.hasFlag("--json");
  const positional = ctx.args.slice(1).filter((arg) => !arg.startsWith("-") && arg !== "check-state" && arg !== "check-objective");
  const objectiveRef = positional[0] || ctx.positionalObjectivePath();
  const validation = validateObjectiveStateFile(objectiveRef, process.cwd());
  if (json) {
    console.log(JSON.stringify(validation, null, 2));
  } else if (validation.ok) {
    console.log(`State valid: ${validation.objective_slug} (${validation.board_path})`);
  } else {
    console.error(`State invalid: ${validation.objective_slug ?? objectiveRef}`);
    for (const error of validation.errors) console.error(`- ${error}`);
  }
  process.exit(validation.ok ? 0 : 1);
}

export function runApplyReceipt(ctx: CuratorCliContext): void {
  const json = ctx.hasFlag("--json");
  const dryRun = ctx.hasFlag("--dry-run");
  const role = ctx.flagValue("--role") || undefined;
  const taskId = ctx.flagValue("--task") || undefined;
  const receiptFile = ctx.flagValue("--receipt-file");
  const positional = ctx.args.slice(1).filter((arg) => !arg.startsWith("-") && arg !== "apply-receipt");
  const objectiveRef = positional[0];
  if (!objectiveRef) {
    console.error("Usage: bun dist/cli/curator.mjs apply-receipt <slug> [--receipt-file path] [--role worker] [--task T###] [--dry-run] [--json]");
    process.exit(2);
  }
  let receiptInput: unknown = receiptFile ? readFileSync(resolve(receiptFile), "utf8") : positional[1];
  if (!receiptInput) {
    console.error("Receipt JSON or --receipt-file is required.");
    process.exit(2);
  }
  if (typeof receiptInput === "string") {
    const parsed = parseReceiptFromText(receiptInput);
    receiptInput = parsed?.envelope ?? receiptInput;
  }
  const result = applyReceiptToState(objectiveRef, receiptInput, {
    role,
    expectedTaskId: taskId,
    dryRun,
    workspaceRoot: process.cwd(),
  });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log(`Receipt applied: ${result.objective_slug ?? objectiveRef}`);
  } else {
    for (const error of result.errors || []) console.error(error);
  }
  process.exit(result.ok ? 0 : 1);
}

export function runStale(ctx: CuratorCliContext): void {
  const json = ctx.hasFlag("--json");
  const days = Number(ctx.flagValue("--days") || "7");
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

export function runResume(ctx: CuratorCliContext): void {
  const json = ctx.hasFlag("--json");
  const objectiveRef = ctx.positionalObjectivePath();
  const workspaceRoot = process.cwd();
  const objectiveDir = resolveObjectiveDir(objectiveRef, workspaceRoot);
  const statePath = resolveObjectiveStatePath(objectiveRef, workspaceRoot);
  const result = buildResumeDigest(objectiveDir, statePath, {
    stale_days: Number(ctx.flagValue("--stale-days") || "7") || undefined,
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

export function runVerifyReceipt(ctx: CuratorCliContext): void {
  const json = ctx.hasFlag("--json");
  const statePath = resolveBoardStatePath(ctx);
  const board = loadBoard(statePath);
  const taskId = ctx.flagValue("--task") || board.document.active_task || "";
  const task = selectTask(board, taskId);
  const receiptFile = ctx.flagValue("--receipt-file");
  const positional = ctx.args.slice(1).filter((arg) => !arg.startsWith("-") && !["verify-receipt"].includes(arg));
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

export function runBlocked(ctx: CuratorCliContext): void {
  const json = ctx.hasFlag("--json");
  const statePath = resolveBoardStatePath(ctx);
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

export function runMisfireAudit(ctx: CuratorCliContext): void {
  const json = ctx.hasFlag("--json");
  const statePath = resolveBoardStatePath(ctx);
  const result = misfireAuditStatus(statePath);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(result.must_audit ? (result.due ? "Audit due" : "Audit not due") : "Misfire audit not required");
  console.log(result.recommendation);
}

export function runSubobjectiveRollup(ctx: CuratorCliContext): void {
  const json = ctx.hasFlag("--json");
  const statePath = resolveBoardStatePath(ctx);
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

export function runMigrateCommand(ctx: CuratorCliContext): void {
  const payload = {
    ok: false,
    error: "Legacy migrate (3.0/4.0/4.1) removed from CLI. Use scripts/migrate-5.0.mts at the repo root.",
  };
  if (ctx.hasFlag("--json")) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.error(payload.error);
  }
  process.exit(2);
}

export function runHub(ctx: CuratorCliContext): void {
  const json = ctx.hasFlag("--json");
  const payload = buildHubPayload({ roots: [process.cwd()] });
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    for (const objective of payload.objectives) {
      console.log(`${objective.title} [${objective.status}] active=${objective.active_task || "none"} success_criteria=${objective.success_criteria_health}`);
    }
  }
}

export function runRegisterObjective(ctx: CuratorCliContext): void {
  const json = ctx.hasFlag("--json");
  const workspaceRoot = process.cwd();
  const positional = ctx.args.slice(1).filter((arg) => !arg.startsWith("-"));
  const slug = positional[0];
  if (!slug) {
    console.error("Usage: bun dist/cli/curator.mjs register-objective <slug> [--json]");
    process.exit(2);
  }
  try {
    const loaded = registerObjective(workspaceRoot, slug);
    const validation = validateObjectiveStateFile(slug, workspaceRoot);
    const payload = {
      ok: validation.ok,
      objective_slug: loaded.slug,
      board_path: loaded.boardPath,
      state_path: loaded.boardPath,
      objective_dir: loaded.dirPath,
      db_path: join(workspaceRoot, ".cursor-curator", "curator.db"),
      errors: validation.errors,
      warnings: validation.warnings,
    };
    if (json) {
      console.log(JSON.stringify(payload, null, 2));
    } else if (validation.ok) {
      console.log(`Registered objective: ${loaded.slug} (${loaded.boardPath})`);
    } else {
      for (const error of validation.errors) console.error(error);
    }
    process.exit(validation.ok ? 0 : 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) {
      console.log(JSON.stringify({ ok: false, errors: [message] }, null, 2));
    } else {
      console.error(message);
    }
    process.exit(1);
  }
}

export function resolveBoardStatePath(ctx: CuratorCliContext): string {
  const goal = ctx.positionalObjectivePath();
  return resolveObjectiveSlug(goal, process.cwd());
}

export function completionCheckResult(objectiveRef: string) {
  const result = checkCompletionReadiness(objectiveRef, process.cwd());
  const validation = validateObjectiveStateFile(objectiveRef, process.cwd());
  return {
    ...result,
    validation_ok: validation.ok,
    state_path: result.board_path,
    board_path: result.board_path,
  };
}

export function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined).map(String) : [];
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
