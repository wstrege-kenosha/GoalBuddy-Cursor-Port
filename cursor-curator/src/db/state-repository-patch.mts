import { resolve } from "node:path";
import type { StateV3, StateV3Task } from "../schema/state-v3.js";
import { validateStateV3 } from "../state/objective-state.mjs";
import { validateReceipt } from "../receipt/objective-receipt.mjs";
import { checkCompletionReadinessFromState } from "../completion/objective-completion.mjs";
import { verifyWorkerReceiptForTask } from "../verify/objective-verify.mjs";
import { ensureWorkspace, logicalBoardPath, withTransaction } from "./connection.mjs";
import { invalidateHubPayloadCache } from "../hub/objective-hub.mjs";
import {
  persistObjectivePatchInDb,
  persistReceiptState,
  persistTaskPatchInDb,
} from "./state-persist.mjs";
import type { ObjectivePatchFields } from "./state-objective-patch.mjs";
import {
  replaceSubobjectiveLinks,
} from "./state-subobjective-links.mjs";
import { getDb } from "./state-repository-read.mjs";
import { loadStateV3 } from "./state-repository-read.mjs";
import type { ApplyReceiptOptions, PatchTaskInput } from "./state-repository-types.mjs";

function pickNextActiveTaskId(
  state: StateV3,
  currentTaskId: string,
  receiptResult: string,
): string | null {
  if (receiptResult === "blocked") return currentTaskId;
  const ids = state.tasks.map((task) => task.id);
  const currentIndex = ids.indexOf(currentTaskId);
  if (currentIndex === -1) return null;
  for (let index = currentIndex + 1; index < state.tasks.length; index += 1) {
    const task = state.tasks[index];
    if (task.status === "queued") return task.id;
  }
  return null;
}

function isCompletionDecision(receipt: Record<string, unknown>): boolean {
  const decision = String(receipt.decision || "").toLowerCase();
  return decision === "complete" || receipt.full_outcome_complete === true;
}

function summarizeReceipt(receipt: Record<string, unknown>): StateV3Task["receipt"] {
  const summary: Record<string, unknown> = {
    result: receipt.result,
    summary: receipt.summary,
  };
  for (const key of [
    "decision",
    "note",
    "full_outcome_complete",
    "stopped_because",
    "commands",
    "evidence",
    "changed_files",
    "remaining_blockers",
  ]) {
    if (receipt[key] !== undefined) {
      summary[key] = receipt[key];
    }
  }
  return summary;
}

export function applyReceipt(
  workspaceRoot: string,
  slug: string,
  receiptEnvelope: unknown,
  options: ApplyReceiptOptions = {},
) {
  const validation = validateReceipt(receiptEnvelope, {
    role: options.role,
    expectedTaskId: options.expectedTaskId,
  });
  const boardPath = logicalBoardPath(slug);
  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors,
      warnings: validation.warnings,
      objective_slug: slug,
      board_path: boardPath,
    };
  }

  const receipt = validation.receipt as Record<string, unknown>;
  const loaded = loadStateV3(workspaceRoot, slug);
  const state = structuredClone(loaded.state) as StateV3;
  const taskId = String(receipt.task_id);
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    return {
      ok: false,
      errors: [`Task ${taskId} not found for objective ${slug}`],
      warnings: validation.warnings,
      objective_slug: slug,
      board_path: boardPath,
    };
  }

  const taskStatus = receipt.result === "blocked" ? "blocked" : "done";
  task.status = taskStatus;
  task.receipt = summarizeReceipt(receipt);

  let verification = null;
  if (options.role === "worker" && receipt.result === "done") {
    verification = verifyWorkerReceiptForTask(
      { id: task.id, verify: task.verify || [] },
      receipt,
    );
    state.checks = state.checks || {};
    state.checks.last_verification = verification.last_verification;
  }

  const nextActiveTask = pickNextActiveTaskId(state, taskId, String(receipt.result));
  const updates = {
    task_id: taskId,
    task_status: taskStatus,
    previous_active_task: state.active_task,
    next_active_task: nextActiveTask,
    objective_status: null as string | null,
  };

  if (receipt.result === "done") {
    if (nextActiveTask) {
      state.active_task = nextActiveTask;
      const nextTask = state.tasks.find((entry) => entry.id === nextActiveTask);
      if (nextTask) nextTask.status = "active";
    } else if (options.role === "approval_gate" && isCompletionDecision(receipt)) {
      const completion = checkCompletionReadinessFromState(state, {
        slug,
        workspaceRoot,
      });
      if (!completion.ready) {
        return {
          ok: false,
          errors: completion.blockers,
          warnings: [...validation.warnings, ...completion.warnings],
          objective_slug: slug,
          board_path: boardPath,
          completion_gate: completion,
        };
      }
      state.objective.status = "done";
      state.active_task = null;
      updates.objective_status = "done";
      updates.next_active_task = null;
    } else {
      state.active_task = null;
      updates.next_active_task = null;
    }
  }

  if (!options.dryRun) {
    const root = resolve(workspaceRoot);
    const db = getDb(root);
    withTransaction(db, () => {
      persistReceiptState(db, loaded.objectiveId, state);
    });
    invalidateHubPayloadCache();
  }

  const postValidation = validateStateV3(state, { slug });
  return {
    ok: postValidation.ok,
    errors: postValidation.errors,
    warnings: [...validation.warnings, ...postValidation.warnings],
    objective_slug: slug,
    board_path: boardPath,
    state_path: boardPath,
    receipt,
    role: validation.role,
    updates,
    verification,
    dry_run: options.dryRun === true,
  };
}

export function patchTask(
  workspaceRoot: string,
  slug: string,
  taskId: string,
  patch: PatchTaskInput,
  options: { dryRun?: boolean } = {},
) {
  const loaded = loadStateV3(workspaceRoot, slug);
  const state = structuredClone(loaded.state) as StateV3;
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    throw new Error(`Task ${taskId} not found for objective ${slug}`);
  }
  if (patch.status) task.status = patch.status as StateV3Task["status"];
  if (patch.allowed_files) task.allowed_files = patch.allowed_files;
  if (patch.verify) task.verify = patch.verify;
  if (patch.stop_if) task.stop_if = patch.stop_if;
  if (patch.inputs) task.inputs = patch.inputs;
  if (patch.constraints) task.constraints = patch.constraints;
  if (patch.expected_output) task.expected_output = patch.expected_output;
  if (patch.subobjective !== undefined) task.subobjective = patch.subobjective;
  if (!options.dryRun) {
    const root = resolve(workspaceRoot);
    const db = getDb(root);
    const sortOrder = state.tasks.findIndex((entry) => entry.id === taskId);
    withTransaction(db, () => {
      persistTaskPatchInDb(db, loaded.objectiveId, task, sortOrder);
      if (patch.subobjective !== undefined) {
        const workspaceId = ensureWorkspace(db, root);
        replaceSubobjectiveLinks(db, workspaceId, root, loaded.objectiveId, state, loaded.dirPath);
      }
    });
    invalidateHubPayloadCache();
  }
  const validation = validateStateV3(state, { slug });
  return { ok: validation.ok, errors: validation.errors, warnings: validation.warnings, state };
}

export function patchObjective(
  workspaceRoot: string,
  slug: string,
  patch: ObjectivePatchFields,
  options: { dryRun?: boolean } = {},
) {
  const loaded = loadStateV3(workspaceRoot, slug);
  const state = structuredClone(loaded.state) as StateV3;
  if (patch.objective) Object.assign(state.objective, patch.objective);
  if (patch.rules) state.rules = { ...state.rules, ...patch.rules };
  if (patch.agents) state.agents = { ...state.agents, ...patch.agents };
  if (patch.checks) state.checks = { ...state.checks, ...patch.checks };
  if (patch.visual_board) state.visual_board = patch.visual_board;
  if (patch.active_task !== undefined) state.active_task = patch.active_task;
  if (!options.dryRun) {
    const root = resolve(workspaceRoot);
    const db = getDb(root);
    withTransaction(db, () => {
      persistObjectivePatchInDb(db, loaded.objectiveId, state, patch);
    });
    invalidateHubPayloadCache();
  }
  const validation = validateStateV3(state, { slug });
  return { ok: validation.ok, errors: validation.errors, warnings: validation.warnings, state };
}
