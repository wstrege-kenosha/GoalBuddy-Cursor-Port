import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "bun:sqlite";
import { StateV3Schema, type StateV3 } from "../schema/state-v3.js";
import {
  assembleStateV3,
  checksFromRow,
  intakeFromRow,
  rulesFromRow,
  type ObjectiveAgentsRow,
  type ObjectiveChecksRow,
  type ObjectiveIntakeRow,
  type ObjectiveRow,
  type ObjectiveRulesRow,
  type ObjectiveSuccessCriteriaRow,
  type SubobjectiveLinkRow,
  type TaskListItemRow,
  type TaskRow,
} from "./state-mapper.mjs";
import {
  ensureWorkspace,
  logicalBoardPath,
} from "./connection.mjs";
import { objectiveRowByDirPath } from "./objective-lookup.mjs";
import { getDb, objectiveRowBySlug } from "./state-repository-db.mjs";
import { resolveChildObjectiveSlug } from "../subobjective/subobjective-resolve.mjs";
import type { ListedObjective, LoadedObjective } from "./state-repository-types.mjs";

export { resolveChildObjectiveSlug } from "../subobjective/subobjective-resolve.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function templateStatePath(): string {
  return join(packageRoot, "templates", "state.json");
}

export function fixturesRoot(): string {
  return join(packageRoot, "scripts", "test", "fixtures");
}

export function fixtureStateJsonPath(fixturePath: string): string {
  return join(fixturesRoot(), fixturePath, "state.json");
}

export function loadObjectiveTemplate(slug: string): StateV3 {
  const templatePath = templateStatePath();
  if (!existsSync(templatePath)) {
    throw new Error(`Template missing at ${templatePath}`);
  }
  const template = StateV3Schema.parse(JSON.parse(readFileSync(templatePath, "utf8")));
  template.objective.slug = slug;
  if (!template.objective.title || template.objective.title === "<Goal title>") {
    template.objective.title = slug;
  }
  return template;
}

function loadRelatedRows(db: ReturnType<typeof getDb>, objectiveId: number) {
  const intake = db
    .query<ObjectiveIntakeRow, [number]>(
      "SELECT * FROM objective_intake WHERE objective_id = ?",
    )
    .get(objectiveId);
  const successCriteria = db
    .query<ObjectiveSuccessCriteriaRow, [number]>(
      "SELECT signal, cadence, final_proof FROM objective_success_criteria WHERE objective_id = ?",
    )
    .get(objectiveId);
  if (!successCriteria) {
    throw new Error(`objective ${objectiveId} missing success_criteria row`);
  }
  const rules = db
    .query<ObjectiveRulesRow, [number]>(
      "SELECT * FROM objective_rules WHERE objective_id = ?",
    )
    .get(objectiveId);
  const agents = db
    .query<ObjectiveAgentsRow, [number]>(
      "SELECT scout, worker, approval_gate FROM objective_agents WHERE objective_id = ?",
    )
    .get(objectiveId);
  if (!agents) {
    throw new Error(`objective ${objectiveId} missing agents row`);
  }
  const visualBoard = db
    .query<{ payload_json: string | null }, [number]>(
      "SELECT payload_json FROM objective_visual_board WHERE objective_id = ?",
    )
    .get(objectiveId);
  const checks = db
    .query<ObjectiveChecksRow, [number]>(
      "SELECT dirty_fingerprint, last_verification_json FROM objective_checks WHERE objective_id = ?",
    )
    .get(objectiveId);
  const tasks = db
    .query<TaskRow, [number]>("SELECT * FROM tasks WHERE objective_id = ? ORDER BY sort_order")
    .all(objectiveId);
  const listItems = db
    .query<TaskListItemRow, [number]>(
      "SELECT * FROM task_list_items WHERE objective_id = ? ORDER BY list_name, position",
    )
    .all(objectiveId);
  const subobjectiveLinks = db
    .query<SubobjectiveLinkRow, [number]>(
      `SELECT l.*, c.slug AS child_slug, c.dir_path AS child_dir_path
       FROM subobjective_links l
       JOIN objectives c ON c.id = l.child_objective_id
       WHERE l.parent_objective_id = ?`,
    )
    .all(objectiveId);

  return {
    intake: intakeFromRow(intake ?? null),
    successCriteria,
    rules: rulesFromRow(rules ?? null),
    agents,
    visualBoard: visualBoard?.payload_json
      ? (JSON.parse(visualBoard.payload_json) as StateV3["visual_board"])
      : null,
    checks: checks ? checksFromRow(checks) : null,
    tasks,
    listItems,
    subobjectiveLinks,
  };
}

function buildLoadedObjective(
  workspaceRoot: string,
  objective: ObjectiveRow,
  state: StateV3,
): LoadedObjective {
  const root = resolve(workspaceRoot);
  return {
    workspaceRoot: root,
    slug: objective.slug,
    dirPath: objective.dir_path,
    objectiveId: objective.id,
    state,
    boardPath: logicalBoardPath(objective.slug),
  };
}

export function loadLoadedObjectiveInTransaction(
  db: Database,
  workspaceRoot: string,
  objectiveId: number,
): LoadedObjective {
  const objective = db
    .query<ObjectiveRow, [number]>("SELECT * FROM objectives WHERE id = ?")
    .get(objectiveId);
  if (!objective) {
    throw new Error(`Objective not found in database: id ${objectiveId}`);
  }
  const related = loadRelatedRows(db, objectiveId);
  const state = assembleStateV3({ objective, ...related });
  return buildLoadedObjective(workspaceRoot, objective, state);
}

export function loadStateV3(workspaceRoot: string, slug: string): LoadedObjective {
  const root = resolve(workspaceRoot);
  const db = getDb(root);
  const workspaceId = ensureWorkspace(db, root);
  const objective = objectiveRowBySlug(db, workspaceId, slug);
  if (!objective) {
    throw new Error(`Objective not found in database: ${slug}`);
  }
  return loadLoadedObjectiveInTransaction(db, root, objective.id);
}

export function listObjectives(workspaceRoot: string): ListedObjective[] {
  const root = resolve(workspaceRoot);
  const db = getDb(root);
  const workspaceId = ensureWorkspace(db, root);
  return db
    .query<ListedObjective, [number]>(
      `SELECT slug, dir_path AS dirPath, title, status, active_task_id AS activeTask, updated_at AS updatedAt
       FROM objectives WHERE workspace_id = ? ORDER BY slug`,
    )
    .all(workspaceId);
}

export function objectiveExistsInDb(workspaceRoot: string, slug: string): boolean {
  try {
    const root = resolve(workspaceRoot);
    const db = getDb(root);
    const workspaceId = ensureWorkspace(db, root);
    return objectiveRowBySlug(db, workspaceId, slug) != null;
  } catch {
    return false;
  }
}

export function findObjectiveSlugByDirPath(workspaceRoot: string, dirPath: string): string | null {
  const root = resolve(workspaceRoot);
  const db = getDb(root);
  const workspaceId = ensureWorkspace(db, root);
  return objectiveRowByDirPath(db, workspaceId, dirPath)?.slug ?? null;
}

export function parseStateJsonText(text: string): StateV3 {
  return StateV3Schema.parse(JSON.parse(text) as unknown);
}
