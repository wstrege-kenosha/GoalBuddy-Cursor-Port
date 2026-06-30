import type { Database } from "bun:sqlite";
import type { StateV3 } from "../schema/state-v3.js";
import { decomposeRulesFromState } from "./state-mapper.mjs";
import {
  replaceObjectiveAgents,
  replaceObjectiveIntake,
  replaceObjectiveRules,
  replaceObjectiveSuccessCriteria,
  replaceObjectiveVisualBoard,
  upsertObjectiveChecks,
} from "./objective-satellite-writes.mjs";

export interface ObjectivePatchFields {
  objective?: Partial<StateV3["objective"]>;
  rules?: StateV3["rules"];
  agents?: Partial<StateV3["agents"]>;
  checks?: StateV3["checks"];
  active_task?: StateV3["active_task"];
  visual_board?: StateV3["visual_board"];
}

export function persistObjectivePatchInDb(
  db: Database,
  objectiveId: number,
  state: StateV3,
  patch: ObjectivePatchFields,
): void {
  if (patch.objective) {
    db.query(
      `UPDATE objectives SET
        title = ?, kind = ?, tranche = ?, status = ?, version = ?,
        active_task_id = ?, first_milestone_complete = ?, updated_at = datetime('now')
      WHERE id = ?`,
    ).run(
      state.objective.title,
      state.objective.kind ?? null,
      state.objective.tranche ?? null,
      state.objective.status,
      state.version,
      state.active_task,
      state.objective.first_milestone_complete === true ? 1 : null,
      objectiveId,
    );

    if (patch.objective.success_criteria) {
      replaceObjectiveSuccessCriteria(db, objectiveId, state.objective.success_criteria);
    }

    if ("intake" in patch.objective) {
      replaceObjectiveIntake(db, objectiveId, state.objective.intake ?? null);
    }
  } else if (patch.active_task !== undefined) {
    db.query(
      "UPDATE objectives SET active_task_id = ?, updated_at = datetime('now') WHERE id = ?",
    ).run(state.active_task, objectiveId);
  }

  if (patch.rules) {
    replaceObjectiveRules(db, objectiveId, decomposeRulesFromState(state.rules));
  }

  if (patch.agents) {
    replaceObjectiveAgents(db, objectiveId, state.agents);
  }

  if (patch.checks !== undefined) {
    upsertObjectiveChecks(db, objectiveId, state.checks ?? null);
  }

  if (patch.visual_board !== undefined) {
    replaceObjectiveVisualBoard(db, objectiveId, state.visual_board ?? null);
  }
}
