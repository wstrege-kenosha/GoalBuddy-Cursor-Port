import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { misfireAuditStatus } from "../misfire/objective-misfire.mjs";
import { isWeakProof } from "../state/objective-state.mjs";

const ROLE_DEFAULTS = {
  scout: { agent: "objective_scout", reasoning: "low", sandbox: "read-only" },
  approval_gate: { agent: "objective_approval_gate", reasoning: "high", sandbox: "read-only" },
  worker: { agent: "objective_worker", reasoning: "medium", sandbox: "workspace-write" },
  pm: { agent: "PM", reasoning: "medium", sandbox: "workspace-write" },
} as const;

type RoleKey = keyof typeof ROLE_DEFAULTS;

export interface RenderTaskPromptOptions {
  objectiveRoot?: string;
  boardPath?: string;
  taskId?: string;
  json?: boolean;
  parallelPlan?: boolean;
}

export interface BoardDocument {
  version?: number;
  tasks?: TaskRow[];
  active_task?: string;
  objective?: Record<string, unknown>;
  rules?: { slice_policy?: unknown; intake_misfire_must_be_audited?: boolean };
  checks?: { dirty_fingerprint?: string | null };
  agents?: Record<string, unknown>;
}

export interface TaskRow {
  id: string;
  type?: string;
  status?: string;
  objective?: string;
  assignee?: string;
  inputs?: unknown[];
  constraints?: unknown[];
  allowed_files?: unknown[];
  verify?: unknown[];
  stop_if?: unknown[];
  reasoning_hint?: string | null;
  expected_output?: unknown[];
  receipt?: {
    summary?: string;
    result?: string;
    decision?: string;
  };
  subobjective?: { path?: string; depth?: number };
}

export interface LoadedBoard {
  path: string;
  root: string;
  document: BoardDocument;
  tasks: TaskRow[];
  objective: Record<string, unknown>;
  activeTask: string;
}

if (isDirectRun()) {
  try {
    const result = renderTaskPrompt(parseArgs(process.argv.slice(2)));
    if (result.json) {
      console.log(JSON.stringify(result.payload, null, 2));
    } else {
      console.log(formatPrompt(result.payload));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export function renderTaskPrompt(options: RenderTaskPromptOptions) {
  const boardPath = resolveBoardPath(options);
  const board = loadBoard(boardPath);
  const task = selectTask(board, options.taskId);
  const role = normalizeRole(task.type);
  const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.pm;
  const reasoning = normalizeReasoning(task.reasoning_hint, defaults.reasoning);
  const warnings = promptWarnings(board, task);

  return {
    json: options.json,
    payload: {
      metadata: {
        recommended_agent: defaults.agent,
        required_spawn_agent_type: defaults.agent === "PM" ? null : defaults.agent,
        recommended_reasoning: reasoning,
        recommended_cursor_model: recommendedCursorModel(reasoning, role),
        sandbox: defaults.sandbox,
        fork_context_allowed: role !== "worker",
        board_path: board.path,
        child_board_paths: childBoardPaths(board),
        goal_success_criteria: (board.objective.success_criteria as unknown) || null,
        slice_policy: board.document.rules?.slice_policy || null,
        dirty_fingerprint: board.document.checks?.dirty_fingerprint ?? null,
        recent_receipts: recentReceipts(board),
        warnings,
      },
      task: {
        id: task.id,
        type: role,
        assignee: task.assignee || defaults.agent,
        status: task.status,
        objective: task.objective || "",
        inputs: stringList(task.inputs),
        constraints: stringList(task.constraints),
        allowed_files: stringList(task.allowed_files),
        verify: stringList(task.verify),
        stop_if: stringList(task.stop_if),
        reasoning_hint: task.reasoning_hint || null,
        expected_output: stringList(task.expected_output),
      },
      receipt_schema: receiptSchema(role),
    },
  };
}

export function parseArgs(args: string[]): RenderTaskPromptOptions {
  const options: RenderTaskPromptOptions = { objectiveRoot: "", boardPath: "", taskId: "", json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--task") {
      options.taskId = args[++index] || "";
    } else if (arg.startsWith("--task=")) {
      options.taskId = arg.slice("--task=".length);
    } else if (arg === "--board") {
      options.boardPath = args[++index] || "";
    } else if (arg.startsWith("--board=")) {
      options.boardPath = arg.slice("--board=".length);
    } else if (arg === "--parallel-plan") {
      options.parallelPlan = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown argument: ${arg}`);
    } else if (!options.objectiveRoot) {
      options.objectiveRoot = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  if (!options.objectiveRoot && !options.boardPath) {
    throw new Error("Usage: curator prompt <goal-root> [--task T###] [--board path/to/state.json]");
  }
  return options;
}

export function loadBoard(boardPath: string): LoadedBoard {
  if (!existsSync(boardPath)) throw new Error(`state file not found: ${boardPath}`);
  const text = readFileSync(boardPath, "utf8");
  const document = JSON.parse(text) as BoardDocument;
  const version = Number(document.version);
  if (!document || version !== 3) {
    throw new Error(`unsupported Cursor Curator state version in ${boardPath} (expected version 3)`);
  }
  if (!Array.isArray(document.tasks)) throw new Error(`state file has no tasks: ${boardPath}`);
  return {
    path: boardPath,
    root: dirname(boardPath),
    document,
    tasks: document.tasks,
    objective: document.objective || {},
    activeTask: document.active_task ?? "",
  };
}

export function resolveBoardPath(options: RenderTaskPromptOptions): string {
  const candidate = options.boardPath || options.objectiveRoot;
  if (!candidate) throw new Error("Missing objective root or board path.");
  const resolved = resolve(candidate);
  const base = basename(resolved).toLowerCase();
  if (base === "state.json") return resolved;
  return resolve(resolved, "state.json");
}

export function selectTask(board: LoadedBoard, taskId = ""): TaskRow {
  const id = taskId || board.activeTask || board.document?.active_task;
  if (!id) {
    const fallback = board.tasks.find((candidate) => candidate?.status === "active")?.id
      || board.tasks.find((candidate) => candidate?.status === "queued")?.id
      || board.tasks.at(-1)?.id;
    if (!fallback) {
      throw new Error(`No task selected and active_task is empty in ${board.path}`);
    }
    const task = board.tasks.find((candidate) => candidate?.id === fallback);
    if (!task) throw new Error(`Task ${fallback} not found in ${board.path}`);
    return task;
  }
  const task = board.tasks.find((candidate) => candidate?.id === id);
  if (!task) throw new Error(`Task ${id} not found in ${board.path}`);
  return task;
}

export function childBoardPaths(board: LoadedBoard): string[] {
  return board.tasks
    .map((task) => task?.subobjective?.path)
    .filter(Boolean)
    .map((childPath) => resolve(board.root, String(childPath)));
}

function promptWarnings(board: LoadedBoard, task: TaskRow): string[] {
  const warnings: string[] = [];
  const role = normalizeRole(task.type);
  if (task.id !== board.activeTask) warnings.push(`Task ${task.id} is not the active task on this board.`);
  const successCriteria = board.objective.success_criteria as Record<string, unknown> | undefined;
  if (isWeakProof(successCriteria?.signal)) {
    warnings.push("objective.success_criteria.signal is missing or placeholder-like; keep the objective pressured by a concrete success criteria.");
  }
  if (isWeakProof(successCriteria?.final_proof)) {
    warnings.push("objective.success_criteria.final_proof is missing or placeholder-like; do not mark the objective complete without receipt-backed proof.");
  }
  if (board.document?.rules?.intake_misfire_must_be_audited === true) {
    const intake = board.objective.intake as Record<string, unknown> | undefined;
    if (isWeakProof(intake?.likely_misfire)) {
      warnings.push("objective.intake.likely_misfire is missing or placeholder-like while intake_misfire_must_be_audited is true.");
    }
    if (isWeakProof(intake?.interpreted_outcome)) {
      warnings.push("objective.intake.interpreted_outcome is missing or placeholder-like while intake_misfire_must_be_audited is true.");
    }
    try {
      const audit = misfireAuditStatus(board.path);
      if (audit.due) warnings.push(audit.recommendation);
    } catch {
      /* state path may be unavailable in tests */
    }
  }
  if (role === "worker") {
    if (stringList(task.allowed_files).length === 0) warnings.push(`Worker task ${task.id} has no allowed_files.`);
    if (stringList(task.verify).length === 0) warnings.push(`Worker task ${task.id} has no verify commands.`);
    if (stringList(task.stop_if).length === 0) warnings.push(`Worker task ${task.id} has no stop_if conditions.`);
    if (isFalse(board.objective.full_outcome_complete)) {
      warnings.push(`full_outcome_complete is false and ${task.id} is an active Worker; do not stop after rendering or repairing the board. Execute the Worker unless a stop_if condition applies.`);
    }
  }
  for (const candidate of board.tasks) {
    if (candidate?.subobjective && Number(candidate.subobjective.depth) !== 1) {
      warnings.push(`Task ${candidate.id} has subobjective.depth ${candidate.subobjective.depth || "<missing>"}; only depth 1 is supported.`);
    }
  }
  warnings.push(...microSliceWarnings(board, task));
  return warnings;
}

function microSliceWarnings(board: LoadedBoard, task: TaskRow): string[] {
  const warnings: string[] = [];
  const doneTasks = board.tasks.filter((candidate) => candidate?.status === "done");
  const recentWorkers = board.tasks
    .filter((candidate) => normalizeRole(candidate?.type) === "worker")
    .slice(-5);
  const recentTinyWorkers = recentWorkers.filter((candidate) => isTinyTask(candidate));
  const activeRole = normalizeRole(task.type);
  const activeAllowedFiles = stringList(task.allowed_files);
  const firstMilestoneComplete = isTrue(board.objective.first_milestone_complete);
  const microWarning = "Board may be micro-slicing. Prefer the largest safe useful slice.";

  if (recentTinyWorkers.length >= 3) warnings.push(microWarning);
  if (doneTasks.length >= 10 && activeRole === "worker" && activeAllowedFiles.length > 0 && activeAllowedFiles.length <= 2) {
    warnings.push(`${microWarning} Active Worker ${task.id} has only ${activeAllowedFiles.length} allowed_files after ${doneTasks.length} completed tasks.`);
  }
  if (firstMilestoneComplete && activeRole === "worker" && isTinyTask(task)) {
    warnings.push(`${microWarning} The first milestone is complete, so the active Worker should move toward the next real milestone.`);
  }
  if (activeRole === "approval_gate" && /pick small reviewable work|select one narrow next task/i.test(String(task.objective || "") + "\n" + stringList(task.constraints).join("\n"))) {
    warnings.push(`${microWarning} Approval Gate instructions still ask for small or narrow work.`);
  }
  return [...new Set(warnings)];
}

function isTinyTask(task: TaskRow): boolean {
  const text = [
    task?.objective,
    stringList(task?.constraints).join(" "),
    task?.receipt?.summary,
  ].join(" ").toLowerCase();
  return /\b(tiny|narrow|single helper|one helper|projection helper|projection function|contract file|read-only proof|doc note|validator|validation wrapper|pure helper|caller-input)\b/.test(text);
}

function normalizeRole(value: string | undefined): RoleKey {
  const role = String(value || "pm").toLowerCase();
  return role in ROLE_DEFAULTS ? (role as RoleKey) : "pm";
}

function normalizeReasoning(value: string | null | undefined, fallback: string): string {
  const hint = String(value || "").toLowerCase();
  if (["low", "medium", "high", "xhigh"].includes(hint)) return hint;
  return fallback;
}

function isFalse(value: unknown): boolean {
  return value === false || String(value).toLowerCase() === "false";
}

function isTrue(value: unknown): boolean {
  return value === true || String(value).toLowerCase() === "true";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined).map(String) : [];
}

function recentReceipts(board: LoadedBoard) {
  return board.tasks
    .filter((task) => task?.status === "done" && task?.receipt)
    .slice(-2)
    .map((task) => ({
      task_id: task.id,
      type: task.type,
      summary: task.receipt?.summary || null,
      result: task.receipt?.result || null,
      decision: task.receipt?.decision || null,
    }));
}

function recommendedCursorModel(reasoning: string, role: RoleKey): string {
  const hint = String(reasoning || "").toLowerCase();
  if (hint === "xhigh") return "claude-opus-4-8-thinking-high";
  if (hint === "high" || role === "approval_gate") return "claude-4.6-sonnet-medium-thinking";
  if (hint === "low" || role === "scout") return "composer-2.5-fast";
  return "gpt-5.4-medium";
}

function receiptSchema(role: RoleKey) {
  if (role === "worker") {
    return {
      result: "done | blocked",
      task_id: "<T###>",
      board_path: "<path to state.json>",
      changed_files: [],
      commands: [],
      summary: "<=120 words>",
      remaining_blockers: [],
      verification_attempts: 1,
      stopped_because: null,
    };
  }
  if (role === "approval_gate") {
    return {
      result: "done | blocked",
      task_id: "<T###>",
      board_path: "<path to state.json>",
      decision: "approved | rejected | approve_subobjective | reject_subobjective | not_complete | complete",
      full_outcome_complete: false,
      rationale: "<=120 words>",
      evidence: [],
      subobjective_contract: null,
      parallel_safety: null,
      blocked_tasks: [],
      missing_evidence: [],
      required_board_updates: [],
    };
  }
  return {
    result: "done | blocked",
    task_id: "<T###>",
    board_path: "<path to state.json>",
    summary: "<=120 words>",
    evidence: [],
    facts: [],
    contradictions: [],
    ambiguity_requiring_approval_gate: [],
    commands: [],
    note_needed: false,
  };
}

function formatPrompt(payload: {
  metadata: Record<string, unknown>;
  task: Record<string, unknown>;
  receipt_schema: unknown;
}): string {
  const lines = [
    "Cursor Curator task prompt",
    "",
    "Metadata:",
    `- recommended_agent: ${payload.metadata.recommended_agent}`,
    `- required_spawn_agent_type: ${payload.metadata.required_spawn_agent_type || "PM fallback"}`,
    `- recommended_reasoning: ${payload.metadata.recommended_reasoning}`,
    `- sandbox: ${payload.metadata.sandbox}`,
    `- fork_context_allowed: ${payload.metadata.fork_context_allowed}`,
    `- board_path: ${payload.metadata.board_path}`,
  ];
  const childPaths = payload.metadata.child_board_paths as string[];
  if (childPaths.length) {
    lines.push("- child_board_paths:");
    for (const path of childPaths) lines.push(`  - ${path}`);
  }
  if (payload.metadata.goal_success_criteria) {
    lines.push(`- goal_success_criteria: ${JSON.stringify(payload.metadata.goal_success_criteria)}`);
  }
  if (payload.metadata.slice_policy) {
    lines.push(`- slice_policy: ${JSON.stringify(payload.metadata.slice_policy)}`);
  }
  const warnings = payload.metadata.warnings as string[];
  if (warnings.length) {
    lines.push("- warnings:");
    for (const warning of warnings) lines.push(`  - ${warning}`);
  }
  const recentReceiptsList = payload.metadata.recent_receipts as Array<{ task_id: string; summary?: string | null; decision?: string | null; result?: string | null }>;
  if (recentReceiptsList?.length) {
    lines.push("- recent_receipts:");
    for (const receipt of recentReceiptsList) {
      lines.push(`  - ${receipt.task_id}: ${receipt.summary || receipt.decision || receipt.result || "done"}`);
    }
  }
  if (payload.metadata.dirty_fingerprint) {
    lines.push(`- dirty_fingerprint: ${payload.metadata.dirty_fingerprint}`);
  }
  if (payload.metadata.recommended_cursor_model) {
    lines.push(`- recommended_cursor_model: ${payload.metadata.recommended_cursor_model}`);
  }

  lines.push(
    "",
    "Spawn contract:",
    `- Codex spawn_agent agent_type: ${payload.metadata.required_spawn_agent_type || "do not spawn; run as PM"}`,
    "- Do not substitute generic scout, worker, or approval gate agents for Cursor Curator agents.",
    "- If the required Cursor Curator agent is unavailable, stop spawning and continue as PM fallback or install agents.",
    "- After one wait_agent timeout with no visible allowed-file changes, stop waiting and recover deterministically.",
    "",
    "Task:",
    `- id: ${payload.task.id}`,
    `- type: ${payload.task.type}`,
    `- assignee: ${payload.task.assignee}`,
    `- status: ${payload.task.status}`,
    `- objective: ${payload.task.objective}`,
  );
  addList(lines, "inputs", payload.task.inputs as string[]);
  addList(lines, "constraints", payload.task.constraints as string[]);
  addList(lines, "allowed_files", payload.task.allowed_files as string[]);
  addList(lines, "verify", payload.task.verify as string[]);
  addList(lines, "stop_if", payload.task.stop_if as string[]);
  addList(lines, "expected_output", payload.task.expected_output as string[]);
  lines.push("", "Expected receipt JSON shape:", JSON.stringify(payload.receipt_schema, null, 2));
  return lines.join("\n");
}

function addList(lines: string[], label: string, values: string[]): void {
  if (!values.length) return;
  lines.push(`- ${label}:`);
  for (const value of values) lines.push(`  - ${value}`);
}

function isDirectRun(): boolean {
  return Boolean(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url));
}
