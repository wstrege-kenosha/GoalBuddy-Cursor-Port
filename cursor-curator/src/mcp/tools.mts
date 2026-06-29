import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { checkCompletionReadiness } from "../completion/objective-completion.mjs";
import { buildBlockedTriagePlan, listBlockedTasks } from "../blocked/objective-blocked.mjs";
import { buildHubPayload } from "../hub/objective-hub.mjs";
import { misfireAuditStatus } from "../misfire/objective-misfire.mjs";
import { validateReceipt } from "../receipt/objective-receipt.mjs";
import { buildResumeDigest, appendSessionNote } from "../session/objective-session.mjs";
import { checkSubobjectiveRollup } from "../subobjective/objective-subobjective.mjs";
import { findStaleObjectives } from "../stale/objective-stale.mjs";
import { parseReceiptFromText } from "../state/objective-state-write.mjs";
import { verifyWorkerReceiptForTask } from "../verify/objective-verify.mjs";
import { createParallelPlan } from "../prompt/parallel-plan.mjs";
import { loadBoard, renderTaskPrompt, selectTask } from "../prompt/render-task-prompt.mjs";
import { resolveDbPath } from "../db/connection.mjs";
import {
  applyReceipt,
  importLegacyObjectives,
  patchObjective,
  patchTask,
  registerObjective,
} from "../db/state-repository.mjs";
import { StateV3Schema } from "../schema/state-v3.js";
import {
  getWorkspaceRoot,
  resolveObjectiveDir,
  resolveObjectiveStatePath,
  collectWorkspaceCandidates,
  resolveWorkspaceForObjective,
} from "./path-utils.mjs";
import { validateObjectiveStateFile } from "./validate-state-bridge.mjs";

function workspaceForArgs(args: Record<string, unknown> = {}): string {
  if (args.workspace_root) {
    return resolve(String(args.workspace_root));
  }
  if (args.objective) {
    return resolveWorkspaceForObjective(String(args.objective));
  }
  return getWorkspaceRoot();
}

function objectiveRootsForList(args: Record<string, unknown> = {}): string[] {
  if (args.workspace_root) {
    return [resolve(String(args.workspace_root))];
  }
  const roots = collectWorkspaceCandidates().filter((root) => {
    try {
      return existsSync(join(root, "docs", "objectives"));
    } catch {
      return false;
    }
  });
  return roots.length ? roots : [getWorkspaceRoot()];
}

const CURSOR_AGENT_MAP: Record<string, string> = {
  objective_scout: "objective-scout",
  objective_approval_gate: "objective-approval-gate",
  objective_worker: "objective-worker",
};

export function toolListObjectives(args: Record<string, unknown> = {}) {
  const roots = objectiveRootsForList(args);
  const workspaceRoot = workspaceForArgs(args);
  const days = Number(args.stale_days) > 0 ? Number(args.stale_days) : 0;
  const payload = buildHubPayload({ roots });
  const stale = days > 0 ? findStaleObjectives({ days, roots }) : null;
  const staleSlugs = new Set((stale?.objectives || []).map((entry) => entry.slug).filter(Boolean));

  return {
    workspace_root: workspaceRoot,
    scanned_roots: roots,
    objective_count: payload.objective_count,
    objectives: payload.objectives.map((entry: Record<string, unknown>) => ({
      slug: entry.slug,
      title: entry.title,
      status: entry.status,
      active_task: entry.active_task,
      active_task_type: entry.active_task_type,
      success_criteria_health: entry.success_criteria_health,
      validation_ok: entry.validation_ok,
      stale: staleSlugs.has(entry.slug as string),
      state_path: entry.state_path,
      url: entry.url,
    })),
    stale_report: stale,
  };
}

export function toolGetObjectiveState(args: Record<string, unknown> = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const objective = String(args.objective);
  const statePath = resolveObjectiveStatePath(objective, workspaceRoot);
  const board = loadBoard(statePath, workspaceRoot);
  const validation = validateObjectiveStateFile(objective, workspaceRoot);

  return {
    workspace_root: workspaceRoot,
    state_path: statePath,
    board_path: statePath,
    db_path: resolveDbPath(workspaceRoot),
    objective_slug: validation.objective_slug,
    objective_dir: validation.objective_dir,
    validation,
    objective: board.objective,
    rules: board.document.rules || {},
    checks: board.document.checks || {},
    agents: board.document.agents || {},
    active_task: board.document.active_task,
    tasks: board.document.tasks || [],
  };
}

export function toolGetActiveTask(args: Record<string, unknown> = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const statePath = resolveObjectiveStatePath(String(args.objective), workspaceRoot);
  const board = loadBoard(statePath);
  const validation = validateObjectiveStateFile(statePath);
  const taskId = (args.task_id as string) || board.document.active_task;
  const task = selectTask(board, taskId);

  return {
    workspace_root: workspaceRoot,
    state_path: statePath,
    active_task: board.document.active_task,
    task: {
      id: task.id,
      type: task.type,
      status: task.status,
      objective: task.objective || "",
      assignee: task.assignee || null,
      allowed_files: task.allowed_files || [],
      verify: task.verify || [],
      stop_if: task.stop_if || [],
      receipt: task.receipt || null,
    },
    validation_ok: validation.ok,
    validation_errors: validation.errors,
  };
}

export function toolValidateState(args: Record<string, unknown> = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const objective = String(args.objective);
  const result = validateObjectiveStateFile(objective, workspaceRoot);
  return {
    ...result,
    workspace_root: workspaceRoot,
    objective_root: result.objective_dir,
    slug: result.objective_slug,
  };
}

export function toolRenderTaskPrompt(args: Record<string, unknown> = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const statePath = resolveObjectiveStatePath(String(args.objective), workspaceRoot);
  const board = loadBoard(statePath);
  const taskId = (args.task_id as string) || board.document.active_task;
  const result = renderTaskPrompt({
    boardPath: statePath,
    taskId,
    json: true,
  });
  return {
    workspace_root: workspaceRoot,
    ...mapCursorAgentsInPayload(result.payload),
  };
}

export function toolParallelPlan(args: Record<string, unknown> = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const objectiveDir = resolveObjectiveDir(String(args.objective), workspaceRoot);
  const plan = createParallelPlan({ objectiveRoot: objectiveDir, json: true });
  return {
    workspace_root: workspaceRoot,
    ...plan,
    candidates: (plan.candidates || []).map(mapParallelCandidate),
    spawn_plan: (plan.spawn_plan || []).map(mapSpawnPlanEntry),
  };
}

export function toolValidateReceipt(args: Record<string, unknown> = {}) {
  let input: unknown = args.receipt;
  if (args.receipt_file) {
    input = readFileSync(String(args.receipt_file), "utf8");
  }
  if (input === undefined || input === null) {
    throw new Error("receipt or receipt_file is required.");
  }
  return validateReceipt(input, {
    role: args.role as string | undefined,
    expectedTaskId: args.task_id as string | undefined,
  });
}

export function toolCompletionCheck(args: Record<string, unknown> = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const objective = String(args.objective);
  const result = checkCompletionReadiness(objective, workspaceRoot);
  const validation = validateObjectiveStateFile(objective, workspaceRoot);
  return {
    workspace_root: workspaceRoot,
    ...result,
    validation_ok: validation.ok,
    state_path: result.board_path,
    board_path: result.board_path,
    db_path: resolveDbPath(workspaceRoot),
  };
}

export function toolAppendSessionNote(args: Record<string, unknown> = {}): Record<string, unknown> {
  const workspaceRoot = workspaceForArgs(args);
  return appendSessionNote({
    workspaceRoot,
    summary: args.summary as string,
    task_id: args.task_id as string | undefined,
    objective_slug: args.objective_slug as string | undefined,
  });
}

export function toolSessionResumeDigest(args: Record<string, unknown> = {}): Record<string, unknown> {
  const workspaceRoot = workspaceForArgs(args);
  const objective = String(args.objective);
  const objectiveDir = resolveObjectiveDir(objective, workspaceRoot);
  const statePath = resolveObjectiveStatePath(objective, workspaceRoot);
  return {
    workspace_root: workspaceRoot,
    ...buildResumeDigest(objectiveDir, statePath, {
      stale_days: args.stale_days as number | undefined,
      limit: args.limit as number | undefined,
    }),
  };
}

export function toolVerifyWorkerReceipt(args: Record<string, unknown> = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const statePath = resolveObjectiveStatePath(String(args.objective), workspaceRoot);
  const board = loadBoard(statePath);
  const taskId = (args.task_id as string) || board.document.active_task;
  const task = selectTask(board, taskId);
  if (String(task.type).toLowerCase() !== "worker") {
    throw new Error(`Task ${taskId} is not a Worker task.`);
  }

  let receiptInput: unknown = args.receipt;
  if (args.receipt_file) {
    receiptInput = readFileSync(String(args.receipt_file), "utf8");
  }
  const parsed = parseReceiptFromText(
    typeof receiptInput === "string" ? receiptInput : JSON.stringify(receiptInput),
  );
  if (!parsed) {
    throw new Error("receipt or receipt_file is required with valid cursor_curator_receipt_v1 JSON.");
  }
  const validation = validateReceipt(parsed.envelope, { role: "worker", expectedTaskId: taskId });
  if (!validation.ok || !validation.receipt) {
    return {
      workspace_root: workspaceRoot,
      state_path: statePath,
      ok: false,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  const verification = verifyWorkerReceiptForTask(
    { id: task.id, verify: Array.isArray(task.verify) ? task.verify.map(String) : [] },
    validation.receipt,
  );
  return {
    workspace_root: workspaceRoot,
    state_path: statePath,
    task_id: taskId,
    ...verification,
  };
}

export function toolBlockedTasks(args: Record<string, unknown> = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const objective = String(args.objective);
  const blocked_tasks = listBlockedTasks(objective, workspaceRoot);
  const triage = args.triage ? buildBlockedTriagePlan(objective, workspaceRoot) : null;
  return {
    workspace_root: workspaceRoot,
    state_path: resolveObjectiveStatePath(objective, workspaceRoot),
    blocked_tasks,
    triage,
  };
}

export function toolApplyReceipt(args: Record<string, unknown> = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const objective = String(args.objective);
  let receiptInput: unknown = args.receipt;
  if (args.receipt_file) {
    receiptInput = readFileSync(String(args.receipt_file), "utf8");
  }
  if (typeof receiptInput === "string") {
    const parsed = parseReceiptFromText(receiptInput);
    receiptInput = parsed?.envelope ?? receiptInput;
  }
  return {
    workspace_root: workspaceRoot,
    ...applyReceipt(workspaceRoot, objective, receiptInput, {
      role: args.role as string | undefined,
      expectedTaskId: args.task_id as string | undefined,
      dryRun: args.dry_run === true,
    }),
    db_path: resolveDbPath(workspaceRoot),
  };
}

export function toolPatchTask(args: Record<string, unknown> = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const objective = String(args.objective);
  const taskId = String(args.task_id);
  const patch = (args.patch as Record<string, unknown>) || {};
  return {
    workspace_root: workspaceRoot,
    objective_slug: objective,
    task_id: taskId,
    ...patchTask(workspaceRoot, objective, taskId, patch as Parameters<typeof patchTask>[3], {
      dryRun: args.dry_run === true,
    }),
    db_path: resolveDbPath(workspaceRoot),
  };
}

export function toolPatchObjective(args: Record<string, unknown> = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const objective = String(args.objective);
  const patch = (args.patch as Record<string, unknown>) || {};
  return {
    workspace_root: workspaceRoot,
    objective_slug: objective,
    ...patchObjective(workspaceRoot, objective, patch as Parameters<typeof patchObjective>[2], {
      dryRun: args.dry_run === true,
    }),
    db_path: resolveDbPath(workspaceRoot),
  };
}

export function toolRegisterObjective(args: Record<string, unknown> = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const slug = String(args.objective);
  const state = args.state !== undefined
    ? StateV3Schema.parse(args.state)
    : undefined;
  const loaded = registerObjective(workspaceRoot, slug, state);
  const validation = validateObjectiveStateFile(slug, workspaceRoot);
  return {
    workspace_root: workspaceRoot,
    objective_slug: loaded.slug,
    board_path: loaded.boardPath,
    state_path: loaded.boardPath,
    db_path: resolveDbPath(workspaceRoot),
    objective_dir: loaded.dirPath,
    ok: validation.ok,
    errors: validation.errors,
    warnings: validation.warnings,
  };
}

export function toolDbImport(args: Record<string, unknown> = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const result = importLegacyObjectives(workspaceRoot, {
    slug: args.slug as string | undefined,
  });
  return {
    workspace_root: workspaceRoot,
    db_path: resolveDbPath(workspaceRoot),
    ...result,
  };
}

export function toolMisfireAuditCheck(args: Record<string, unknown> = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const objective = String(args.objective);
  return {
    workspace_root: workspaceRoot,
    ...misfireAuditStatus(objective, {
      workers_between_audits: args.workers_between_audits as number | undefined,
      workspaceRoot,
    }),
  };
}

export function toolSubobjectiveRollupCheck(args: Record<string, unknown> = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const objective = String(args.objective);
  return {
    workspace_root: workspaceRoot,
    ...checkSubobjectiveRollup(objective, workspaceRoot),
  };
}

export function runMcpSmokeTest(options: { workspaceRoot?: string; objective?: string } = {}) {
  const workspaceRoot = options.workspaceRoot || getWorkspaceRoot();
  const goal = options.objective || "sample-cursor-smoke";
  const statePath = resolveObjectiveStatePath(goal, workspaceRoot);
  const validation = validateObjectiveStateFile(goal, workspaceRoot);
  const prompt = toolRenderTaskPrompt({ objective: goal, workspace_root: workspaceRoot });
  const completion = checkCompletionReadiness(goal, workspaceRoot);

  return {
    ok: validation.ok && Boolean((prompt as { metadata?: { board_path?: string } })?.metadata?.board_path),
    workspace_root: workspaceRoot,
    state_path: statePath,
    validation_ok: validation.ok,
    prompt_task_id: (prompt as { task?: { id?: string } })?.task?.id || null,
    completion_ready: completion.ready,
    tools_exercised: ["validate_state", "render_task_prompt", "completion_check"],
  };
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

function mapParallelCandidate(candidate: Record<string, unknown>) {
  const agent = candidate.recommended_agent as string;
  const mapped = CURSOR_AGENT_MAP[agent] || agent;
  return {
    ...candidate,
    recommended_agent: mapped,
    cursor_task_subagent_type: mapped,
  };
}

function mapSpawnPlanEntry(entry: Record<string, unknown>) {
  const mapped =
    (entry.cursor_task_subagent_type as string) ||
    CURSOR_AGENT_MAP[entry.recommended_agent as string] ||
    (entry.recommended_agent as string);
  return {
    ...entry,
    cursor_task_subagent_type: mapped,
    task_prompt: entry.task_prompt
      ? mapCursorAgentsInPayload(entry.task_prompt as Record<string, unknown>)
      : entry.task_prompt,
  };
}

export const TOOL_HANDLERS = {
  list_objectives: toolListObjectives,
  get_objective_state: toolGetObjectiveState,
  get_active_task: toolGetActiveTask,
  validate_state: toolValidateState,
  render_task_prompt: toolRenderTaskPrompt,
  parallel_plan: toolParallelPlan,
  validate_receipt: toolValidateReceipt,
  completion_check: toolCompletionCheck,
  append_session_note: toolAppendSessionNote,
  session_resume_digest: toolSessionResumeDigest,
  verify_worker_receipt: toolVerifyWorkerReceipt,
  blocked_tasks: toolBlockedTasks,
  misfire_audit_check: toolMisfireAuditCheck,
  subobjective_rollup_check: toolSubobjectiveRollupCheck,
  apply_receipt: toolApplyReceipt,
  patch_task: toolPatchTask,
  patch_objective: toolPatchObjective,
  register_objective: toolRegisterObjective,
  db_import: toolDbImport,
};
