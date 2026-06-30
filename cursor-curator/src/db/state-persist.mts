import type { Database } from "bun:sqlite";
import type { StateV3, StateV3Task } from "../schema/state-v3.js";
import {
  decomposeStateV3,
  TASK_LIST_NAMES,
  type ObjectiveRow,
} from "./state-mapper.mjs";
import { normalizeStoredDirPath } from "./objective-lookup.mjs";
import {
  clearObjectiveSatellites,
  insertObjectiveAgents,
  insertObjectiveChecks,
  insertObjectiveIntake,
  insertObjectiveRules,
  insertObjectiveSuccessCriteria,
  insertObjectiveVisualBoard,
  upsertObjectiveChecks,
} from "./objective-satellite-writes.mjs";

type DecomposedState = ReturnType<typeof decomposeStateV3>;

export function clearTasksOnly(db: Database, objectiveId: number): void {
  db.query("DELETE FROM tasks WHERE objective_id = ?").run(objectiveId);
}

export function clearObjectiveDependents(db: Database, objectiveId: number): void {
  clearTasksOnly(db, objectiveId);
  clearObjectiveSatellites(db, objectiveId);
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
    upsertObjectiveChecks(db, objectiveId, state.checks, { preserveDirtyFingerprintWhenNull: true });
  }
}

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
