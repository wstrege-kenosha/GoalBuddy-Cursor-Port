import type { Database } from "bun:sqlite";
import { resolve } from "node:path";
import type { StateV3, StateV3Task } from "../schema/state-v3.js";
import { invalidateHubPayloadCache } from "../hub/objective-hub.mjs";
import {
  decomposeStateV3,
  type ObjectiveRow,
} from "./state-mapper.mjs";
import { normalizeStoredDirPath } from "./objective-lookup.mjs";
import { ensureWorkspace, withTransaction } from "./connection.mjs";
import { getDb, loadStateV3, objectiveRowBySlug } from "./state-repository-read.mjs";
import { replaceSubobjectiveLinks } from "./state-subobjective-links.mjs";
import { persistObjectivePatchInDb } from "./state-objective-patch.mjs";
import {
  insertObjectiveAgents,
  insertObjectiveChecks,
  insertObjectiveIntake,
  insertObjectiveRules,
  insertObjectiveSuccessCriteria,
  insertObjectiveVisualBoard,
} from "./objective-satellite-writes.mjs";
import type { LoadedObjective } from "./state-repository-types.mjs";

export { persistObjectivePatchInDb } from "./state-objective-patch.mjs";
export type { ObjectivePatchFields } from "./state-objective-patch.mjs";

type DecomposedState = ReturnType<typeof decomposeStateV3>;

export function clearTasksOnly(db: Database, objectiveId: number): void {
  db.query("DELETE FROM tasks WHERE objective_id = ?").run(objectiveId);
}

function clearObjectiveSatellitesOnly(db: Database, objectiveId: number): void {
  db.query("DELETE FROM objective_intake WHERE objective_id = ?").run(objectiveId);
  db.query("DELETE FROM objective_success_criteria WHERE objective_id = ?").run(objectiveId);
  db.query("DELETE FROM objective_rules WHERE objective_id = ?").run(objectiveId);
  db.query("DELETE FROM objective_agents WHERE objective_id = ?").run(objectiveId);
  db.query("DELETE FROM objective_visual_board WHERE objective_id = ?").run(objectiveId);
  db.query("DELETE FROM objective_checks WHERE objective_id = ?").run(objectiveId);
}

export function clearObjectiveDependents(db: Database, objectiveId: number): void {
  clearTasksOnly(db, objectiveId);
  clearObjectiveSatellitesOnly(db, objectiveId);
}

export function insertObjectiveSatellites(db: Database, objectiveId: number, parts: DecomposedState): void {
  if (parts.intake) {
    insertObjectiveIntake(db, objectiveId, parts.intake);
  }

  insertObjectiveSuccessCriteria(db, objectiveId, parts.successCriteria);

  if (parts.rules) {
    insertObjectiveRules(db, objectiveId, parts.rules);
  }

  insertObjectiveAgents(db, objectiveId, parts.agents);

  if (parts.visualBoard) {
    insertObjectiveVisualBoard(db, objectiveId, parts.visualBoard);
  }

  if (parts.checks) {
    insertObjectiveChecks(db, objectiveId, parts.checks);
  }
}

export function insertTasksAndListItems(db: Database, objectiveId: number, parts: DecomposedState): void {
  for (const task of parts.tasks) {
    db.query(
      `INSERT INTO tasks (
        objective_id, task_id, type, assignee, status, reasoning_hint, objective_text, receipt_json, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      objectiveId,
      task.task_id,
      task.type,
      task.assignee,
      task.status,
      task.reasoning_hint,
      task.objective_text,
      task.receipt_json,
      task.sort_order,
    );
  }

  for (const item of parts.listItems) {
    db.query(
      "INSERT INTO task_list_items (objective_id, task_id, list_name, position, value) VALUES (?, ?, ?, ?, ?)",
    ).run(objectiveId, item.task_id, item.list_name, item.position, item.value);
  }
}

function updateObjectiveHeader(db: Database, objectiveId: number, parts: DecomposedState): void {
  db.query(
    `UPDATE objectives SET
      slug = ?, dir_path = ?, dir_path_normalized = ?, parent_objective_id = ?, parent_task_id = ?,
      version = ?, title = ?, kind = ?, tranche = ?, status = ?, active_task_id = ?,
      first_milestone_complete = ?, updated_at = datetime('now')
    WHERE id = ?`,
  ).run(
    parts.objective.slug,
    parts.objective.dir_path,
    normalizeStoredDirPath(parts.objective.dir_path),
    parts.objective.parent_objective_id,
    parts.objective.parent_task_id,
    parts.objective.version,
    parts.objective.title,
    parts.objective.kind,
    parts.objective.tranche,
    parts.objective.status,
    parts.objective.active_task_id,
    parts.objective.first_milestone_complete,
    objectiveId,
  );
}

function writeObjectiveGraph(
  db: Database,
  workspaceId: number,
  state: StateV3,
  dirPath: string,
  parentObjectiveId: number | null,
  parentTaskId: string | null,
  existingObjectiveId?: number,
): number {
  // Full graph replace: import/register/saveStateV3 only. Runtime patches use surgical persist* helpers.
  const parts = decomposeStateV3(
    state,
    workspaceId,
    existingObjectiveId ?? 0,
    dirPath,
    parentObjectiveId,
    parentTaskId,
  );

  if (existingObjectiveId !== undefined) {
    clearObjectiveDependents(db, existingObjectiveId);
    updateObjectiveHeader(db, existingObjectiveId, parts);
    insertObjectiveSatellites(db, existingObjectiveId, parts);
    insertTasksAndListItems(db, existingObjectiveId, parts);
    return existingObjectiveId;
  }

  const objectiveResult = db
    .query(
      `INSERT INTO objectives (
        workspace_id, slug, dir_path, dir_path_normalized, parent_objective_id, parent_task_id,
        version, title, kind, tranche, status, active_task_id, first_milestone_complete, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      workspaceId,
      parts.objective.slug,
      parts.objective.dir_path,
      normalizeStoredDirPath(parts.objective.dir_path),
      parts.objective.parent_objective_id,
      parts.objective.parent_task_id,
      parts.objective.version,
      parts.objective.title,
      parts.objective.kind,
      parts.objective.tranche,
      parts.objective.status,
      parts.objective.active_task_id,
      parts.objective.first_milestone_complete,
    );
  const objectiveId = Number(objectiveResult.lastInsertRowid);
  insertObjectiveSatellites(db, objectiveId, parts);
  insertTasksAndListItems(db, objectiveId, parts);
  return objectiveId;
}

export function insertObjectiveGraph(
  db: Database,
  workspaceId: number,
  state: StateV3,
  dirPath: string,
  parentObjectiveId: number | null,
  parentTaskId: string | null,
  existingObjectiveId?: number,
): number {
  return writeObjectiveGraph(
    db,
    workspaceId,
    state,
    dirPath,
    parentObjectiveId,
    parentTaskId,
    existingObjectiveId,
  );
}

export function replaceObjectiveGraphInDb(
  db: Database,
  workspaceId: number,
  existing: ObjectiveRow,
  state: StateV3,
  dirPath: string,
): number {
  return writeObjectiveGraph(
    db,
    workspaceId,
    state,
    dirPath,
    existing.parent_objective_id,
    existing.parent_task_id,
    existing.id,
  );
}

export function persistReceiptState(db: Database, objectiveId: number, state: StateV3): void {
  db.query(
    "UPDATE objectives SET status = ?, active_task_id = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(state.objective.status, state.active_task, objectiveId);

  for (const task of state.tasks) {
    db.query(
      "UPDATE tasks SET status = ?, receipt_json = ? WHERE objective_id = ? AND task_id = ?",
    ).run(task.status, task.receipt ? JSON.stringify(task.receipt) : null, objectiveId, task.id);
  }

  if (state.checks?.last_verification !== undefined) {
    const checksRow = db
      .query<{ objective_id: number }, [number]>(
        "SELECT objective_id FROM objective_checks WHERE objective_id = ?",
      )
      .get(objectiveId);
    const verificationJson = JSON.stringify(state.checks.last_verification);
    if (checksRow) {
      db.query(
        "UPDATE objective_checks SET last_verification_json = ?, dirty_fingerprint = COALESCE(?, dirty_fingerprint) WHERE objective_id = ?",
      ).run(verificationJson, state.checks.dirty_fingerprint ?? null, objectiveId);
    } else {
      db.query(
        "INSERT INTO objective_checks (objective_id, dirty_fingerprint, last_verification_json) VALUES (?, ?, ?)",
      ).run(objectiveId, state.checks.dirty_fingerprint ?? null, verificationJson);
    }
  }
}

const TASK_LIST_NAMES = [
  "inputs",
  "constraints",
  "expected_output",
  "allowed_files",
  "verify",
  "stop_if",
] as const;

export function persistTaskPatchInDb(
  db: Database,
  objectiveId: number,
  task: StateV3Task,
  sortOrder: number,
): void {
  db.query(
    `UPDATE tasks SET type = ?, assignee = ?, status = ?, reasoning_hint = ?, objective_text = ?, receipt_json = ?, sort_order = ?
     WHERE objective_id = ? AND task_id = ?`,
  ).run(
    task.type,
    task.assignee,
    task.status,
    task.reasoning_hint ?? null,
    task.objective,
    task.receipt ? JSON.stringify(task.receipt) : null,
    sortOrder,
    objectiveId,
    task.id,
  );

  db.query("DELETE FROM task_list_items WHERE objective_id = ? AND task_id = ?").run(objectiveId, task.id);
  for (const listName of TASK_LIST_NAMES) {
    const values = task[listName];
    if (!Array.isArray(values)) continue;
    values.forEach((value, position) => {
      db.query(
        "INSERT INTO task_list_items (objective_id, task_id, list_name, position, value) VALUES (?, ?, ?, ?, ?)",
      ).run(objectiveId, task.id, listName, position, String(value));
    });
  }
}

export function replaceObjectiveStateV3(
  workspaceRoot: string,
  state: StateV3,
  options: { dirPath: string },
): LoadedObjective {
  const root = resolve(workspaceRoot);
  const db = getDb(root);
  const result = withTransaction(db, () => {
    const workspaceId = ensureWorkspace(db, root);
    const existing = objectiveRowBySlug(db, workspaceId, state.objective.slug);
    if (!existing) {
      throw new Error(`Objective not found in database: ${state.objective.slug}`);
    }
    const objectiveId = replaceObjectiveGraphInDb(db, workspaceId, existing, state, options.dirPath);
    replaceSubobjectiveLinks(db, workspaceId, root, objectiveId, state, options.dirPath);
    return loadStateV3(root, state.objective.slug);
  });
  invalidateHubPayloadCache();
  return result;
}
