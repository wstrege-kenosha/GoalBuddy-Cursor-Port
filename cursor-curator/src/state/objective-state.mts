import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import {
  StateV3Schema,
  type StateV3,
  type StateV3Task,
} from "../schema/state-v3.js";
import { areAllowedFilesDisjoint } from "../prompt/allowed-files-overlap.mjs";

export type StateFileFormat = "json";

export interface LoadStateResult {
  statePath: string;
  format: StateFileFormat;
  deprecatedYaml: false;
  raw: unknown;
  state: StateV3;
  validation: ValidateStateV3Result;
}

export interface ValidateStateV3Result {
  ok: boolean;
  version: number | null;
  objective_status: string | null;
  active_task: string | null;
  task_count: number;
  errors: string[];
  warnings: string[];
}

const EXPECTED_ASSIGNEE: Record<StateV3Task["type"], StateV3Task["assignee"]> = {
  scout: "Scout",
  approval_gate: "Approval Gate",
  worker: "Worker",
  pm: "PM",
};

const YAML_DEPRECATED_MESSAGE =
  "state.yaml is deprecated; migrate to state.json with scripts/migrate-5.0.mts";

export function isWeakProof(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const normalized = String(value).trim().toLowerCase();
  return (
    normalized === ""
    || normalized === "unknown"
    || normalized === "tbd"
    || normalized === "todo"
    || normalized === "none"
    || /^<.*>$/.test(normalized)
  );
}

function receiptResult(receipt: StateV3Task["receipt"]): string | null {
  if (receipt == null || typeof receipt !== "object") return null;
  const value = (receipt as Record<string, unknown>).result;
  return typeof value === "string" ? value : null;
}

function hasReceipt(receipt: StateV3Task["receipt"]): boolean {
  return receipt != null;
}

function agentStatusWarning(agent: string, status: string): string {
  const agentLabel = agent[0].toUpperCase() + agent.slice(1);
  if (status === "bundled_not_installed") {
    return `agents.${agent} is bundled_not_installed; /objective can continue through PM fallback, but dedicated ${agentLabel} delegation is unavailable until installed. Run: node curator/scripts/curator.mjs install — then restart Cursor.`;
  }
  if (status === "missing") {
    return `agents.${agent} is missing; /objective can continue through PM fallback, but dedicated ${agentLabel} delegation is unavailable. Run: node curator/scripts/curator.mjs install`;
  }
  return `agents.${agent} is unknown; /objective can continue through PM fallback, but dedicated ${agentLabel} delegation was not verified. Run: node curator/scripts/curator.mjs doctor`;
}

function validateProofWarnings(state: StateV3, warnings: string[]): void {
  const goalPressureRequiresSuccessCriteria = state.rules?.goal_pressure_requires_success_criteria !== false;
  const intakeMisfireMustBeAudited = state.rules?.intake_misfire_must_be_audited === true;
  const successCriteriaSignal = state.objective.success_criteria?.signal;
  const successCriteriaFinalProof = state.objective.success_criteria?.final_proof;
  const completionProof = state.objective.intake?.completion_proof;
  const likelyMisfire = state.objective.intake?.likely_misfire;
  const interpretedOutcome = state.objective.intake?.interpreted_outcome;

  if (goalPressureRequiresSuccessCriteria) {
    if (isWeakProof(successCriteriaSignal)) {
      warnings.push(
        "objective.success_criteria.signal is missing or placeholder-like; weak success criteria make /objective finish too early.",
      );
    }
    if (isWeakProof(successCriteriaFinalProof)) {
      warnings.push(
        "objective.success_criteria.final_proof is missing or placeholder-like; final completion needs receipt-backed proof.",
      );
    }
  }

  if (isWeakProof(completionProof)) {
    warnings.push(
      "objective.intake.completion_proof is missing or placeholder-like; record the observable signal that proves the full original outcome.",
    );
  }

  if (intakeMisfireMustBeAudited) {
    if (isWeakProof(likelyMisfire)) {
      warnings.push(
        "rules.intake_misfire_must_be_audited is true but objective.intake.likely_misfire is missing or placeholder-like; record what the user likely wanted before Workers diverge.",
      );
    }
    if (isWeakProof(interpretedOutcome)) {
      warnings.push(
        "rules.intake_misfire_must_be_audited is true but objective.intake.interpreted_outcome is missing or placeholder-like; record how the PM interpreted the request.",
      );
    }
  }

  for (const agent of ["scout", "worker", "approval_gate"] as const) {
    const status = state.agents[agent];
    if (status !== "installed") {
      warnings.push(agentStatusWarning(agent, status));
    }
  }
}

function readMaxWriteWorkers(state: StateV3): number {
  const value = state.rules?.max_write_workers;
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
    return Math.floor(value);
  }
  return 1;
}

function readChildState(statePath: string, childRelativePath: string): StateV3 | null {
  const childStatePath = resolve(dirname(statePath), childRelativePath);
  if (!existsSync(childStatePath)) return null;
  try {
    const parsed = StateV3Schema.safeParse(JSON.parse(readFileSync(childStatePath, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function validateParallelWorkerWarnings(state: StateV3, statePath: string | undefined, warnings: string[]): void {
  if (!statePath) return;

  const maxWriteWorkers = readMaxWriteWorkers(state);

  for (const task of state.tasks) {
    if (task.type !== "worker" || task.status !== "active" || !task.subobjective?.path) continue;
    const childState = readChildState(statePath, task.subobjective.path);
    if (!childState) continue;

    const childWorker = childState.tasks.find((entry) => entry.type === "worker" && entry.status === "active");
    if (!childWorker) continue;

    const parentFiles = task.allowed_files || [];
    const childFiles = childWorker.allowed_files || [];

    if (maxWriteWorkers < 2) {
      warnings.push(
        `active parent Worker ${task.id} and active child Worker ${childWorker.id} are both live but rules.max_write_workers is ${maxWriteWorkers}; set max_write_workers to 2 for parallel Workers or serialize one board.`,
      );
    }

    if (
      parentFiles.length > 0
      && childFiles.length > 0
      && !areAllowedFilesDisjoint(parentFiles, childFiles)
    ) {
      warnings.push(
        `active parent Worker ${task.id} and active child Worker ${childWorker.id} have overlapping allowed_files; parallel_plan will not spawn both Workers until scopes are disjoint.`,
      );
    }
  }
}

function validateDoneCompletionRules(state: StateV3, errors: string[]): void {
  if (state.objective.status !== "done") return;

  const noCompletionOnWeakProof = state.rules?.no_completion_on_weak_proof !== false;
  const completionProof = state.objective.intake?.completion_proof;
  const successCriteriaSignal = state.objective.success_criteria?.signal;
  const successCriteriaFinalProof = state.objective.success_criteria?.final_proof;

  if (
    noCompletionOnWeakProof
    && (isWeakProof(completionProof) || isWeakProof(successCriteriaSignal) || isWeakProof(successCriteriaFinalProof))
  ) {
    errors.push(
      "done goals require concrete completion proof, objective.success_criteria.signal, and objective.success_criteria.final_proof; weak proof cannot close an objective",
    );
  }

  const finalAudit = state.tasks.some((task) => {
    if (!["approval_gate", "pm"].includes(task.type) || task.status !== "done") return false;
    if (!hasReceipt(task.receipt)) return false;
    const decision = receiptResult(task.receipt);
    return decision === "complete" || decision === "done";
  });
  if (!finalAudit) {
    errors.push("completion requires a final done Approval Gate or PM audit receipt with decision: complete");
  }

  if (state.rules?.continuous_until_full_outcome === true) {
    const finalFullOutcomeAudit = state.tasks.some((task) => {
      if (!["approval_gate", "pm"].includes(task.type) || task.status !== "done") return false;
      if (!hasReceipt(task.receipt) || typeof task.receipt !== "object") return false;
      const receipt = task.receipt as Record<string, unknown>;
      const decision = receipt.decision;
      return (decision === "complete" || decision === "done") && receipt.full_outcome_complete === true;
    });
    if (!finalFullOutcomeAudit) {
      errors.push(
        "continuous objectives require a final done Approval Gate or PM audit receipt with full_outcome_complete: true before objective.status: done",
      );
    }
  }
}

function validateTaskSemantics(state: StateV3, errors: string[]): void {
  const ids = new Set<string>();

  for (const task of state.tasks) {
    if (ids.has(task.id)) {
      errors.push(`duplicate task id: ${task.id}`);
    }
    ids.add(task.id);

    const expectedAssignee = EXPECTED_ASSIGNEE[task.type];
    if (task.assignee !== expectedAssignee) {
      errors.push(`task ${task.id} assignee must be ${expectedAssignee} for type ${task.type}`);
    }

    if (task.type === "worker" && task.status === "active") {
      if (!task.allowed_files || task.allowed_files.length === 0) {
        errors.push(`active Worker task ${task.id} must include allowed_files`);
      }
      if (!task.verify || task.verify.length === 0) {
        errors.push(`active Worker task ${task.id} must include verify`);
      }
      if (!task.stop_if || task.stop_if.length === 0) {
        errors.push(`active Worker task ${task.id} must include stop_if`);
      }
    }

    if (task.status === "done") {
      if (!hasReceipt(task.receipt)) {
        errors.push(`done task ${task.id} missing receipt`);
      } else if (receiptResult(task.receipt) !== "done") {
        errors.push(`done task ${task.id} receipt must include result: done`);
      }
    }

    if (task.status === "blocked" && !hasReceipt(task.receipt)) {
      errors.push(`blocked task ${task.id} missing receipt`);
    }
  }

  const activeTasks = state.tasks.filter((task) => task.status === "active");
  const goalStatus = state.objective.status;

  if (goalStatus === "done") {
    if (activeTasks.length !== 0) {
      errors.push("done objectives must not have an active task");
    }
    if (state.active_task !== null) {
      errors.push("done objectives must set active_task: null");
    }
    const unfinishedWorkers = state.tasks
      .filter((task) => task.type === "worker" && ["queued", "active"].includes(task.status))
      .map((task) => task.id);
    if (unfinishedWorkers.length > 0) {
      errors.push(
        `done objectives must not leave queued or active Worker tasks: ${unfinishedWorkers.join(", ")}`,
      );
    }
  } else if (goalStatus === "blocked") {
    if (activeTasks.length > 1) {
      errors.push("blocked objectives may have at most one active task");
    }
  } else if (activeTasks.length !== 1) {
    errors.push(
      `exactly one active task is required while objective.status is active; found ${activeTasks.length}`,
    );
  }

  if (activeTasks.length === 1 && state.active_task !== activeTasks[0].id) {
    errors.push(
      `active_task must point to active task ${activeTasks[0].id}; got ${state.active_task ?? "null"}`,
    );
  }

  if (state.active_task && !ids.has(state.active_task)) {
    errors.push(`active_task points to unknown task: ${state.active_task}`);
  }
}

export function resolveStatePath(input: string): string {
  const resolved = resolve(input);
  const base = basename(resolved).toLowerCase();

  if (base === "state.yaml" || base === "state.yml") {
    throw new Error(YAML_DEPRECATED_MESSAGE);
  }

  if (base === "state.json") {
    if (!existsSync(resolved)) {
      throw new Error(`state file not found: ${resolved}`);
    }
    return resolved;
  }

  const jsonPath = join(resolved, "state.json");
  if (existsSync(jsonPath)) {
    return jsonPath;
  }

  throw new Error(`No state.json found under ${resolved}`);
}

export function loadState(
  input: string,
  _options?: { warnYaml?: boolean },
): LoadStateResult {
  const statePath = resolveStatePath(input);
  const text = readFileSync(statePath, "utf8");
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(
      `invalid JSON in ${statePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const validation = validateStateV3(raw, { statePath });

  return {
    statePath,
    format: "json",
    deprecatedYaml: false,
    raw,
    state: raw as StateV3,
    validation,
  };
}

export { validateObjectiveStateFile as validateObjectiveState } from "../mcp/validate-state-bridge.mjs";

export function validateStateV3(input: unknown, context: { statePath?: string } = {}): ValidateStateV3Result {
  const errors: string[] = [];
  const warnings: string[] = [];

  const version =
    typeof input === "object" && input !== null && "version" in input
      ? (input as { version: unknown }).version
      : null;

  const parsed = StateV3Schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      version: typeof version === "number" ? version : null,
      objective_status: null,
      active_task: null,
      task_count: 0,
      errors: parsed.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "state";
        return `${path}: ${issue.message}`;
      }),
      warnings,
    };
  }

  const state = parsed.data;
  validateTaskSemantics(state, errors);
  validateProofWarnings(state, warnings);
  validateParallelWorkerWarnings(state, context.statePath, warnings);
  validateDoneCompletionRules(state, errors);

  return {
    ok: errors.length === 0,
    version: state.version,
    objective_status: state.objective.status,
    active_task: state.active_task,
    task_count: state.tasks.length,
    errors,
    warnings,
  };
}
