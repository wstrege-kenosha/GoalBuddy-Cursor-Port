import { loadState } from "../state/objective-state.mjs";

export interface ObjectiveValidationResult {
  ok: boolean;
  version: number | null;
  state_path: string;
  objective_status: string | null;
  active_task: string | null;
  agent_statuses: Record<string, string | null>;
  task_count: number;
  errors: string[];
  warnings: string[];
}

function agentStatusesFromState(raw: unknown): Record<string, string | null> {
  if (typeof raw !== "object" || raw === null || !("agents" in raw)) {
    return {};
  }
  const agents = (raw as { agents?: Record<string, unknown> }).agents;
  if (!agents || typeof agents !== "object") {
    return {};
  }
  return Object.fromEntries(
    ["scout", "worker", "approval_gate"].map((agent) => [
      agent,
      typeof agents[agent] === "string" ? agents[agent] : null,
    ]),
  );
}

export function validateObjectiveStateFile(statePath: string): ObjectiveValidationResult {
  try {
    const loaded = loadState(statePath);
    return {
      ok: loaded.validation.ok,
      version: loaded.validation.version,
      state_path: loaded.statePath,
      objective_status: loaded.validation.objective_status,
      active_task: loaded.validation.active_task,
      agent_statuses: agentStatusesFromState(loaded.raw),
      task_count: loaded.validation.task_count,
      errors: loaded.validation.errors,
      warnings: loaded.validation.warnings,
    };
  } catch (error) {
    return {
      ok: false,
      version: null,
      state_path: statePath,
      objective_status: null,
      active_task: null,
      agent_statuses: {},
      task_count: 0,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
    };
  }
}
