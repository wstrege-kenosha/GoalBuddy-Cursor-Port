import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  childBoardPaths,
  loadBoard,
  parseArgs,
  renderTaskPrompt,
  resolveBoardPath,
  selectTask,
} from "./render-task-prompt.mjs";
import { areAllowedFilesDisjoint } from "./allowed-files-overlap.mjs";

export { areAllowedFilesDisjoint } from "./allowed-files-overlap.mjs";

if (isDirectRun()) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const plan = createParallelPlan(options);
    if (options.json) {
      console.log(JSON.stringify(plan, null, 2));
    } else {
      console.log(formatPlan(plan));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

interface ParallelCandidate {
  board_path: string;
  task_id: string;
  role: string;
  recommended_agent: string;
  reasoning_hint: string;
  allowed_files: string[];
  safe_to_parallelize?: boolean;
  reason?: string;
  render_prompt_command?: string;
}

export function createParallelPlan(options: Parameters<typeof parseArgs>[0] extends infer _T ? ReturnType<typeof parseArgs> : never) {
  const workspaceRoot = options.workspaceRoot ? resolve(options.workspaceRoot) : undefined;
  const rootBoardPath = resolveBoardPath(options, workspaceRoot);
  const rootBoard = loadBoard(rootBoardPath, workspaceRoot);
  const boards = [rootBoard];
  for (const childPath of childBoardPaths(rootBoard, workspaceRoot)) {
    boards.push(loadBoard(childPath, workspaceRoot));
  }

  const maxWriteWorkers = readMaxWriteWorkers(rootBoard);
  const candidates = boards.map((board) => candidateForBoard(board));
  const workerCandidates = candidates.filter((candidate) => candidate.role === "worker");
  const enriched = candidates.map((candidate) => ({
    ...candidate,
    safe_to_parallelize: isSafeCandidate(candidate, workerCandidates, maxWriteWorkers),
    reason: safetyReason(candidate, workerCandidates, maxWriteWorkers),
    render_prompt_command: promptCommand(candidate),
  }));
  const spawnPlan = enriched
    .filter((candidate) => candidate.safe_to_parallelize)
    .map((candidate) => buildSpawnPlanEntry(candidate, options));
  const spawnMode: "parallel" | "serial" = spawnPlan.length >= 2 ? "parallel" : "serial";

  return {
    root_board_path: rootBoardPath,
    mutated: false,
    spawned_agents: false,
    max_write_workers: maxWriteWorkers,
    worker_candidate_count: workerCandidates.length,
    spawn_mode: spawnMode,
    candidates: enriched,
    spawn_plan: spawnPlan,
  };
}

function buildSpawnPlanEntry(candidate: ParallelCandidate, options: ReturnType<typeof parseArgs>) {
  const prompt = renderTaskPrompt({
    boardPath: candidate.board_path,
    taskId: candidate.task_id,
    json: true,
    workspaceRoot: options.workspaceRoot,
  });
  const agent = candidate.recommended_agent;
  const cursorAgent = agent === "objective_scout" ? "objective-scout"
    : agent === "objective_approval_gate" ? "objective-approval-gate"
      : agent === "objective_worker" ? "objective-worker"
        : null;

  return {
    board_path: candidate.board_path,
    task_id: candidate.task_id,
    role: candidate.role,
    cursor_task_subagent_type: cursorAgent,
    reasoning_hint: candidate.reasoning_hint,
    allowed_files: candidate.allowed_files,
    render_prompt_command: promptCommand(candidate),
    task_prompt: prompt.payload,
  };
}

function candidateForBoard(board: ReturnType<typeof loadBoard>): ParallelCandidate {
  const task = selectTask(board);
  const role = normalizeRole(task.type);
  return {
    board_path: board.path,
    task_id: task.id,
    role,
    recommended_agent: role === "scout" ? "objective_scout" : role === "approval_gate" ? "objective_approval_gate" : role === "worker" ? "objective_worker" : "PM",
    reasoning_hint: reasoningHint(task, role),
    allowed_files: Array.isArray(task.allowed_files) ? task.allowed_files.map(String) : [],
  };
}

function readMaxWriteWorkers(board: ReturnType<typeof loadBoard>): number {
  const value = board.document.rules?.max_write_workers;
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
    return Math.floor(value);
  }
  return 1;
}

function isSafeCandidate(
  candidate: ParallelCandidate,
  workers: ParallelCandidate[],
  maxWriteWorkers: number,
): boolean {
  if (candidate.role === "scout" || candidate.role === "approval_gate") return true;
  if (candidate.role !== "worker") return false;
  if (workers.length < 2) return false;
  if (workers.length > maxWriteWorkers) return false;
  if (candidate.allowed_files.length === 0) return false;
  return workers
    .filter((worker) => worker !== candidate)
    .every((worker) => worker.allowed_files.length > 0 && areAllowedFilesDisjoint(candidate.allowed_files, worker.allowed_files));
}

function safetyReason(
  candidate: ParallelCandidate,
  workers: ParallelCandidate[],
  maxWriteWorkers: number,
): string {
  if (candidate.role === "scout") return "Scout is read-only.";
  if (candidate.role === "approval_gate") return "Approval Gate is read-only.";
  if (candidate.role !== "worker") return "PM tasks mutate board truth and should stay serial.";
  if (workers.length > maxWriteWorkers) {
    return `rules.max_write_workers is ${maxWriteWorkers} but ${workers.length} active Worker candidates exist; raise max_write_workers or serialize Workers.`;
  }
  if (candidate.allowed_files.length === 0) return "Worker has no allowed_files, so write scope is unknown.";
  const overlapping = workers
    .filter((worker) => worker !== candidate)
    .filter((worker) => worker.allowed_files.length === 0 || !areAllowedFilesDisjoint(candidate.allowed_files, worker.allowed_files));
  if (overlapping.length === 0) {
    return workers.length > 1
      ? "Worker write scope is disjoint from other active Workers."
      : "Only one active Worker candidate; parallel Worker safety needs a disjoint peer.";
  }
  return `Worker write scope overlaps or cannot be compared with ${overlapping.map((worker) => `${relative(process.cwd(), worker.board_path)}:${worker.task_id}`).join(", ")}.`;
}

function promptCommand(candidate: ParallelCandidate): string {
  return `curator prompt --board ${quote(candidate.board_path)} --task ${candidate.task_id}`;
}

function normalizeRole(value: string | undefined): string {
  const role = String(value || "pm").toLowerCase();
  return ["scout", "approval_gate", "worker", "pm"].includes(role) ? role : "pm";
}

function reasoningHint(task: { reasoning_hint?: string | null }, role: string): string {
  const hint = String(task.reasoning_hint || "").toLowerCase();
  if (["low", "medium", "high", "xhigh"].includes(hint)) return hint;
  if (role === "approval_gate") return "high";
  return "low";
}

function quote(value: string): string {
  return JSON.stringify(resolve(value));
}

export function formatPlan(plan: {
  root_board_path: string;
  max_write_workers?: number;
  worker_candidate_count?: number;
  spawn_mode?: "parallel" | "serial";
  candidates: ParallelCandidate[];
  spawn_plan?: Array<{
    board_path: string;
    task_id: string;
    cursor_task_subagent_type?: string | null;
    allowed_files: string[];
  }>;
}): string {
  const lines = [
    "Cursor Curator parallel plan",
    "",
    `Root board: ${plan.root_board_path}`,
    `max_write_workers: ${plan.max_write_workers ?? 1}`,
    `worker_candidate_count: ${plan.worker_candidate_count ?? 0}`,
    `spawn_mode: ${plan.spawn_mode ?? "serial"}`,
    "Mutates state: no",
    "Spawns agents: no",
    "",
  ];
  for (const candidate of plan.candidates) {
    lines.push(
      `${candidate.board_path}:${candidate.task_id}`,
      `- role: ${candidate.role}`,
      `- recommended_agent: ${candidate.recommended_agent}`,
      `- reasoning_hint: ${candidate.reasoning_hint}`,
      `- safe_to_parallelize: ${candidate.safe_to_parallelize}`,
      `- reason: ${candidate.reason}`,
      `- render_prompt_command: ${candidate.render_prompt_command}`,
      "",
    );
  }
  if (plan.spawn_plan?.length) {
    lines.push("Spawn plan (safe parallel handoffs):", "");
    for (const entry of plan.spawn_plan) {
      lines.push(
        `${entry.board_path}:${entry.task_id}`,
        `- cursor_task_subagent_type: ${entry.cursor_task_subagent_type || "PM"}`,
        `- allowed_files: ${entry.allowed_files.join(", ") || "(read-only)"}`,
        "",
      );
    }
  }
  return lines.join("\n").trimEnd();
}

function isDirectRun(): boolean {
  return Boolean(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url));
}
