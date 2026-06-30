import type { StateV3, StateV3Task } from "../schema/state-v3.js";

const KNOWN_RULE_KEYS = new Set([
  "pm_owns_state",
  "one_active_task",
  "max_write_workers",
  "no_implementation_without_worker_or_pm_task",
  "no_completion_without_approval_gate_or_pm_audit",
  "planning_is_not_completion",
  "queued_required_worker_blocks_completion",
  "continuous_until_full_outcome",
  "missing_input_or_credentials_do_not_stop_objective",
  "preserve_and_validate_existing_plan",
  "intake_misfire_must_be_audited",
  "goal_pressure_requires_success_criteria",
  "no_completion_on_weak_proof",
  "slice_policy",
]);

export const TASK_LIST_NAMES = [
  "inputs",
  "constraints",
  "expected_output",
  "allowed_files",
  "verify",
  "stop_if",
] as const;

export type TaskListName = (typeof TASK_LIST_NAMES)[number];

export interface ObjectiveRow {
  id: number;
  workspace_id: number;
  slug: string;
  dir_path: string;
  parent_objective_id: number | null;
  parent_task_id: string | null;
  version: number;
  title: string;
  kind: string | null;
  tranche: string | null;
  status: string;
  active_task_id: string | null;
  first_milestone_complete: number | null;
}

export interface TaskRow {
  objective_id: number;
  task_id: string;
  type: string;
  assignee: string;
  status: string;
  reasoning_hint: string | null;
  objective_text: string;
  receipt_json: string | null;
  sort_order: number;
}

export interface TaskListItemRow {
  objective_id: number;
  task_id: string;
  list_name: string;
  position: number;
  value: string;
}

export interface SubobjectiveLinkRow {
  parent_objective_id: number;
  parent_task_id: string;
  child_objective_id: number;
  status: string;
  depth: number;
  owner: string | null;
  created_from: string | null;
  rollup_receipt_json: string | null;
  child_slug?: string;
  child_dir_path?: string;
}

function parseJson<T>(value: string | null | undefined): T | undefined {
  if (value == null || value === "") return undefined;
  return JSON.parse(value) as T;
}

function stringifyJson(value: unknown): string | null {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

function boolToInt(value: boolean | undefined): number | null {
  if (value === undefined) return null;
  return value ? 1 : 0;
}

function intToBool(value: number | null | undefined): boolean | undefined {
  if (value === null || value === undefined) return undefined;
  return value === 1;
}

function listItemsForTask(
  items: TaskListItemRow[],
  objectiveId: number,
  taskId: string,
  listName: TaskListName,
): string[] | undefined {
  const values = items
    .filter(
      (item) =>
        item.objective_id === objectiveId
        && item.task_id === taskId
        && item.list_name === listName,
    )
    .sort((left, right) => left.position - right.position)
    .map((item) => item.value);
  return values.length > 0 ? values : undefined;
}

export type DecomposedIntake = NonNullable<StateV3["objective"]["intake"]>;

export type DecomposedRules = {
  known: NonNullable<StateV3["rules"]>;
  extra?: Record<string, unknown>;
};

export interface ObjectiveIntakeInsertRow {
  original_request: string | null;
  interpreted_outcome: string | null;
  input_shape: string | null;
  audience: string | null;
  authority: string | null;
  proof_type: string | null;
  completion_proof: string | null;
  likely_misfire: string | null;
  blind_spots_considered_json: string | null;
  existing_plan_facts_json: string | null;
}

export interface ObjectiveRulesInsertRow {
  pm_owns_state: number | null;
  one_active_task: number | null;
  max_write_workers: number | null;
  no_implementation_without_worker_or_pm_task: number | null;
  no_completion_without_approval_gate_or_pm_audit: number | null;
  planning_is_not_completion: number | null;
  queued_required_worker_blocks_completion: number | null;
  continuous_until_full_outcome: number | null;
  missing_input_or_credentials_do_not_stop_objective: number | null;
  preserve_and_validate_existing_plan: number | null;
  intake_misfire_must_be_audited: number | null;
  goal_pressure_requires_success_criteria: number | null;
  no_completion_on_weak_proof: number | null;
  slice_policy_json: string | null;
  extra_json: string | null;
}

export type ObjectiveIntakeRow = ObjectiveIntakeInsertRow;
export type ObjectiveRulesRow = ObjectiveRulesInsertRow;

export interface ObjectiveSuccessCriteriaRow {
  signal: string;
  cadence: string | null;
  final_proof: string;
}

export interface ObjectiveAgentsRow {
  scout: string;
  worker: string;
  approval_gate: string;
}

export interface ObjectiveChecksRow {
  dirty_fingerprint: string | null;
  last_verification_json: string | null;
}

export function assembleStateV3(input: {
  objective: ObjectiveRow;
  intake: DecomposedIntake | null;
  successCriteria: ObjectiveSuccessCriteriaRow;
  rules: StateV3["rules"] | null;
  agents: ObjectiveAgentsRow;
  visualBoard: StateV3["visual_board"] | null;
  checks: StateV3["checks"] | null;
  tasks: TaskRow[];
  listItems: TaskListItemRow[];
  subobjectiveLinks: SubobjectiveLinkRow[];
}): StateV3 {
  const objectiveId = input.objective.id;
  const linkByParentTask = new Map(
    input.subobjectiveLinks
      .filter((link) => link.parent_objective_id === objectiveId)
      .map((link) => [link.parent_task_id, link]),
  );

  const tasks: StateV3Task[] = input.tasks
    .filter((task) => task.objective_id === objectiveId)
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((task) => {
      const base: StateV3Task = {
        id: task.task_id as StateV3Task["id"],
        type: task.type as StateV3Task["type"],
        assignee: task.assignee as StateV3Task["assignee"],
        status: task.status as StateV3Task["status"],
        objective: task.objective_text,
        receipt: parseJson(task.receipt_json) ?? null,
      };
      if (task.reasoning_hint) {
        base.reasoning_hint = task.reasoning_hint as StateV3Task["reasoning_hint"];
      }
      for (const listName of TASK_LIST_NAMES) {
        const values = listItemsForTask(input.listItems, objectiveId, task.task_id, listName);
        if (values) {
          base[listName] = values;
        }
      }
      const link = linkByParentTask.get(task.task_id);
      if (link && link.child_dir_path) {
        const subPath = link.child_dir_path.replace(/\\/g, "/");
        const slugMatch = subPath.match(/subobjectives\/([^/]+)/);
        const pathValue = slugMatch ? `subobjectives/${slugMatch[1]}` : subPath.replace(/\/state\.json$/, "");
        base.subobjective = {
          status: link.status as "active" | "blocked" | "done",
          path: pathValue,
          depth: 1,
          ...(link.owner ? { owner: link.owner } : {}),
          ...(link.created_from
            ? { created_from: link.created_from as StateV3Task["id"] }
            : {}),
          ...(link.rollup_receipt_json
            ? { rollup_receipt: parseJson(link.rollup_receipt_json) ?? null }
            : {}),
        };
      }
      return base;
    });

  const state: StateV3 = {
    version: 3,
    objective: {
      title: input.objective.title,
      slug: input.objective.slug,
      status: input.objective.status as StateV3["objective"]["status"],
      success_criteria: {
        signal: input.successCriteria.signal,
        final_proof: input.successCriteria.final_proof,
        ...(input.successCriteria.cadence ? { cadence: input.successCriteria.cadence } : {}),
      },
      ...(input.objective.kind
        ? { kind: input.objective.kind as StateV3["objective"]["kind"] }
        : {}),
      ...(input.objective.tranche ? { tranche: input.objective.tranche } : {}),
      ...(intToBool(input.objective.first_milestone_complete) !== undefined
        ? { first_milestone_complete: intToBool(input.objective.first_milestone_complete) }
        : {}),
      ...(input.intake ? { intake: input.intake } : {}),
    },
    agents: {
      scout: input.agents.scout as StateV3["agents"]["scout"],
      worker: input.agents.worker as StateV3["agents"]["worker"],
      approval_gate: input.agents.approval_gate as StateV3["agents"]["approval_gate"],
    },
    active_task: (input.objective.active_task_id as StateV3["active_task"]) ?? null,
    tasks,
  };

  if (input.rules) {
    state.rules = input.rules;
  }
  if (input.visualBoard) {
    state.visual_board = input.visualBoard;
  }
  if (input.checks) {
    state.checks = input.checks;
  }

  return state;
}

export function decomposeRulesFromState(rules: StateV3["rules"]): DecomposedRules | null {
  if (!rules) {
    return null;
  }
  const extra: Record<string, unknown> = {};
  const known: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rules)) {
    if (KNOWN_RULE_KEYS.has(key)) {
      known[key] = value;
    } else {
      extra[key] = value;
    }
  }
  return {
    known: known as NonNullable<StateV3["rules"]>,
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  };
}

export type DecomposedState = {
  objective: Omit<ObjectiveRow, "id" | "created_at" | "updated_at">;
  intake: DecomposedIntake | null;
  successCriteria: StateV3["objective"]["success_criteria"];
  rules: DecomposedRules | null;
  agents: StateV3["agents"];
  visualBoard: StateV3["visual_board"] | null;
  checks: StateV3["checks"] | null;
  tasks: Array<Omit<TaskRow, "objective_id">>;
  listItems: Array<Omit<TaskListItemRow, "objective_id">>;
  subobjectiveLinks: Array<Omit<SubobjectiveLinkRow, "parent_objective_id">>;
};

export function decomposeStateV3(
  state: StateV3,
  workspaceId: number,
  objectiveId: number,
  dirPath: string,
  parentObjectiveId: number | null = null,
  parentTaskId: string | null = null,
): DecomposedState {
  const intake = state.objective.intake ? { ...state.objective.intake } : null;

  const tasks = state.tasks.map((task, index) => ({
    task_id: task.id,
    type: task.type,
    assignee: task.assignee,
    status: task.status,
    reasoning_hint: task.reasoning_hint ?? null,
    objective_text: task.objective,
    receipt_json: stringifyJson(task.receipt),
    sort_order: index,
  }));

  const listItems: Array<Omit<TaskListItemRow, "objective_id">> = [];
  for (const task of state.tasks) {
    for (const listName of TASK_LIST_NAMES) {
      const values = task[listName];
      if (!Array.isArray(values)) continue;
      values.forEach((value, position) => {
        listItems.push({
          task_id: task.id,
          list_name: listName,
          position,
          value: String(value),
        });
      });
    }
  }

  const subobjectiveLinks: Array<Omit<SubobjectiveLinkRow, "parent_objective_id">> = [];
  for (const task of state.tasks) {
    if (!task.subobjective?.path) continue;
    subobjectiveLinks.push({
      parent_task_id: task.id,
      child_objective_id: 0,
      status: task.subobjective.status,
      depth: task.subobjective.depth ?? 1,
      owner: task.subobjective.owner ?? null,
      created_from: task.subobjective.created_from ?? null,
      rollup_receipt_json: stringifyJson(task.subobjective.rollup_receipt),
      child_dir_path: task.subobjective.path.replace(/\/state\.json$/, ""),
    });
  }

  return {
    objective: {
      workspace_id: workspaceId,
      slug: state.objective.slug,
      dir_path: dirPath,
      parent_objective_id: parentObjectiveId,
      parent_task_id: parentTaskId,
      version: state.version,
      title: state.objective.title,
      kind: state.objective.kind ?? null,
      tranche: state.objective.tranche ?? null,
      status: state.objective.status,
      active_task_id: state.active_task,
      first_milestone_complete: boolToInt(state.objective.first_milestone_complete),
    },
    intake,
    successCriteria: { ...state.objective.success_criteria },
    rules: decomposeRulesFromState(state.rules),
    agents: { ...state.agents },
    visualBoard: state.visual_board ? { ...state.visual_board } : null,
    checks: state.checks ? { ...state.checks } : null,
    tasks,
    listItems,
    subobjectiveLinks,
  };
}

export function rulesRowFromDecomposed(rules: DecomposedRules): ObjectiveRulesInsertRow {
  const { known, extra } = rules;
  return {
    pm_owns_state: boolToInt(known.pm_owns_state),
    one_active_task: boolToInt(known.one_active_task),
    max_write_workers: known.max_write_workers ?? null,
    no_implementation_without_worker_or_pm_task: boolToInt(
      known.no_implementation_without_worker_or_pm_task,
    ),
    no_completion_without_approval_gate_or_pm_audit: boolToInt(
      known.no_completion_without_approval_gate_or_pm_audit,
    ),
    planning_is_not_completion: boolToInt(known.planning_is_not_completion),
    queued_required_worker_blocks_completion: boolToInt(
      known.queued_required_worker_blocks_completion,
    ),
    continuous_until_full_outcome: boolToInt(known.continuous_until_full_outcome),
    missing_input_or_credentials_do_not_stop_objective: boolToInt(
      known.missing_input_or_credentials_do_not_stop_objective,
    ),
    preserve_and_validate_existing_plan: boolToInt(known.preserve_and_validate_existing_plan),
    intake_misfire_must_be_audited: boolToInt(known.intake_misfire_must_be_audited),
    goal_pressure_requires_success_criteria: boolToInt(known.goal_pressure_requires_success_criteria),
    no_completion_on_weak_proof: boolToInt(known.no_completion_on_weak_proof),
    slice_policy_json: stringifyJson(known.slice_policy),
    extra_json: extra && Object.keys(extra).length > 0 ? stringifyJson(extra) : null,
  };
}

export function rulesFromRow(row: ObjectiveRulesRow | null): StateV3["rules"] | null {
  if (!row) return null;
  const rules: Record<string, unknown> = {};
  const boolFields = [
    "pm_owns_state",
    "one_active_task",
    "no_implementation_without_worker_or_pm_task",
    "no_completion_without_approval_gate_or_pm_audit",
    "planning_is_not_completion",
    "queued_required_worker_blocks_completion",
    "continuous_until_full_outcome",
    "missing_input_or_credentials_do_not_stop_objective",
    "preserve_and_validate_existing_plan",
    "intake_misfire_must_be_audited",
    "goal_pressure_requires_success_criteria",
    "no_completion_on_weak_proof",
  ] as const;
  for (const field of boolFields) {
    const value = intToBool(row[field]);
    if (value !== undefined) rules[field] = value;
  }
  if (row.max_write_workers != null) {
    rules.max_write_workers = row.max_write_workers;
  }
  const slicePolicy = parseJson(row.slice_policy_json);
  if (slicePolicy) rules.slice_policy = slicePolicy;
  const extra = parseJson<Record<string, unknown>>(row.extra_json);
  if (extra) Object.assign(rules, extra);
  return Object.keys(rules).length > 0 ? (rules as StateV3["rules"]) : null;
}

export function checksFromRow(row: ObjectiveChecksRow): StateV3["checks"] | null {
  const checks: NonNullable<StateV3["checks"]> = {};
  if (row.dirty_fingerprint) {
    checks.dirty_fingerprint = row.dirty_fingerprint;
  }
  const lastVerification = parseJson<NonNullable<StateV3["checks"]>["last_verification"]>(
    row.last_verification_json,
  );
  if (lastVerification) {
    checks.last_verification = lastVerification;
  }
  return Object.keys(checks).length > 0 ? checks : null;
}

export function intakeRowFromDecomposed(intake: DecomposedIntake): ObjectiveIntakeInsertRow {
  return {
    original_request: intake.original_request ?? null,
    interpreted_outcome: intake.interpreted_outcome ?? null,
    input_shape: intake.input_shape ?? null,
    audience: intake.audience ?? null,
    authority: intake.authority ?? null,
    proof_type: intake.proof_type ?? null,
    completion_proof: intake.completion_proof ?? null,
    likely_misfire: intake.likely_misfire ?? null,
    blind_spots_considered_json: stringifyJson(intake.blind_spots_considered),
    existing_plan_facts_json: stringifyJson(intake.existing_plan_facts),
  };
}

export function intakeFromRow(row: ObjectiveIntakeRow | null): DecomposedIntake | null {
  if (!row) return null;
  const intake: DecomposedIntake = {};
  for (const key of [
    "original_request",
    "interpreted_outcome",
    "input_shape",
    "audience",
    "authority",
    "proof_type",
    "completion_proof",
    "likely_misfire",
  ] as const) {
    const value = row[key];
    if (value != null) {
      intake[key] = value;
    }
  }
  const blindSpots = parseJson<string[]>(row.blind_spots_considered_json);
  if (blindSpots) intake.blind_spots_considered = blindSpots;
  const planFacts = parseJson<string[]>(row.existing_plan_facts_json);
  if (planFacts) intake.existing_plan_facts = planFacts;
  return Object.keys(intake).length > 0 ? intake : null;
}
