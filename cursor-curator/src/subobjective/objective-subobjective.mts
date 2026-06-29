import { basename } from "node:path";
import { loadState } from "../state/objective-state.mjs";
import { resolveWorkspaceForObjective } from "../mcp/path-utils.mjs";
import type { StateV3Task } from "../schema/state-v3.js";

export function checkSubobjectiveRollup(objectiveRef: string, workspaceRoot?: string) {
  const root = workspaceRoot ?? resolveWorkspaceForObjective(objectiveRef);
  const loaded = loadState(objectiveRef, root);
  const pending: Array<Record<string, unknown>> = [];

  for (const task of loaded.state.tasks) {
    if (!task.subobjective?.path) continue;
    const childSlug = basename(task.subobjective.path.replace(/\\/g, "/").replace(/\/state\.json$/, ""));
    let childLoaded;
    try {
      childLoaded = loadState(childSlug, root);
    } catch {
      pending.push({
        parent_task_id: task.id,
        subobjective_path: task.subobjective.path,
        reason: "missing_child_state",
        child_board_path: `db:${childSlug}`,
      });
      continue;
    }
    const rollup = task.subobjective.rollup_receipt;
    if (childLoaded.state.objective.status === "done" && (rollup == null || rollup === "")) {
      pending.push({
        parent_task_id: task.id,
        subobjective_path: task.subobjective.path,
        reason: "child_done_missing_rollup",
        child_board_path: childLoaded.boardPath,
        child_status: childLoaded.state.objective.status,
        suggested_rollup: buildRollupPatch(objectiveRef, task.id, root)?.rollup_receipt || null,
      });
    }
  }

  return {
    objective_slug: loaded.slug,
    board_path: loaded.boardPath,
    state_path: loaded.boardPath,
    pending_count: pending.length,
    pending_rollups: pending,
  };
}

export function buildRollupPatch(objectiveRef: string, taskId: string, workspaceRoot?: string) {
  const root = workspaceRoot ?? resolveWorkspaceForObjective(objectiveRef);
  const loaded = loadState(objectiveRef, root);
  const task = loaded.state.tasks.find((entry) => entry.id === taskId);
  if (!task?.subobjective?.path) {
    throw new Error(`Task ${taskId} has no subobjective.path`);
  }

  const childSlug = basename(task.subobjective.path.replace(/\\/g, "/").replace(/\/state\.json$/, ""));
  const childLoaded = loadState(childSlug, root);
  const childTitle = childLoaded.state.objective.title || childSlug;
  const childStatus = childLoaded.state.objective.status;
  const doneTasks = childLoaded.state.tasks.filter((entry) => entry.status === "done").length;
  const totalTasks = childLoaded.state.tasks.length;
  const finalAudit = findFinalAuditSummary(childLoaded.state.tasks);

  const rollup = [
    `Subobjective ${childTitle} (${task.subobjective.path}) status: ${childStatus || "unknown"}.`,
    `${doneTasks}/${totalTasks} child tasks done.`,
    finalAudit ? `Final audit: ${finalAudit}` : "Final audit: pending or not recorded.",
  ].join(" ");

  return {
    parent_task_id: taskId,
    subobjective_path: task.subobjective.path,
    child_board_path: childLoaded.boardPath,
    rollup_receipt: rollup,
    advance_hint: childStatus === "done"
      ? "PM may mark parent task done or advance active_task after recording rollup_receipt."
      : "Child objective is not done; wait for child completion before rollup.",
  };
}

function findFinalAuditSummary(tasks: StateV3Task[]): string | null {
  for (let index = tasks.length - 1; index >= 0; index -= 1) {
    const task = tasks[index];
    if (!["approval_gate", "pm"].includes(task.type) || task.status !== "done") continue;
    const receipt = task.receipt as Record<string, unknown> | null | undefined;
    if (!receipt) continue;
    if (receipt.decision === "complete" || receipt.full_outcome_complete === true) {
      return typeof receipt.summary === "string" ? receipt.summary : String(receipt.decision || "complete");
    }
  }
  return null;
}
