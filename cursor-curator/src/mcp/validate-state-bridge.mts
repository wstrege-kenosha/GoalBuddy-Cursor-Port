import { resolve } from "node:path";
import { loadState, validateStateV3 } from "../state/objective-state.mjs";
import { logicalBoardPath, resolveDbPath } from "../db/connection.mjs";
import { resolveObjectiveDirectory, resolveObjectiveSlug } from "../state/objective-state.mjs";
import { resolveWorkspaceForObjective } from "./path-utils.mjs";

export interface ObjectiveValidationResult {
  ok: boolean;
  version: number | null;
  state_path: string;
  board_path: string;
  db_path: string;
  objective_slug: string | null;
  objective_dir: string | null;
  workspace_root: string;
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

export function validateObjectiveStateFile(
  objectiveRef: string,
  workspaceRoot?: string,
): ObjectiveValidationResult {
  if (workspaceRoot) {
    try {
      resolveObjectiveSlug(objectiveRef, resolve(workspaceRoot));
    } catch (error) {
      return {
        ok: false,
        version: null,
        state_path: objectiveRef,
        board_path: objectiveRef,
        db_path: resolveDbPath(resolve(workspaceRoot)),
        objective_slug: null,
        objective_dir: null,
        workspace_root: resolve(workspaceRoot),
        objective_status: null,
        active_task: null,
        agent_statuses: {},
        task_count: 0,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: [],
      };
    }
  }
  const root = workspaceRoot ? resolve(workspaceRoot) : resolveWorkspaceForObjective(objectiveRef);
  try {
    const loaded = loadState(objectiveRef, root);
    return {
      ok: loaded.validation.ok,
      version: loaded.validation.version,
      state_path: loaded.boardPath,
      board_path: loaded.boardPath,
      db_path: resolveDbPath(root),
      objective_slug: loaded.slug,
      objective_dir: loaded.objectiveDir,
      workspace_root: root,
      objective_status: loaded.validation.objective_status,
      active_task: loaded.validation.active_task,
      agent_statuses: agentStatusesFromState(loaded.raw),
      task_count: loaded.validation.task_count,
      errors: loaded.validation.errors,
      warnings: loaded.validation.warnings,
    };
  } catch (error) {
    let slug: string | null = null;
    try {
      slug = resolveObjectiveSlug(objectiveRef, root);
    } catch {
      slug = null;
    }
    return {
      ok: false,
      version: null,
      state_path: slug ? logicalBoardPath(slug) : objectiveRef,
      board_path: slug ? logicalBoardPath(slug) : objectiveRef,
      db_path: resolveDbPath(root),
      objective_slug: slug,
      objective_dir: slug ? resolveObjectiveDirectory(objectiveRef, root) : null,
      workspace_root: root,
      objective_status: null,
      active_task: null,
      agent_statuses: {},
      task_count: 0,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
    };
  }
}

export function validateObjectiveStateFromObject(
  state: Parameters<typeof validateStateV3>[0],
  context: { slug?: string; workspaceRoot?: string } = {},
) {
  const result = validateStateV3(state, context);
  return {
    ok: result.ok,
    errors: result.errors,
    warnings: result.warnings,
  };
}
