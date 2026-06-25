import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseReceiptInput, validateReceipt } from "../receipt/objective-receipt.mjs";
import { checkCompletionReadiness } from "../completion/objective-completion.mjs";
import { loadState, validateObjectiveState, validateStateV3 } from "./objective-state.mjs";
import { verifyWorkerReceiptForTask } from "../verify/objective-verify.mjs";
import type { StateV3, StateV3Task } from "../schema/state-v3.js";

export interface ApplyReceiptOptions {
  role?: string;
  expectedTaskId?: string;
  dryRun?: boolean;
}

export function parseReceiptFromText(text: string | null | undefined): {
  envelope: Record<string, unknown>;
  receipt: Record<string, unknown>;
} | null {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const candidates: string[] = [];
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) candidates.push(fenceMatch[1].trim());

  const jsonStart = trimmed.indexOf("{");
  if (jsonStart >= 0) candidates.push(trimmed.slice(jsonStart));

  for (const candidate of candidates) {
    try {
      const parsed = parseReceiptInput(candidate);
      const receipt = (parsed.cursor_curator_receipt_v1 ?? parsed) as Record<string, unknown>;
      if (receipt && typeof receipt === "object" && receipt.task_id) {
        return {
          envelope: parsed.cursor_curator_receipt_v1
            ? parsed
            : { cursor_curator_receipt_v1: receipt },
          receipt,
        };
      }
    } catch {
      /* try next */
    }
  }

  return null;
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

export function applyReceiptToState(
  statePath: string,
  receiptEnvelope: unknown,
  options: ApplyReceiptOptions = {},
) {
  const role = options.role;
  const validation = validateReceipt(receiptEnvelope, {
    role,
    expectedTaskId: options.expectedTaskId,
  });
  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors,
      warnings: validation.warnings,
      state_path: statePath,
    };
  }

  const receipt = validation.receipt as Record<string, unknown>;
  const loaded = loadState(statePath);
  const state = structuredClone(loaded.state) as StateV3;
  const taskId = String(receipt.task_id);
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    return {
      ok: false,
      errors: [`Task ${taskId} not found in state file`],
      warnings: validation.warnings,
      state_path: statePath,
    };
  }

  const taskStatus = receipt.result === "blocked" ? "blocked" : "done";
  task.status = taskStatus;
  task.receipt = summarizeReceipt(receipt);

  let verification = null;
  if (role === "worker" && receipt.result === "done") {
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
    } else if (role === "approval_gate" && isCompletionDecision(receipt)) {
      const completion = checkCompletionReadiness(statePath);
      if (!completion.ready) {
        return {
          ok: false,
          errors: completion.blockers,
          warnings: [...validation.warnings, ...completion.warnings],
          state_path: statePath,
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

  const nextText = `${JSON.stringify(state, null, 2)}\n`;
  if (!options.dryRun) {
    writeFileSync(statePath, nextText, "utf8");
  }

  const postValidation = options.dryRun
    ? validateObjectiveStateFromObject(state)
    : validateObjectiveState(statePath);

  return {
    ok: postValidation.ok,
    errors: postValidation.errors,
    warnings: [...validation.warnings, ...postValidation.warnings],
    state_path: statePath,
    receipt,
    role: validation.role,
    updates,
    verification,
    dry_run: options.dryRun === true,
  };
}

function validateObjectiveStateFromObject(state: StateV3) {
  const result = validateStateV3(state);
  return {
    ok: result.ok,
    errors: result.errors,
    warnings: result.warnings,
  };
}

export function loadAgentInstructions(cursorHome: string, agentName: string): string {
  const path = join(cursorHome, "agents", `${agentName}.md`);
  return readFileSync(path, "utf8");
}

export function buildAgentHandoffPrompt({
  agentInstructions,
  taskPromptPayload,
}: {
  agentInstructions: string;
  taskPromptPayload: {
    metadata: Record<string, unknown>;
    task: Record<string, unknown>;
    receipt_schema: unknown;
  };
}): string {
  const metadata = taskPromptPayload.metadata;
  const task = taskPromptPayload.task;
  return [
    agentInstructions.trim(),
    "",
    "# Cursor Curator task handoff",
    "",
    `- board_path: ${metadata.board_path}`,
    `- task_id: ${task.id}`,
    `- type: ${task.type}`,
    `- objective: ${task.objective}`,
    "",
    "## Task JSON",
    JSON.stringify(task, null, 2),
    "",
    "## Receipt schema",
    JSON.stringify(taskPromptPayload.receipt_schema, null, 2),
    "",
    "Return exactly one parseable JSON object with cursor_curator_receipt_v1 as specified in your agent contract.",
  ].join("\n");
}
