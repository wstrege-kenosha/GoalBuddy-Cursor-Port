import type { Database } from "bun:sqlite";
import type { StateV3 } from "../schema/state-v3.js";
import { resolveChildObjectiveInWorkspace } from "../subobjective/subobjective-resolve.mjs";
import { objectiveRowBySlug } from "./state-repository-read.mjs";

export function insertSubobjectiveLinks(
  db: Database,
  workspaceId: number,
  workspaceRoot: string,
  objectiveId: number,
  state: StateV3,
  dirPath: string,
): void {
  for (const task of state.tasks) {
    if (!task.subobjective?.path) continue;
    const child = resolveChildObjectiveInWorkspace(workspaceRoot, dirPath, task.subobjective.path);
    if (!child) continue;
    const childRow = objectiveRowBySlug(db, workspaceId, child.slug);
    if (!childRow) continue;
    db.query(
      `INSERT INTO subobjective_links (
        parent_objective_id, parent_task_id, child_objective_id, status, depth, owner, created_from, rollup_receipt_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      objectiveId,
      task.id,
      childRow.id,
      task.subobjective.status,
      task.subobjective.depth ?? 1,
      task.subobjective.owner ?? null,
      task.subobjective.created_from ?? null,
      task.subobjective.rollup_receipt
        ? JSON.stringify(task.subobjective.rollup_receipt)
        : null,
    );
  }
}

export function replaceSubobjectiveLinks(
  db: Database,
  workspaceId: number,
  workspaceRoot: string,
  objectiveId: number,
  state: StateV3,
  dirPath: string,
): void {
  clearSubobjectiveLinks(db, objectiveId);
  insertSubobjectiveLinks(db, workspaceId, workspaceRoot, objectiveId, state, dirPath);
}

export function clearSubobjectiveLinks(db: Database, objectiveId: number): void {
  db.query("DELETE FROM subobjective_links WHERE parent_objective_id = ?").run(objectiveId);
}
