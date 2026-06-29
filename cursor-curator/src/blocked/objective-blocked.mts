import { loadState } from "../state/objective-state.mjs";
import { logicalBoardPath } from "../db/connection.mjs";
import { resolveWorkspaceForObjective } from "../mcp/path-utils.mjs";
import type { StateV3Task } from "../schema/state-v3.js";

export function listBlockedTasks(objectiveRef: string, workspaceRoot?: string) {
  const root = workspaceRoot ?? resolveWorkspaceForObjective(objectiveRef);
  const loaded = loadState(objectiveRef, root);
  return loaded.state.tasks
    .filter((task) => task.status === "blocked")
    .map((task) => summarizeBlockedTask(task));
}

export function buildBlockedTriagePlan(objectiveRef: string, workspaceRoot?: string) {
  const root = workspaceRoot ?? resolveWorkspaceForObjective(objectiveRef);
  const loaded = loadState(objectiveRef, root);
  const blocked = listBlockedTasks(objectiveRef, root);
  return {
    objective_slug: loaded.slug,
    board_path: loaded.boardPath,
    state_path: loaded.boardPath,
    blocked_count: blocked.length,
    blocked_tasks: blocked,
    triage_steps: blocked.map((task) => buildTriageStep(task)),
    approval_gate_objective_template:
      "Triage blocked task(s): read receipt blockers, decide smallest unblock path (owner input, credentials, smaller Worker slice, or defer). Do not advance active_task blindly.",
  };
}

function summarizeBlockedTask(task: StateV3Task) {
  const receipt = task.receipt && typeof task.receipt === "object"
    ? (task.receipt as Record<string, unknown>)
    : {};
  return {
    id: task.id,
    type: task.type,
    objective: task.objective,
    receipt_summary: typeof receipt.summary === "string" ? receipt.summary : null,
    stopped_because: typeof receipt.stopped_because === "string" ? receipt.stopped_because : null,
    remaining_blockers: Array.isArray(receipt.remaining_blockers)
      ? receipt.remaining_blockers.map(String)
      : [],
  };
}

function buildTriageStep(task: ReturnType<typeof summarizeBlockedTask>) {
  const blockers = task.remaining_blockers?.length
    ? task.remaining_blockers.join("; ")
    : task.stopped_because || task.receipt_summary || "unknown blocker";
  return {
    task_id: task.id,
    action: "spawn_approval_gate_triage",
    reason: blockers,
    suggestions: [
      "Spawn Approval Gate to convert blockers into PM credential/decision tasks or a smaller Worker slice.",
      "Keep active_task on the blocked task until triage records a receipt.",
      "If blockers are owner-only, queue a PM task to document required input without stopping other safe local work.",
    ],
  };
}
