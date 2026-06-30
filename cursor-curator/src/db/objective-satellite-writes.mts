import type { Database } from "bun:sqlite";
import type { StateV3 } from "../schema/state-v3.js";
import {
  intakeRowFromDecomposed,
  rulesRowFromDecomposed,
  type DecomposedIntake,
  type DecomposedRules,
  type ObjectiveIntakeInsertRow,
  type ObjectiveRulesInsertRow,
} from "./state-mapper.mjs";

function runIntakeInsert(
  db: Database,
  objectiveId: number,
  intakeRow: ObjectiveIntakeInsertRow,
): void {
  db.query(
    `INSERT INTO objective_intake (
      objective_id, original_request, interpreted_outcome, input_shape, audience, authority,
      proof_type, completion_proof, likely_misfire, blind_spots_considered_json, existing_plan_facts_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    objectiveId,
    intakeRow.original_request,
    intakeRow.interpreted_outcome,
    intakeRow.input_shape,
    intakeRow.audience,
    intakeRow.authority,
    intakeRow.proof_type,
    intakeRow.completion_proof,
    intakeRow.likely_misfire,
    intakeRow.blind_spots_considered_json,
    intakeRow.existing_plan_facts_json,
  );
}

function runRulesInsert(
  db: Database,
  objectiveId: number,
  rulesRow: ObjectiveRulesInsertRow,
): void {
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
    rulesRow.pm_owns_state,
    rulesRow.one_active_task,
    rulesRow.max_write_workers,
    rulesRow.no_implementation_without_worker_or_pm_task,
    rulesRow.no_completion_without_approval_gate_or_pm_audit,
    rulesRow.planning_is_not_completion,
    rulesRow.queued_required_worker_blocks_completion,
    rulesRow.continuous_until_full_outcome,
    rulesRow.missing_input_or_credentials_do_not_stop_objective,
    rulesRow.preserve_and_validate_existing_plan,
    rulesRow.intake_misfire_must_be_audited,
    rulesRow.goal_pressure_requires_success_criteria,
    rulesRow.no_completion_on_weak_proof,
    rulesRow.slice_policy_json,
    rulesRow.extra_json,
  );
}

export function insertObjectiveIntake(
  db: Database,
  objectiveId: number,
  intake: DecomposedIntake,
): void {
  runIntakeInsert(db, objectiveId, intakeRowFromDecomposed(intake));
}

export function replaceObjectiveIntake(
  db: Database,
  objectiveId: number,
  intake: DecomposedIntake | null,
): void {
  db.query("DELETE FROM objective_intake WHERE objective_id = ?").run(objectiveId);
  if (!intake) {
    return;
  }
  insertObjectiveIntake(db, objectiveId, intake);
}

export function insertObjectiveRules(
  db: Database,
  objectiveId: number,
  rules: DecomposedRules,
): void {
  runRulesInsert(db, objectiveId, rulesRowFromDecomposed(rules));
}

export function replaceObjectiveRules(
  db: Database,
  objectiveId: number,
  rules: DecomposedRules | null,
): void {
  db.query("DELETE FROM objective_rules WHERE objective_id = ?").run(objectiveId);
  if (!rules) {
    return;
  }
  insertObjectiveRules(db, objectiveId, rules);
}

export function insertObjectiveSuccessCriteria(
  db: Database,
  objectiveId: number,
  successCriteria: StateV3["objective"]["success_criteria"],
): void {
  db.query(
    "INSERT INTO objective_success_criteria (objective_id, signal, cadence, final_proof) VALUES (?, ?, ?, ?)",
  ).run(
    objectiveId,
    successCriteria.signal,
    successCriteria.cadence ?? null,
    successCriteria.final_proof,
  );
}

export function replaceObjectiveSuccessCriteria(
  db: Database,
  objectiveId: number,
  successCriteria: StateV3["objective"]["success_criteria"] | null,
): void {
  db.query("DELETE FROM objective_success_criteria WHERE objective_id = ?").run(objectiveId);
  if (!successCriteria) {
    return;
  }
  insertObjectiveSuccessCriteria(db, objectiveId, successCriteria);
}

export function insertObjectiveAgents(
  db: Database,
  objectiveId: number,
  agents: StateV3["agents"],
): void {
  db.query(
    "INSERT INTO objective_agents (objective_id, scout, worker, approval_gate) VALUES (?, ?, ?, ?)",
  ).run(objectiveId, agents.scout, agents.worker, agents.approval_gate);
}

export function replaceObjectiveAgents(
  db: Database,
  objectiveId: number,
  agents: StateV3["agents"] | null,
): void {
  db.query("DELETE FROM objective_agents WHERE objective_id = ?").run(objectiveId);
  if (!agents) {
    return;
  }
  insertObjectiveAgents(db, objectiveId, agents);
}

type VisualBoardPayload = NonNullable<StateV3["visual_board"]>;

export function insertObjectiveVisualBoard(
  db: Database,
  objectiveId: number,
  visualBoard: VisualBoardPayload,
): void {
  db.query("INSERT INTO objective_visual_board (objective_id, payload_json) VALUES (?, ?)").run(
    objectiveId,
    JSON.stringify(visualBoard),
  );
}

export function replaceObjectiveVisualBoard(
  db: Database,
  objectiveId: number,
  visualBoard: StateV3["visual_board"],
): void {
  db.query("DELETE FROM objective_visual_board WHERE objective_id = ?").run(objectiveId);
  if (!visualBoard) {
    return;
  }
  insertObjectiveVisualBoard(db, objectiveId, visualBoard);
}

export function insertObjectiveChecks(
  db: Database,
  objectiveId: number,
  checks: NonNullable<StateV3["checks"]>,
): void {
  db.query(
    "INSERT INTO objective_checks (objective_id, dirty_fingerprint, last_verification_json) VALUES (?, ?, ?)",
  ).run(
    objectiveId,
    checks.dirty_fingerprint ?? null,
    checks.last_verification ? JSON.stringify(checks.last_verification) : null,
  );
}

export function upsertObjectiveChecks(
  db: Database,
  objectiveId: number,
  checks: StateV3["checks"],
  options: { preserveDirtyFingerprintWhenNull?: boolean } = {},
): void {
  if (!checks) {
    db.query("DELETE FROM objective_checks WHERE objective_id = ?").run(objectiveId);
    return;
  }
  const checksRow = db
    .query<{ objective_id: number }, [number]>(
      "SELECT objective_id FROM objective_checks WHERE objective_id = ?",
    )
    .get(objectiveId);
  const verificationJson = checks.last_verification ? JSON.stringify(checks.last_verification) : null;
  if (checksRow) {
    if (options.preserveDirtyFingerprintWhenNull) {
      db.query(
        "UPDATE objective_checks SET dirty_fingerprint = COALESCE(?, dirty_fingerprint), last_verification_json = ? WHERE objective_id = ?",
      ).run(checks.dirty_fingerprint ?? null, verificationJson, objectiveId);
    } else {
      db.query(
        "UPDATE objective_checks SET dirty_fingerprint = ?, last_verification_json = ? WHERE objective_id = ?",
      ).run(checks.dirty_fingerprint ?? null, verificationJson, objectiveId);
    }
    return;
  }
  insertObjectiveChecks(db, objectiveId, checks);
}

export function clearObjectiveSatellites(db: Database, objectiveId: number): void {
  replaceObjectiveIntake(db, objectiveId, null);
  replaceObjectiveSuccessCriteria(db, objectiveId, null);
  replaceObjectiveRules(db, objectiveId, null);
  replaceObjectiveAgents(db, objectiveId, null);
  replaceObjectiveVisualBoard(db, objectiveId, undefined);
  upsertObjectiveChecks(db, objectiveId, undefined);
}
