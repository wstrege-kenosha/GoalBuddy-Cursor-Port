import { loadState } from "../state/objective-state.mjs";
import { resolveWorkspaceForObjective } from "../mcp/path-utils.mjs";
import { isWeakProof } from "../state/objective-state.mjs";
import type { StateV3Task } from "../schema/state-v3.js";

const DEFAULT_WORKERS_BETWEEN_AUDITS = 3;
const MISFIRE_MARKERS = ["misfire", "interpreted_outcome", "original_request", "wrong thing", "intake"];

export function misfireAuditStatus(
  objectiveRef: string,
  options: { workers_between_audits?: number; workspaceRoot?: string } = {},
) {
  const workspaceRoot = options.workspaceRoot ?? resolveWorkspaceForObjective(objectiveRef);
  const loaded = loadState(objectiveRef, workspaceRoot);
  const state = loaded.state;
  const threshold = Number(options.workers_between_audits) > 0
    ? Number(options.workers_between_audits)
    : DEFAULT_WORKERS_BETWEEN_AUDITS;

  const likelyMisfire = state.objective.intake?.likely_misfire ?? null;
  const interpretedOutcome = state.objective.intake?.interpreted_outcome ?? null;
  const originalRequest = state.objective.intake?.original_request ?? null;
  const mustAudit = state.rules?.intake_misfire_must_be_audited === true;

  const doneWorkersSinceAudit = countDoneWorkersSinceLastAudit(state.tasks);
  const lastAuditTaskId = findLastAuditTaskId(state.tasks);

  const due = mustAudit && (lastAuditTaskId === null || doneWorkersSinceAudit >= threshold);

  let recommendation = "No misfire audit required.";
  if (mustAudit && due) {
    recommendation = lastAuditTaskId === null
      ? "Queue an Approval Gate task to compare recent Worker receipts against objective.intake (likely_misfire, interpreted_outcome)."
      : `Queue an Approval Gate misfire audit — ${doneWorkersSinceAudit} Worker task(s) completed since ${lastAuditTaskId}.`;
  }

  return {
    must_audit: mustAudit,
    due,
    workers_since_audit: doneWorkersSinceAudit,
    workers_between_audits: threshold,
    last_audit_task_id: lastAuditTaskId,
    likely_misfire: likelyMisfire,
    interpreted_outcome: interpretedOutcome,
    original_request: originalRequest,
    weak_likely_misfire: isWeakProof(likelyMisfire),
    weak_interpreted_outcome: isWeakProof(interpretedOutcome),
    recommendation,
    objective_slug: loaded.slug,
    board_path: loaded.boardPath,
    state_path: loaded.boardPath,
  };
}

export function misfireAuditOverdueAtCompletion(
  objectiveRef: string,
  workspaceRoot?: string,
) {
  const status = misfireAuditStatus(objectiveRef, { workspaceRoot });
  if (!status.must_audit) return { overdue: false, ...status };
  return {
    ...status,
    overdue: status.due,
  };
}

function countDoneWorkersSinceLastAudit(tasks: StateV3Task[]): number {
  let workers = 0;
  for (let index = tasks.length - 1; index >= 0; index -= 1) {
    const task = tasks[index];
    if (isMisfireAuditReceipt(task)) break;
    if (task.type === "worker" && task.status === "done") workers += 1;
  }
  return workers;
}

function findLastAuditTaskId(tasks: StateV3Task[]): string | null {
  for (let index = tasks.length - 1; index >= 0; index -= 1) {
    if (isMisfireAuditReceipt(tasks[index])) return tasks[index].id;
  }
  return null;
}

function isMisfireAuditReceipt(task: StateV3Task): boolean {
  if (!task || task.status !== "done" || !["approval_gate", "pm"].includes(task.type || "")) return false;
  const blob = receiptBlob(task).toLowerCase();
  return MISFIRE_MARKERS.some((marker) => blob.includes(marker));
}

function receiptBlob(task: StateV3Task): string {
  const receipt = task.receipt;
  if (!receipt || typeof receipt !== "object") return "";
  const record = receipt as Record<string, unknown>;
  const evidence = Array.isArray(record.evidence) ? record.evidence.map(String) : [];
  return [record.summary, record.decision, ...evidence].filter(Boolean).join(" ");
}
