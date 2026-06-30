import type { Database } from "bun:sqlite";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StateV3Schema, type StateV3, type StateV3Task } from "../schema/state-v3.js";
import { validateStateV3 } from "../state/objective-state.mjs";
import { validateReceipt } from "../receipt/objective-receipt.mjs";
import { checkCompletionReadinessFromState } from "../completion/objective-completion.mjs";
import { verifyWorkerReceiptForTask } from "../verify/objective-verify.mjs";
import {
  ensureWorkspace,
  logicalBoardPath,
  openDatabase,
  withTransaction,
} from "./connection.mjs";
import {
  assembleStateV3,
  decomposeStateV3,
  intakeFromRow,
  intakeRowFromDecomposed,
  rulesFromRow,
  rulesRowFromDecomposed,
  type ObjectiveRow,
  type SubobjectiveLinkRow,
  type TaskListItemRow,
  type TaskRow,
} from "./state-mapper.mjs";
import { invalidateHubPayloadCache } from "../hub/objective-hub.mjs";
import { objectiveRowByDirPath } from "./objective-lookup.mjs";

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

export function importObjectiveFixture(
  workspaceRoot: string,
  fixturePath: string,
  options: { dirPath?: string } = {},
): LoadedObjective {
  const fixtureDir = join(fixturesRoot(), fixturePath);
  const jsonPath = fixtureStateJsonPath(fixturePath);
  if (!existsSync(jsonPath)) {
    throw new Error(`Fixture state.json not found: ${jsonPath}`);
  }
  const parsed = StateV3Schema.parse(JSON.parse(readFileSync(jsonPath, "utf8")) as unknown);
  const dirPath =
    options.dirPath
    ?? join(resolve(workspaceRoot), "docs", "objectives", parsed.objective.slug);
  importSubobjectivesFromFixtureTree(workspaceRoot, fixtureDir, dirPath);
  return importStateJsonFile(workspaceRoot, jsonPath, { dirPath });
}

function importSubobjectivesFromDir(workspaceRoot: string, objectiveDir: string): void {
  const subRoot = join(objectiveDir, "subobjectives");
  if (!existsSync(subRoot)) {
    return;
  }
  for (const entry of readdirSync(subRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const childDir = join(subRoot, entry.name);
    const childJson = join(childDir, "state.json");
    if (!existsSync(childJson)) {
      continue;
    }
    const childParsed = StateV3Schema.parse(JSON.parse(readFileSync(childJson, "utf8")) as unknown);
    const childSlug = childParsed.objective.slug;
    if (!objectiveExistsInDb(workspaceRoot, childSlug)) {
      importStateJsonFile(workspaceRoot, childJson, { dirPath: childDir });
    }
  }
}

function importSubobjectivesFromFixtureTree(
  workspaceRoot: string,
  fixtureDir: string,
  objectiveDir: string,
): void {
  const subRoot = join(fixtureDir, "subobjectives");
  if (!existsSync(subRoot)) {
    return;
  }
  for (const entry of readdirSync(subRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const childFixtureDir = join(subRoot, entry.name);
    const childJson = join(childFixtureDir, "state.json");
    if (!existsSync(childJson)) {
      continue;
    }
    const childParsed = StateV3Schema.parse(JSON.parse(readFileSync(childJson, "utf8")) as unknown);
    const childSlug = childParsed.objective.slug;
    if (!objectiveExistsInDb(workspaceRoot, childSlug)) {
      importStateJsonFile(workspaceRoot, childJson, {
        dirPath: join(objectiveDir, "subobjectives", entry.name),
      });
    }
  }
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

export interface LoadedObjective {
  workspaceRoot: string;
  slug: string;
  dirPath: string;
  objectiveId: number;
  state: StateV3;
  boardPath: string;
}

export interface ListedObjective {
  slug: string;
  dirPath: string;
  title: string;
  status: string;
  activeTask: string | null;
  updatedAt: string | null;
}

export interface ApplyReceiptOptions {
  role?: string;
  expectedTaskId?: string;
  dryRun?: boolean;
}

export interface PatchTaskInput {
  status?: string;
  allowed_files?: string[];
  verify?: string[];
  stop_if?: string[];
  inputs?: string[];
  constraints?: string[];
  expected_output?: string[];
  subobjective?: StateV3Task["subobjective"];
}

function getDb(workspaceRoot: string, memory = false): Database {
  return openDatabase(workspaceRoot, { memory });
}

function objectiveRowBySlug(db: Database, workspaceId: number, slug: string): ObjectiveRow | null {
  return (
    db
      .query<ObjectiveRow, [number, string]>(
        "SELECT * FROM objectives WHERE workspace_id = ? AND slug = ?",
      )
      .get(workspaceId, slug) ?? null
  );
}

export function findObjectiveSlugByDirPath(workspaceRoot: string, dirPath: string): string | null {
  const root = resolve(workspaceRoot);
  const db = getDb(root);
  const workspaceId = ensureWorkspace(db, root);
  return objectiveRowByDirPath(db, workspaceId, dirPath)?.slug ?? null;
}

export function resolveChildObjectiveSlug(
  workspaceRoot: string,
  parentDirPath: string,
  subPath: string,
): string | null {
  const root = resolve(workspaceRoot);
  const normalized = subPath.replace(/\\/g, "/");
  const absolute = resolve(parentDirPath, normalized.replace(/\/state\.json$/, ""));
  const db = getDb(root);
  const workspaceId = ensureWorkspace(db, root);
  const byDir = objectiveRowByDirPath(db, workspaceId, absolute);
  if (byDir) {
    return byDir.slug;
  }
  const fallbackSlug = basename(absolute);
  return objectiveRowBySlug(db, workspaceId, fallbackSlug)?.slug ?? null;
}

function loadRelatedRows(db: Database, objectiveId: number) {
  const intake = db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM objective_intake WHERE objective_id = ?",
    )
    .get(objectiveId);
  const successCriteria = db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM objective_success_criteria WHERE objective_id = ?",
    )
    .get(objectiveId);
  if (!successCriteria) {
    throw new Error(`objective ${objectiveId} missing success_criteria row`);
  }
  const rules = db
    .query<Record<string, unknown>, [number]>(
      "SELECT * FROM objective_rules WHERE objective_id = ?",
    )
    .get(objectiveId);
  const agents = db
    .query<Record<string, string>, [number]>(
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
    .query<Record<string, unknown>, [number]>(
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
      ? (JSON.parse(visualBoard.payload_json) as Record<string, unknown>)
      : null,
    checks: checks
      ? {
          ...(checks.dirty_fingerprint ? { dirty_fingerprint: checks.dirty_fingerprint } : {}),
          ...(checks.last_verification_json
            ? { last_verification: JSON.parse(checks.last_verification_json as string) }
            : {}),
        }
      : null,
    tasks,
    listItems,
    subobjectiveLinks,
  };
}

export function loadStateV3(workspaceRoot: string, slug: string): LoadedObjective {
  const root = resolve(workspaceRoot);
  const db = getDb(root);
  const workspaceId = ensureWorkspace(db, root);
  const objective = objectiveRowBySlug(db, workspaceId, slug);
  if (!objective) {
    throw new Error(`Objective not found in database: ${slug}`);
  }
  const related = loadRelatedRows(db, objective.id);
  const state = assembleStateV3({ objective, ...related });
  return {
    workspaceRoot: root,
    slug,
    dirPath: objective.dir_path,
    objectiveId: objective.id,
    state,
    boardPath: logicalBoardPath(slug),
  };
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

function clearTasksOnly(db: Database, objectiveId: number): void {
  db.query("DELETE FROM tasks WHERE objective_id = ?").run(objectiveId);
}

function clearObjectiveDependents(db: Database, objectiveId: number): void {
  db.query("DELETE FROM tasks WHERE objective_id = ?").run(objectiveId);
  db.query("DELETE FROM objective_intake WHERE objective_id = ?").run(objectiveId);
  db.query("DELETE FROM objective_success_criteria WHERE objective_id = ?").run(objectiveId);
  db.query("DELETE FROM objective_rules WHERE objective_id = ?").run(objectiveId);
  db.query("DELETE FROM objective_agents WHERE objective_id = ?").run(objectiveId);
  db.query("DELETE FROM objective_visual_board WHERE objective_id = ?").run(objectiveId);
  db.query("DELETE FROM objective_checks WHERE objective_id = ?").run(objectiveId);
}

function insertObjectiveGraph(
  db: Database,
  workspaceId: number,
  state: StateV3,
  dirPath: string,
  parentObjectiveId: number | null,
  parentTaskId: string | null,
  existingObjectiveId?: number,
): number {
  const parts = decomposeStateV3(state, workspaceId, 0, dirPath, parentObjectiveId, parentTaskId);
  let objectiveId: number;
  if (existingObjectiveId !== undefined) {
    objectiveId = existingObjectiveId;
    clearObjectiveDependents(db, objectiveId);
    db.query(
      `UPDATE objectives SET
        slug = ?, dir_path = ?, parent_objective_id = ?, parent_task_id = ?, version = ?, title = ?, kind = ?,
        tranche = ?, status = ?, active_task_id = ?, first_milestone_complete = ?, updated_at = datetime('now')
      WHERE id = ?`,
    ).run(
      parts.objective.slug,
      parts.objective.dir_path,
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
  } else {
    const objectiveResult = db
      .query(
        `INSERT INTO objectives (
          workspace_id, slug, dir_path, parent_objective_id, parent_task_id, version, title, kind, tranche,
          status, active_task_id, first_milestone_complete, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(
        workspaceId,
        parts.objective.slug,
        parts.objective.dir_path,
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
    objectiveId = Number(objectiveResult.lastInsertRowid);
  }

  if (parts.intake) {
    const intakeRow = intakeRowFromDecomposed(parts.intake);
    db.query(
      `INSERT INTO objective_intake (
        objective_id, original_request, interpreted_outcome, input_shape, audience, authority,
        proof_type, completion_proof, likely_misfire, blind_spots_considered_json, existing_plan_facts_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      objectiveId,
      intakeRow.original_request as string | null,
      intakeRow.interpreted_outcome as string | null,
      intakeRow.input_shape as string | null,
      intakeRow.audience as string | null,
      intakeRow.authority as string | null,
      intakeRow.proof_type as string | null,
      intakeRow.completion_proof as string | null,
      intakeRow.likely_misfire as string | null,
      intakeRow.blind_spots_considered_json as string | null,
      intakeRow.existing_plan_facts_json as string | null,
    );
  }

  db.query(
    "INSERT INTO objective_success_criteria (objective_id, signal, cadence, final_proof) VALUES (?, ?, ?, ?)",
  ).run(
    objectiveId,
    String(parts.successCriteria.signal),
    parts.successCriteria.cadence == null ? null : String(parts.successCriteria.cadence),
    String(parts.successCriteria.final_proof),
  );

  if (parts.rules) {
    const rulesRow = rulesRowFromDecomposed(parts.rules);
    db.query(
      `INSERT INTO objective_rules (
        objective_id, pm_owns_state, one_active_task, max_write_workers,
        no_implementation_without_worker_or_pm_task, no_completion_without_approval_gate_or_pm_audit,
        planning_is_not_completion, queued_required_worker_blocks_completion, continuous_until_full_outcome,
        missing_input_or_credentials_do_not_stop_objective, preserve_and_validate_existing_plan,
        intake_misfire_must_be_audited, goal_pressure_requires_success_criteria, no_completion_on_weak_proof,
        slice_policy_json, extra_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      objectiveId,
      rulesRow.pm_owns_state as number | null,
      rulesRow.one_active_task as number | null,
      rulesRow.max_write_workers as number | null,
      rulesRow.no_implementation_without_worker_or_pm_task as number | null,
      rulesRow.no_completion_without_approval_gate_or_pm_audit as number | null,
      rulesRow.planning_is_not_completion as number | null,
      rulesRow.queued_required_worker_blocks_completion as number | null,
      rulesRow.continuous_until_full_outcome as number | null,
      rulesRow.missing_input_or_credentials_do_not_stop_objective as number | null,
      rulesRow.preserve_and_validate_existing_plan as number | null,
      rulesRow.intake_misfire_must_be_audited as number | null,
      rulesRow.goal_pressure_requires_success_criteria as number | null,
      rulesRow.no_completion_on_weak_proof as number | null,
      rulesRow.slice_policy_json as string | null,
      rulesRow.extra_json as string | null,
    );
  }

  db.query(
    "INSERT INTO objective_agents (objective_id, scout, worker, approval_gate) VALUES (?, ?, ?, ?)",
  ).run(objectiveId, parts.agents.scout, parts.agents.worker, parts.agents.approval_gate);

  if (parts.visualBoard) {
    db.query("INSERT INTO objective_visual_board (objective_id, payload_json) VALUES (?, ?)").run(
      objectiveId,
      JSON.stringify(parts.visualBoard),
    );
  }

  if (parts.checks) {
    db.query(
      "INSERT INTO objective_checks (objective_id, dirty_fingerprint, last_verification_json) VALUES (?, ?, ?)",
    ).run(
      objectiveId,
      (parts.checks.dirty_fingerprint as string | undefined) ?? null,
      parts.checks.last_verification ? JSON.stringify(parts.checks.last_verification) : null,
    );
  }

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

  return objectiveId;
}

type DecomposedState = ReturnType<typeof decomposeStateV3>;

function insertObjectiveSatellites(db: Database, objectiveId: number, parts: DecomposedState): void {
  if (parts.intake) {
    const intakeRow = intakeRowFromDecomposed(parts.intake);
    db.query(
      `INSERT INTO objective_intake (
        objective_id, original_request, interpreted_outcome, input_shape, audience, authority,
        proof_type, completion_proof, likely_misfire, blind_spots_considered_json, existing_plan_facts_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      objectiveId,
      intakeRow.original_request as string | null,
      intakeRow.interpreted_outcome as string | null,
      intakeRow.input_shape as string | null,
      intakeRow.audience as string | null,
      intakeRow.authority as string | null,
      intakeRow.proof_type as string | null,
      intakeRow.completion_proof as string | null,
      intakeRow.likely_misfire as string | null,
      intakeRow.blind_spots_considered_json as string | null,
      intakeRow.existing_plan_facts_json as string | null,
    );
  }

  db.query(
    "INSERT INTO objective_success_criteria (objective_id, signal, cadence, final_proof) VALUES (?, ?, ?, ?)",
  ).run(
    objectiveId,
    String(parts.successCriteria.signal),
    parts.successCriteria.cadence == null ? null : String(parts.successCriteria.cadence),
    String(parts.successCriteria.final_proof),
  );

  if (parts.rules) {
    const rulesRow = rulesRowFromDecomposed(parts.rules);
    db.query(
      `INSERT INTO objective_rules (
        objective_id, pm_owns_state, one_active_task, max_write_workers,
        no_implementation_without_worker_or_pm_task, no_completion_without_approval_gate_or_pm_audit,
        planning_is_not_completion, queued_required_worker_blocks_completion, continuous_until_full_outcome,
        missing_input_or_credentials_do_not_stop_objective, preserve_and_validate_existing_plan,
        intake_misfire_must_be_audited, goal_pressure_requires_success_criteria, no_completion_on_weak_proof,
        slice_policy_json, extra_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      objectiveId,
      rulesRow.pm_owns_state as number | null,
      rulesRow.one_active_task as number | null,
      rulesRow.max_write_workers as number | null,
      rulesRow.no_implementation_without_worker_or_pm_task as number | null,
      rulesRow.no_completion_without_approval_gate_or_pm_audit as number | null,
      rulesRow.planning_is_not_completion as number | null,
      rulesRow.queued_required_worker_blocks_completion as number | null,
      rulesRow.continuous_until_full_outcome as number | null,
      rulesRow.missing_input_or_credentials_do_not_stop_objective as number | null,
      rulesRow.preserve_and_validate_existing_plan as number | null,
      rulesRow.intake_misfire_must_be_audited as number | null,
      rulesRow.goal_pressure_requires_success_criteria as number | null,
      rulesRow.no_completion_on_weak_proof as number | null,
      rulesRow.slice_policy_json as string | null,
      rulesRow.extra_json as string | null,
    );
  }

  db.query(
    "INSERT INTO objective_agents (objective_id, scout, worker, approval_gate) VALUES (?, ?, ?, ?)",
  ).run(objectiveId, parts.agents.scout, parts.agents.worker, parts.agents.approval_gate);

  if (parts.visualBoard) {
    db.query("INSERT INTO objective_visual_board (objective_id, payload_json) VALUES (?, ?)").run(
      objectiveId,
      JSON.stringify(parts.visualBoard),
    );
  }

  if (parts.checks) {
    db.query(
      "INSERT INTO objective_checks (objective_id, dirty_fingerprint, last_verification_json) VALUES (?, ?, ?)",
    ).run(
      objectiveId,
      (parts.checks.dirty_fingerprint as string | undefined) ?? null,
      parts.checks.last_verification ? JSON.stringify(parts.checks.last_verification) : null,
    );
  }
}

function clearObjectiveSatellitesOnly(db: Database, objectiveId: number): void {
  db.query("DELETE FROM objective_intake WHERE objective_id = ?").run(objectiveId);
  db.query("DELETE FROM objective_success_criteria WHERE objective_id = ?").run(objectiveId);
  db.query("DELETE FROM objective_rules WHERE objective_id = ?").run(objectiveId);
  db.query("DELETE FROM objective_agents WHERE objective_id = ?").run(objectiveId);
  db.query("DELETE FROM objective_visual_board WHERE objective_id = ?").run(objectiveId);
  db.query("DELETE FROM objective_checks WHERE objective_id = ?").run(objectiveId);
}

function insertTasksAndListItems(db: Database, objectiveId: number, parts: DecomposedState): void {
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
      slug = ?, dir_path = ?, parent_objective_id = ?, parent_task_id = ?, version = ?, title = ?, kind = ?,
      tranche = ?, status = ?, active_task_id = ?, first_milestone_complete = ?, updated_at = datetime('now')
    WHERE id = ?`,
  ).run(
    parts.objective.slug,
    parts.objective.dir_path,
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

function insertSubobjectiveLinks(
  db: Database,
  workspaceId: number,
  workspaceRoot: string,
  objectiveId: number,
  state: StateV3,
  dirPath: string,
): void {
  for (const task of state.tasks) {
    if (!task.subobjective?.path) continue;
    const child = resolveChildSlugFromPath(workspaceRoot, task.subobjective.path, dirPath);
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

function persistStatePatch(
  db: Database,
  workspaceId: number,
  existing: ObjectiveRow,
  state: StateV3,
  dirPath: string,
): number {
  const parts = decomposeStateV3(
    state,
    workspaceId,
    existing.id,
    dirPath,
    existing.parent_objective_id,
    existing.parent_task_id,
  );
  updateObjectiveHeader(db, existing.id, parts);
  clearObjectiveSatellitesOnly(db, existing.id);
  insertObjectiveSatellites(db, existing.id, parts);
  clearTasksOnly(db, existing.id);
  insertTasksAndListItems(db, existing.id, parts);
  return existing.id;
}

function persistReceiptState(db: Database, objectiveId: number, state: StateV3): void {
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

function persistTaskPatchInDb(
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

function saveStateV3Patch(
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
    const objectiveId = persistStatePatch(db, workspaceId, existing, state, options.dirPath);
    insertSubobjectiveLinks(db, workspaceId, root, objectiveId, state, options.dirPath);
    return loadStateV3(root, state.objective.slug);
  });
  invalidateHubPayloadCache();
  return result;
}

function resolveChildSlugFromPath(
  workspaceRoot: string,
  subPath: string,
  parentDirPath: string,
): { slug: string; dirPath: string } | null {
  const normalized = subPath.replace(/\\/g, "/");
  const absolute = resolve(parentDirPath, normalized.replace(/\/state\.json$/, ""));
  const slug = resolveChildObjectiveSlug(workspaceRoot, parentDirPath, subPath);
  if (!slug) {
    return null;
  }
  return { slug, dirPath: absolute };
}

export function saveStateV3(
  workspaceRoot: string,
  state: StateV3,
  options: { dirPath?: string } = {},
): LoadedObjective {
  const parsed = StateV3Schema.safeParse(state);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    );
  }
  const root = resolve(workspaceRoot);
  const dirPath =
    options.dirPath ?? join(root, "docs", "objectives", parsed.data.objective.slug);
  const db = getDb(root);

  const result = withTransaction(db, () => {
    const workspaceId = ensureWorkspace(db, root);
    const existing = objectiveRowBySlug(db, workspaceId, parsed.data.objective.slug);
    const objectiveId = insertObjectiveGraph(
      db,
      workspaceId,
      parsed.data,
      dirPath,
      existing?.parent_objective_id ?? null,
      existing?.parent_task_id ?? null,
      existing?.id,
    );

    insertSubobjectiveLinks(db, workspaceId, root, objectiveId, parsed.data, dirPath);

    return loadStateV3(root, parsed.data.objective.slug);
  });
  invalidateHubPayloadCache();
  return result;
}

export function importStateJsonFile(
  workspaceRoot: string,
  stateJsonPath: string,
  options: { dirPath?: string } = {},
): LoadedObjective {
  const dirPath = options.dirPath ?? resolve(stateJsonPath, "..");
  importSubobjectivesFromDir(workspaceRoot, dirPath);
  const text = readFileSync(stateJsonPath, "utf8");
  const raw = JSON.parse(text) as unknown;
  const parsed = StateV3Schema.parse(raw);
  return saveStateV3(workspaceRoot, parsed, { dirPath });
}

export function importLegacyObjectives(
  workspaceRoot: string,
  options: { slug?: string } = {},
): { imported: string[]; skipped: string[]; errors: string[] } {
  const root = resolve(workspaceRoot);
  const objectivesRoot = join(root, "docs", "objectives");
  const imported: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  if (!existsSync(objectivesRoot)) {
    return { imported, skipped, errors };
  }

  for (const entry of readdirSync(objectivesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    if (options.slug && entry.name !== options.slug) continue;
    const slug = entry.name;
    if (objectiveExistsInDb(root, slug)) {
      skipped.push(slug);
      continue;
    }
    const jsonPath = join(objectivesRoot, slug, "state.json");
    if (!existsSync(jsonPath)) {
      skipped.push(slug);
      continue;
    }
    try {
      importStateJsonFile(root, jsonPath, { dirPath: join(objectivesRoot, slug) });
      imported.push(slug);
    } catch (error) {
      errors.push(`${slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { imported, skipped, errors };
}

function pickNextActiveTaskId(
  state: StateV3,
  currentTaskId: string,
  receiptResult: string,
): string | null {
  if (receiptResult === "blocked") return currentTaskId;
  const ids = state.tasks.map((task) => task.id);
  const currentIndex = ids.indexOf(currentTaskId);
  if (currentIndex === -1) return null;
  for (let index = currentIndex + 1; index < state.tasks.length; index += 1) {
    const task = state.tasks[index];
    if (task.status === "queued") return task.id;
  }
  return null;
}

function isCompletionDecision(receipt: Record<string, unknown>): boolean {
  const decision = String(receipt.decision || "").toLowerCase();
  return decision === "complete" || receipt.full_outcome_complete === true;
}

function summarizeReceipt(receipt: Record<string, unknown>): StateV3Task["receipt"] {
  const summary: Record<string, unknown> = {
    result: receipt.result,
    summary: receipt.summary,
  };
  for (const key of [
    "decision",
    "note",
    "full_outcome_complete",
    "stopped_because",
    "commands",
    "evidence",
    "changed_files",
    "remaining_blockers",
  ]) {
    if (receipt[key] !== undefined) {
      summary[key] = receipt[key];
    }
  }
  return summary;
}

export function applyReceipt(
  workspaceRoot: string,
  slug: string,
  receiptEnvelope: unknown,
  options: ApplyReceiptOptions = {},
) {
  const validation = validateReceipt(receiptEnvelope, {
    role: options.role,
    expectedTaskId: options.expectedTaskId,
  });
  const boardPath = logicalBoardPath(slug);
  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors,
      warnings: validation.warnings,
      objective_slug: slug,
      board_path: boardPath,
    };
  }

  const receipt = validation.receipt as Record<string, unknown>;
  const loaded = loadStateV3(workspaceRoot, slug);
  const state = structuredClone(loaded.state) as StateV3;
  const taskId = String(receipt.task_id);
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    return {
      ok: false,
      errors: [`Task ${taskId} not found for objective ${slug}`],
      warnings: validation.warnings,
      objective_slug: slug,
      board_path: boardPath,
    };
  }

  const taskStatus = receipt.result === "blocked" ? "blocked" : "done";
  task.status = taskStatus;
  task.receipt = summarizeReceipt(receipt);

  let verification = null;
  if (options.role === "worker" && receipt.result === "done") {
    verification = verifyWorkerReceiptForTask(
      { id: task.id, verify: task.verify || [] },
      receipt,
    );
    state.checks = state.checks || {};
    state.checks.last_verification = verification.last_verification;
  }

  const nextActiveTask = pickNextActiveTaskId(state, taskId, String(receipt.result));
  const updates = {
    task_id: taskId,
    task_status: taskStatus,
    previous_active_task: state.active_task,
    next_active_task: nextActiveTask,
    objective_status: null as string | null,
  };

  if (receipt.result === "done") {
    if (nextActiveTask) {
      state.active_task = nextActiveTask;
      const nextTask = state.tasks.find((entry) => entry.id === nextActiveTask);
      if (nextTask) nextTask.status = "active";
    } else if (options.role === "approval_gate" && isCompletionDecision(receipt)) {
      const completion = checkCompletionReadinessFromState(state, {
        slug,
        workspaceRoot,
      });
      if (!completion.ready) {
        return {
          ok: false,
          errors: completion.blockers,
          warnings: [...validation.warnings, ...completion.warnings],
          objective_slug: slug,
          board_path: boardPath,
          completion_gate: completion,
        };
      }
      state.objective.status = "done";
      state.active_task = null;
      updates.objective_status = "done";
      updates.next_active_task = null;
    } else {
      state.active_task = null;
      updates.next_active_task = null;
    }
  }

  if (!options.dryRun) {
    const root = resolve(workspaceRoot);
    const db = getDb(root);
    withTransaction(db, () => {
      persistReceiptState(db, loaded.objectiveId, state);
    });
    invalidateHubPayloadCache();
  }

  const postValidation = validateStateV3(state, { slug });
  return {
    ok: postValidation.ok,
    errors: postValidation.errors,
    warnings: [...validation.warnings, ...postValidation.warnings],
    objective_slug: slug,
    board_path: boardPath,
    state_path: boardPath,
    receipt,
    role: validation.role,
    updates,
    verification,
    dry_run: options.dryRun === true,
  };
}

export function patchTask(
  workspaceRoot: string,
  slug: string,
  taskId: string,
  patch: PatchTaskInput,
  options: { dryRun?: boolean } = {},
) {
  const loaded = loadStateV3(workspaceRoot, slug);
  const state = structuredClone(loaded.state) as StateV3;
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    throw new Error(`Task ${taskId} not found for objective ${slug}`);
  }
  if (patch.status) task.status = patch.status as StateV3Task["status"];
  if (patch.allowed_files) task.allowed_files = patch.allowed_files;
  if (patch.verify) task.verify = patch.verify;
  if (patch.stop_if) task.stop_if = patch.stop_if;
  if (patch.inputs) task.inputs = patch.inputs;
  if (patch.constraints) task.constraints = patch.constraints;
  if (patch.expected_output) task.expected_output = patch.expected_output;
  if (patch.subobjective !== undefined) task.subobjective = patch.subobjective;
  if (!options.dryRun) {
    const root = resolve(workspaceRoot);
    const db = getDb(root);
    const sortOrder = state.tasks.findIndex((entry) => entry.id === taskId);
    withTransaction(db, () => {
      persistTaskPatchInDb(db, loaded.objectiveId, task, sortOrder);
      if (state.active_task !== taskId && state.tasks.some((entry) => entry.id === state.active_task)) {
        db.query(
          "UPDATE objectives SET active_task_id = ?, updated_at = datetime('now') WHERE id = ?",
        ).run(state.active_task, loaded.objectiveId);
      }
      if (patch.subobjective !== undefined) {
        db.query("DELETE FROM subobjective_links WHERE parent_objective_id = ?").run(loaded.objectiveId);
        const workspaceId = ensureWorkspace(db, root);
        insertSubobjectiveLinks(db, workspaceId, root, loaded.objectiveId, state, loaded.dirPath);
      }
    });
    invalidateHubPayloadCache();
  }
  const validation = validateStateV3(state, { slug });
  return { ok: validation.ok, errors: validation.errors, warnings: validation.warnings, state };
}

export function patchObjective(
  workspaceRoot: string,
  slug: string,
  patch: {
    objective?: Partial<StateV3["objective"]>;
    rules?: StateV3["rules"];
    agents?: Partial<StateV3["agents"]>;
    checks?: StateV3["checks"];
    active_task?: StateV3["active_task"];
    visual_board?: StateV3["visual_board"];
  },
  options: { dryRun?: boolean } = {},
) {
  const loaded = loadStateV3(workspaceRoot, slug);
  const state = structuredClone(loaded.state) as StateV3;
  if (patch.objective) Object.assign(state.objective, patch.objective);
  if (patch.rules) state.rules = { ...state.rules, ...patch.rules };
  if (patch.agents) state.agents = { ...state.agents, ...patch.agents };
  if (patch.checks) state.checks = { ...state.checks, ...patch.checks };
  if (patch.visual_board) state.visual_board = patch.visual_board;
  if (patch.active_task !== undefined) state.active_task = patch.active_task;
  if (!options.dryRun) {
    saveStateV3Patch(workspaceRoot, state, { dirPath: loaded.dirPath });
  }
  const validation = validateStateV3(state, { slug });
  return { ok: validation.ok, errors: validation.errors, warnings: validation.warnings, state };
}

export function registerObjective(
  workspaceRoot: string,
  slug: string,
  state?: StateV3,
): LoadedObjective {
  const root = resolve(workspaceRoot);
  const dirPath = join(root, "docs", "objectives", slug);
  if (!existsSync(dirPath)) {
    throw new Error(`Objective directory not found: ${dirPath}`);
  }
  const payload = state ?? loadObjectiveTemplate(slug);
  payload.objective.slug = slug;
  return saveStateV3(root, payload, { dirPath });
}

export function parseStateJsonText(text: string): StateV3 {
  return StateV3Schema.parse(JSON.parse(text) as unknown);
}
