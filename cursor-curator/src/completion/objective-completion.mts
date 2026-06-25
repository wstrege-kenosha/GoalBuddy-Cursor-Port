import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { isWeakProof, loadState } from "../state/objective-state.mjs";
import { validateObjectiveStateFile } from "../mcp/validate-state-bridge.mjs";
import { misfireAuditOverdueAtCompletion } from "../misfire/objective-misfire.mjs";
import type { StateV3Task } from "../schema/state-v3.js";

function receiptValue(receipt: StateV3Task["receipt"], key: string): unknown {
  if (!receipt || typeof receipt !== "object") return null;
  return (receipt as Record<string, unknown>)[key];
}

export function checkCompletionReadiness(statePath: string) {
  const resolved = resolve(statePath);
  const validation = validateObjectiveStateFile(resolved);
  const blockers = [...validation.errors];
  const warnings = [...validation.warnings];

  if (!existsSync(resolved)) {
    return {
      ready: false,
      validation_ok: false,
      success_criteria_ready: false,
      audit_ready: false,
      blockers,
      warnings,
      state_path: resolved,
      objective_root: dirname(resolved),
      objective_status: null,
    };
  }

  let state;
  try {
    state = loadState(resolved).state;
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : String(error));
    return {
      ready: false,
      validation_ok: false,
      success_criteria_ready: false,
      audit_ready: false,
      blockers,
      warnings,
      state_path: resolved,
      objective_root: dirname(resolved),
      objective_status: null,
    };
  }

  const goalStatus = state.objective.status;
  const successCriteriaSignal = state.objective.success_criteria?.signal;
  const successCriteriaFinalProof = state.objective.success_criteria?.final_proof;
  const completionProof = state.objective.intake?.completion_proof;
  const successCriteriaReady =
    !isWeakProof(successCriteriaSignal)
    && !isWeakProof(successCriteriaFinalProof)
    && !isWeakProof(completionProof);

  if (!successCriteriaReady) {
    blockers.push(
      "success criteria are not concrete enough for completion (signal, final_proof, or completion_proof is weak).",
    );
  }

  const unfinishedWorkers = state.tasks
    .filter((task) => task.type === "worker" && ["queued", "active"].includes(task.status))
    .map((task) => task.id);
  if (unfinishedWorkers.length > 0) {
    blockers.push(`queued or active Worker tasks remain: ${unfinishedWorkers.join(", ")}`);
  }

  const activeTasks = state.tasks.filter((task) => task.status === "active");
  if (activeTasks.length > 0) {
    blockers.push(`active tasks remain: ${activeTasks.map((task) => task.id).join(", ")}`);
  }

  const auditReady = state.tasks.some((task) => {
    if (!["approval_gate", "pm"].includes(task.type) || task.status !== "done") return false;
    const receiptResult = receiptValue(task.receipt, "result");
    const decision = receiptValue(task.receipt, "decision");
    const fullOutcome = receiptValue(task.receipt, "full_outcome_complete");
    return (
      receiptResult === "done"
      && (decision === "complete" || decision === "done")
      && fullOutcome === true
    );
  });

  if (!auditReady) {
    blockers.push(
      "missing final Approval Gate/PM audit with decision complete and full_outcome_complete: true",
    );
  }

  const misfireAudit = misfireAuditOverdueAtCompletion(resolved);
  if (misfireAudit.overdue) {
    blockers.push(`intake misfire audit overdue: ${misfireAudit.recommendation}`);
  }

  if (goalStatus === "done" && !validation.ok) {
    blockers.push("objective.status is done but state validation failed");
  }

  const ready =
    validation.ok
    && successCriteriaReady
    && auditReady
    && unfinishedWorkers.length === 0
    && activeTasks.length === 0;

  return {
    ready,
    validation_ok: validation.ok,
    success_criteria_ready: successCriteriaReady,
    audit_ready: auditReady,
    objective_status: goalStatus,
    blockers: [...new Set(blockers)],
    warnings,
    state_path: resolved,
    objective_root: dirname(resolved),
  };
}
