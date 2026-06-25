import { z } from "zod";

export const taskIdSchema = z.string().regex(/^T\d{3}$/);
export const taskTypeSchema = z.enum(["scout", "approval_gate", "worker", "pm"]);
export const taskStatusSchema = z.enum(["queued", "active", "blocked", "done"]);
export const agentStatusSchema = z.enum([
  "installed",
  "bundled_not_installed",
  "missing",
  "unknown",
]);
export const objectiveStatusSchema = z.enum(["active", "blocked", "done"]);
export const objectiveKindSchema = z.enum([
  "specific",
  "open_ended",
  "existing_plan",
  "recovery",
  "audit",
]);
export const inputShapeSchema = z.enum([
  "vague",
  "specific",
  "existing_plan",
  "recovery",
  "audit",
]);
export const authoritySchema = z.enum([
  "requested",
  "approved",
  "inferred",
  "needs_approval",
  "blocked",
]);
export const proofTypeSchema = z.enum([
  "test",
  "demo",
  "artifact",
  "metric",
  "review",
  "source_backed_answer",
  "decision",
]);
export const reasoningHintSchema = z.enum(["default", "low", "medium", "high", "xhigh"]);
export const assigneeSchema = z.enum(["Scout", "Approval Gate", "Worker", "PM"]);
export const visualBoardSelectedSchema = z.enum(["none", "local", "unknown"]);
export const visualBoardLocalStatusSchema = z.enum([
  "not_requested",
  "starting",
  "live",
  "generated",
  "blocked",
]);

const receiptSchema = z.union([z.null(), z.record(z.string(), z.unknown())]);

const subobjectiveSchema = z
  .object({
    status: z.enum(["active", "blocked", "done"]),
    path: z.string().min(1),
    owner: z.string().optional(),
    created_from: taskIdSchema.optional(),
    depth: z.literal(1),
    rollup_receipt: z.unknown().nullable().optional(),
  })
  .optional();

const slicePolicySchema = z
  .object({
    max_consecutive_tiny_tasks: z.number().optional(),
    prefer_vertical_slices: z.boolean().optional(),
    approval_gate_picks_largest_safe_slice: z.boolean().optional(),
    worker_completes_whole_slice: z.boolean().optional(),
  })
  .optional();

export const taskSchema = z.object({
  id: taskIdSchema,
  type: taskTypeSchema,
  assignee: assigneeSchema,
  status: taskStatusSchema,
  reasoning_hint: reasoningHintSchema.optional(),
  objective: z.string().min(1),
  inputs: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  expected_output: z.array(z.string()).optional(),
  allowed_files: z.array(z.string()).optional(),
  verify: z.array(z.string()).optional(),
  stop_if: z.array(z.string()).optional(),
  receipt: receiptSchema.optional(),
  subobjective: subobjectiveSchema,
});

export const StateV3Schema = z.object({
  version: z.literal(3),
  objective: z.object({
    title: z.string().min(1),
    slug: z.string().min(1),
    kind: objectiveKindSchema.optional(),
    tranche: z.string().optional(),
    status: objectiveStatusSchema,
    success_criteria: z.object({
      signal: z.string(),
      cadence: z.string().optional(),
      final_proof: z.string(),
    }),
    intake: z
      .object({
        original_request: z.string().optional(),
        interpreted_outcome: z.string().optional(),
        input_shape: inputShapeSchema.optional(),
        audience: z.string().optional(),
        authority: authoritySchema.optional(),
        proof_type: proofTypeSchema.optional(),
        completion_proof: z.string().optional(),
        likely_misfire: z.string().optional(),
        blind_spots_considered: z.array(z.string()).optional(),
        existing_plan_facts: z.array(z.string()).optional(),
      })
      .optional(),
    first_milestone_complete: z.boolean().optional(),
  }),
  rules: z
    .object({
      pm_owns_state: z.boolean().optional(),
      one_active_task: z.boolean().optional(),
      max_write_workers: z.number().optional(),
      no_implementation_without_worker_or_pm_task: z.boolean().optional(),
      no_completion_without_approval_gate_or_pm_audit: z.boolean().optional(),
      planning_is_not_completion: z.boolean().optional(),
      queued_required_worker_blocks_completion: z.boolean().optional(),
      continuous_until_full_outcome: z.boolean().optional(),
      missing_input_or_credentials_do_not_stop_objective: z.boolean().optional(),
      preserve_and_validate_existing_plan: z.boolean().optional(),
      intake_misfire_must_be_audited: z.boolean().optional(),
      goal_pressure_requires_success_criteria: z.boolean().optional(),
      no_completion_on_weak_proof: z.boolean().optional(),
      slice_policy: slicePolicySchema,
    })
    .passthrough()
    .optional(),
  agents: z.object({
    scout: agentStatusSchema,
    worker: agentStatusSchema,
    approval_gate: agentStatusSchema,
  }),
  visual_board: z
    .object({
      selected: visualBoardSelectedSchema.optional(),
      local: z
        .object({
          status: visualBoardLocalStatusSchema.optional(),
          url: z.string().nullable().optional(),
          command: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  active_task: taskIdSchema.nullable(),
  tasks: z.array(taskSchema).min(1),
  checks: z
    .object({
      dirty_fingerprint: z.string().optional(),
      last_verification: z
        .object({
          result: z.string().optional(),
          task: taskIdSchema.nullable().optional(),
          commands: z.array(z.unknown()).optional(),
        })
        .optional(),
    })
    .optional(),
});

export type StateV3 = z.infer<typeof StateV3Schema>;
export type StateV3Task = z.infer<typeof taskSchema>;
