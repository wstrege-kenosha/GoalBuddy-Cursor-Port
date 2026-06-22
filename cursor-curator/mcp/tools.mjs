import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { checkCompletionReadiness } from "../scripts/lib/objective-completion.mjs";
import { buildBlockedTriagePlan, listBlockedTasks } from "../scripts/lib/objective-blocked.mjs";
import { buildHubPayload } from "../scripts/lib/objective-hub.mjs";
import { misfireAuditStatus } from "../scripts/lib/objective-misfire.mjs";
import { validateReceipt } from "../scripts/lib/objective-receipt.mjs";
import { buildResumeDigest, appendSessionNote } from "../scripts/lib/objective-session.mjs";
import { checkSubgoalRollup } from "../scripts/lib/objective-subgoal.mjs";
import { findStaleGoals } from "../scripts/lib/objective-stale.mjs";
import { validateGoalState } from "../scripts/lib/objective-state.mjs";
import { parseReceiptFromText } from "../scripts/lib/objective-state-write.mjs";
import { verifyWorkerReceiptForTask } from "../scripts/lib/objective-verify.mjs";
import { createParallelPlan } from "../scripts/parallel-plan.mjs";
import { loadBoard, renderTaskPrompt, selectTask } from "../scripts/render-task-prompt.mjs";
import { getWorkspaceRoot, resolveObjectiveDir, resolveObjectiveStatePath, collectWorkspaceCandidates, resolveWorkspaceForObjective } from "./path-utils.mjs";

function workspaceForArgs(args = {}) {
  if (args.workspace_root) {
    return resolve(String(args.workspace_root));
  }
  if (args.objective) {
    return resolveWorkspaceForObjective(args.objective);
  }
  return getWorkspaceRoot();
}

function objectiveRootsForList(args = {}) {
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

const CURSOR_AGENT_MAP = {
  objective_scout: "objective-scout",
  objective_approval_gate: "objective-approval-gate",
  objective_worker: "objective-worker",
};

export function toolListObjectives(args = {}) {
  const roots = objectiveRootsForList(args);
  const workspaceRoot = workspaceForArgs(args);
  const days = Number(args.stale_days) > 0 ? Number(args.stale_days) : 0;
  const payload = buildHubPayload({ roots });
  const stale = days > 0 ? findStaleGoals({ days, roots }) : null;
  const staleSlugs = new Set((stale?.goals || []).map((entry) => entry.slug));

  return {
    workspace_root: workspaceRoot,
    scanned_roots: roots,
    objective_count: payload.objective_count,
    objectives: payload.goals.map((entry) => ({
      slug: entry.slug,
      title: entry.title,
      status: entry.status,
      active_task: entry.active_task,
      active_task_type: entry.active_task_type,
      success_criteria_health: entry.success_criteria_health,
      validation_ok: entry.validation_ok,
      stale: staleSlugs.has(entry.slug),
      state_path: entry.state_path,
      url: entry.url,
    })),
    stale_report: stale,
  };
}

export function toolGetObjectiveState(args = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const statePath = resolveObjectiveStatePath(args.objective, workspaceRoot);
  const board = loadBoard(statePath);
  const validation = validateGoalState(statePath);

  return {
    workspace_root: workspaceRoot,
    state_path: statePath,
    objective_dir: dirname(statePath),
    slug: basename(dirname(statePath)),
    validation,
    objective: board.objective,
    rules: board.document.rules || {},
    checks: board.document.checks || {},
    agents: board.document.agents || {},
    active_task: board.document.active_task,
    tasks: board.document.tasks || [],
  };
}

export function toolGetActiveTask(args = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const statePath = resolveObjectiveStatePath(args.objective, workspaceRoot);
  const board = loadBoard(statePath);
  const validation = validateGoalState(statePath);
  const taskId = args.task_id || board.document.active_task;
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

export function toolValidateState(args = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const statePath = resolveObjectiveStatePath(args.objective, workspaceRoot);
  const result = validateGoalState(statePath);
  return {
    ...result,
    workspace_root: workspaceRoot,
    objective_root: dirname(statePath),
    slug: basename(dirname(statePath)),
  };
}

export function toolRenderTaskPrompt(args = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const statePath = resolveObjectiveStatePath(args.objective, workspaceRoot);
  const board = loadBoard(statePath);
  const taskId = args.task_id || board.document.active_task;
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

export function toolParallelPlan(args = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const goalDir = resolveObjectiveDir(args.objective, workspaceRoot);
  const plan = createParallelPlan({ objectiveRoot: goalDir, json: true });
  return {
    workspace_root: workspaceRoot,
    ...plan,
    candidates: (plan.candidates || []).map(mapParallelCandidate),
    spawn_plan: (plan.spawn_plan || []).map(mapSpawnPlanEntry),
  };
}

export function toolValidateReceipt(args = {}) {
  let input = args.receipt;
  if (args.receipt_file) {
    input = readFileSync(args.receipt_file, "utf8");
  }
  if (input === undefined || input === null) {
    throw new Error("receipt or receipt_file is required.");
  }
  return validateReceipt(input, {
    role: args.role,
    expectedTaskId: args.task_id,
  });
}

export function toolCompletionCheck(args = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const statePath = resolveObjectiveStatePath(args.objective, workspaceRoot);
  return {
    workspace_root: workspaceRoot,
    ...checkCompletionReadiness(statePath),
  };
}

export function toolAppendSessionNote(args = {}) {
  const workspaceRoot = workspaceForArgs(args);
  return appendSessionNote({
    workspaceRoot,
    summary: args.summary,
    task_id: args.task_id,
    objective_slug: args.objective_slug,
  });
}

export function toolSessionResumeDigest(args = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const statePath = resolveObjectiveStatePath(args.objective, workspaceRoot);
  const objectiveDir = dirname(statePath);
  return {
    workspace_root: workspaceRoot,
    ...buildResumeDigest(objectiveDir, statePath, {
      stale_days: args.stale_days,
      limit: args.limit,
    }),
  };
}

export function toolVerifyWorkerReceipt(args = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const statePath = resolveObjectiveStatePath(args.objective, workspaceRoot);
  const board = loadBoard(statePath);
  const taskId = args.task_id || board.document.active_task;
  const task = selectTask(board, taskId);
  if (String(task.type).toLowerCase() !== "worker") {
    throw new Error(`Task ${taskId} is not a Worker task.`);
  }

  let receiptInput = args.receipt;
  if (args.receipt_file) {
    receiptInput = readFileSync(args.receipt_file, "utf8");
  }
  const parsed = parseReceiptFromText(typeof receiptInput === "string" ? receiptInput : JSON.stringify(receiptInput));
  if (!parsed) {
    throw new Error("receipt or receipt_file is required with valid cursor_curator_receipt_v1 JSON.");
  }
  const validation = validateReceipt(parsed.envelope, { role: "worker", expectedTaskId: taskId });
  if (!validation.ok) {
    return {
      workspace_root: workspaceRoot,
      state_path: statePath,
      ok: false,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  const verification = verifyWorkerReceiptForTask(
    { id: task.id, verify: task.verify || [] },
    validation.receipt,
  );
  return {
    workspace_root: workspaceRoot,
    state_path: statePath,
    task_id: taskId,
    ...verification,
  };
}

export function toolBlockedTasks(args = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const statePath = resolveObjectiveStatePath(args.objective, workspaceRoot);
  const plan = args.triage ? buildBlockedTriagePlan(statePath) : null;
  return {
    workspace_root: workspaceRoot,
    state_path: statePath,
    blocked_tasks: listBlockedTasks(statePath),
    triage: plan,
  };
}

export function toolMisfireAuditCheck(args = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const statePath = resolveObjectiveStatePath(args.objective, workspaceRoot);
  return {
    workspace_root: workspaceRoot,
    ...misfireAuditStatus(statePath, {
      workers_between_audits: args.workers_between_audits,
    }),
  };
}

export function toolSubgoalRollupCheck(args = {}) {
  const workspaceRoot = workspaceForArgs(args);
  const statePath = resolveObjectiveStatePath(args.objective, workspaceRoot);
  return {
    workspace_root: workspaceRoot,
    ...checkSubgoalRollup(statePath),
  };
}

export function runMcpSmokeTest(options = {}) {
  const workspaceRoot = options.workspaceRoot || getWorkspaceRoot();
  const goal = options.objective || "sample-cursor-smoke";
  const statePath = resolveObjectiveStatePath(goal, workspaceRoot);
  const validation = validateGoalState(statePath);
  const prompt = toolRenderTaskPrompt({ objective: goal });
  const completion = checkCompletionReadiness(statePath);

  return {
    ok: validation.ok && Boolean(prompt?.metadata?.board_path),
    workspace_root: workspaceRoot,
    state_path: statePath,
    validation_ok: validation.ok,
    prompt_task_id: prompt?.task?.id || null,
    completion_ready: completion.ready,
    tools_exercised: ["validate_state", "render_task_prompt", "completion_check"],
  };
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

function mapParallelCandidate(candidate) {
  const mapped = CURSOR_AGENT_MAP[candidate.recommended_agent] || candidate.recommended_agent;
  return {
    ...candidate,
    recommended_agent: mapped,
    cursor_task_subagent_type: mapped,
  };
}

function mapSpawnPlanEntry(entry) {
  const mapped = entry.cursor_task_subagent_type ||
    CURSOR_AGENT_MAP[entry.recommended_agent] ||
    entry.recommended_agent;
  return {
    ...entry,
    cursor_task_subagent_type: mapped,
    task_prompt: entry.task_prompt ? mapCursorAgentsInPayload(entry.task_prompt) : entry.task_prompt,
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
  subgoal_rollup_check: toolSubgoalRollupCheck,
};
