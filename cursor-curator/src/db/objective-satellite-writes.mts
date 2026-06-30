import type { Database } from "bun:sqlite";
import type { StateV3 } from "../schema/state-v3.js";
import { intakeRowFromDecomposed, rulesRowFromDecomposed } from "./state-mapper.mjs";

function runIntakeInsert(
  db: Database,
  objectiveId: number,
  intakeRow: Record<string, unknown>,
): void {
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

function runRulesInsert(
  db: Database,
  objectiveId: number,
  rulesRow: Record<string, unknown>,
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

export function insertObjectiveIntake(
  db: Database,
  objectiveId: number,
  intake: Record<string, unknown>,
): void {
  runIntakeInsert(db, objectiveId, intakeRowFromDecomposed(intake));
}

export function replaceObjectiveIntake(
  db: Database,
  objectiveId: number,
  intake: Record<string, unknown> | null,
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
  rules: Record<string, unknown>,
): void {
  runRulesInsert(db, objectiveId, rulesRowFromDecomposed(rules));
}

export function replaceObjectiveRules(
  db: Database,
  objectiveId: number,
  rules: Record<string, unknown> | null,
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
  successCriteria: Record<string, unknown>,
): void {
  db.query(
    "INSERT INTO objective_success_criteria (objective_id, signal, cadence, final_proof) VALUES (?, ?, ?, ?)",
  ).run(
    objectiveId,
    String(successCriteria.signal),
    successCriteria.cadence == null ? null : String(successCriteria.cadence),
    String(successCriteria.final_proof),
  );
}

export function insertObjectiveAgents(
  db: Database,
  objectiveId: number,
  agents: Record<string, string>,
): void {
  db.query(
    "INSERT INTO objective_agents (objective_id, scout, worker, approval_gate) VALUES (?, ?, ?, ?)",
  ).run(objectiveId, agents.scout, agents.worker, agents.approval_gate);
}

export function insertObjectiveVisualBoard(
  db: Database,
  objectiveId: number,
  visualBoard: Record<string, unknown>,
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
  checks: Record<string, unknown>,
): void {
  db.query(
    "INSERT INTO objective_checks (objective_id, dirty_fingerprint, last_verification_json) VALUES (?, ?, ?)",
  ).run(
    objectiveId,
    (checks.dirty_fingerprint as string | undefined) ?? null,
    checks.last_verification ? JSON.stringify(checks.last_verification) : null,
  );
}

export function upsertObjectiveChecks(
  db: Database,
  objectiveId: number,
  checks: StateV3["checks"],
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
    db.query(
      "UPDATE objective_checks SET dirty_fingerprint = ?, last_verification_json = ? WHERE objective_id = ?",
    ).run(checks.dirty_fingerprint ?? null, verificationJson, objectiveId);
    return;
  }
  insertObjectiveChecks(db, objectiveId, checks);
}
