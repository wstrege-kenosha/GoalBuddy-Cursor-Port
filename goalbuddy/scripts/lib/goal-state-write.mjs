import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { parseReceiptInput, validateReceipt } from "./goal-receipt.mjs";
import { validateGoalState } from "./goal-state.mjs";

export function parseReceiptFromText(text) {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const candidates = [];
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) candidates.push(fenceMatch[1].trim());

  const jsonStart = trimmed.indexOf("{");
  if (jsonStart >= 0) candidates.push(trimmed.slice(jsonStart));

  for (const candidate of candidates) {
    try {
      const parsed = parseReceiptInput(candidate);
      const receipt = parsed.goalbuddy_receipt_v1 ?? parsed;
      if (receipt && typeof receipt === "object" && receipt.task_id) {
        return { envelope: parsed.goalbuddy_receipt_v1 ? parsed : { goalbuddy_receipt_v1: receipt }, receipt };
      }
    } catch {
      /* try next */
    }
  }

  return null;
}

export function listTaskIds(stateText) {
  const ids = [];
  for (const match of stateText.matchAll(/^\s{2}-\s+id:\s*(T\d{3})\s*$/gm)) {
    ids.push(match[1]);
  }
  return ids;
}

export function pickNextActiveTaskId(stateText, currentTaskId, receiptResult) {
  if (receiptResult === "blocked") return currentTaskId;
  const ids = listTaskIds(stateText);
  const currentIndex = ids.indexOf(currentTaskId);
  if (currentIndex === -1) return null;

  for (let index = currentIndex + 1; index < ids.length; index += 1) {
    const taskId = ids[index];
    const status = taskScalar(stateText, taskId, "status");
    if (status === "queued") return taskId;
  }
  return null;
}

export function applyReceiptToState(statePath, receiptEnvelope, options = {}) {
  const role = options.role;
  const validation = validateReceipt(receiptEnvelope, {
    role,
    expectedTaskId: options.expectedTaskId,
  });
  if (!validation.ok) {
    return { ok: false, errors: validation.errors, warnings: validation.warnings, state_path: statePath };
  }

  const receipt = validation.receipt;
  let text = readFileSync(statePath, "utf8").replace(/\r\n/g, "\n");
  const taskId = receipt.task_id;
  const taskStatus = receipt.result === "blocked" ? "blocked" : "done";
  text = replaceTaskScalar(text, taskId, "status", taskStatus);
  text = replaceTaskReceipt(text, taskId, receipt);

  let nextActiveTask = pickNextActiveTaskId(text, taskId, receipt.result);
  const updates = {
    task_id: taskId,
    task_status: taskStatus,
    previous_active_task: readScalar(text, "active_task"),
    next_active_task: nextActiveTask,
    goal_status: null,
  };

  if (receipt.result === "done") {
    if (nextActiveTask) {
      text = replaceTopScalar(text, "active_task", nextActiveTask);
      text = replaceTaskScalar(text, nextActiveTask, "status", "active");
    } else if (role === "judge" && isCompletionDecision(receipt)) {
      text = replaceNestedScalar(text, "goal", "status", "done");
      text = replaceTopScalar(text, "active_task", "null");
      updates.goal_status = "done";
      updates.next_active_task = null;
    } else {
      text = replaceTopScalar(text, "active_task", "null");
      updates.next_active_task = null;
    }
  }

  if (!options.dryRun) {
    writeFileSync(statePath, text, "utf8");
  }

  const postValidation = options.dryRun
    ? validateGoalStateFromText(text, statePath)
    : validateGoalState(statePath);

  return {
    ok: postValidation.ok,
    errors: postValidation.errors,
    warnings: [...validation.warnings, ...postValidation.warnings],
    state_path: statePath,
    receipt,
    role: validation.role,
    updates,
    dry_run: options.dryRun === true,
  };
}

function validateGoalStateFromText(text, statePath) {
  const tempPath = join(tmpdir(), `goalbuddy-validate-${randomBytes(8).toString("hex")}.yaml`);
  writeFileSync(tempPath, text, "utf8");
  try {
    return validateGoalState(tempPath);
  } finally {
    try {
      unlinkSync(tempPath);
    } catch {
      /* ignore */
    }
  }
}

function isCompletionDecision(receipt) {
  const decision = String(receipt.decision || "").toLowerCase();
  return decision === "complete" || receipt.full_outcome_complete === true;
}

function readScalar(text, key) {
  const match = text.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"));
  return match ? clean(match[1]) : null;
}

function clean(value) {
  return String(value || "").replace(/#.*/, "").trim().replace(/^['"]|['"]$/g, "");
}

function taskScalar(text, taskId, key) {
  const block = taskBlock(text, taskId);
  if (!block) return null;
  const match = block.match(new RegExp(`^\\s{4}${key}:\\s*(.+?)\\s*$`, "m"));
  return match ? clean(match[1]) : null;
}

function taskBlock(text, taskId) {
  const lines = text.split(/\r?\n/);
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (new RegExp(`^\\s{2}-\\s+id:\\s*${taskId}\\s*$`).test(lines[index])) {
      start = index;
      break;
    }
  }
  if (start === -1) return null;
  const collected = [];
  for (let index = start; index < lines.length; index += 1) {
    if (index > start && /^\s{2}-\s+id:\s*T\d{3}\s*$/.test(lines[index])) break;
    if (index > start && /^\S/.test(lines[index])) break;
    collected.push(lines[index]);
  }
  return collected.join("\n");
}

function replaceTaskScalar(text, taskId, key, value) {
  const block = taskBlock(text, taskId);
  if (!block) throw new Error(`Task ${taskId} not found in state.yaml`);
  const updatedBlock = block.replace(
    new RegExp(`^(\\s{4}${key}:\\s*)(.+?)\\s*$`, "m"),
    (_match, prefix) => `${prefix}${value}`,
  );
  return text.replace(block, updatedBlock);
}

function replaceTopScalar(text, key, value) {
  return text.replace(new RegExp(`^${key}:\\s*.+$`, "m"), `${key}: ${value}`);
}

function replaceNestedScalar(text, section, key, value) {
  const lines = text.split(/\r?\n/);
  let inSection = false;
  for (let index = 0; index < lines.length; index += 1) {
    if (new RegExp(`^${section}:\\s*$`).test(lines[index])) {
      inSection = true;
      continue;
    }
    if (inSection && /^\S/.test(lines[index])) break;
    if (inSection) {
      const match = lines[index].match(new RegExp(`^(\\s{2}${key}:\\s*)(.+?)\\s*$`));
      if (match) {
        lines[index] = `${match[1]}${value}`;
        return lines.join("\n");
      }
    }
  }
  throw new Error(`Could not update ${section}.${key}`);
}

function replaceTaskReceipt(text, taskId, receipt) {
  const block = taskBlock(text, taskId);
  if (!block) throw new Error(`Task ${taskId} not found in state.yaml`);
  const receiptYaml = formatReceiptYaml(receipt);
  let updatedBlock = block;
  if (/^\s{4}receipt:\s*null\s*$/m.test(updatedBlock)) {
    updatedBlock = updatedBlock.replace(/^\s{4}receipt:\s*null\s*$/m, `    receipt:\n${indent(receiptYaml, 6)}`);
  } else if (/^\s{4}receipt:\s*$/m.test(updatedBlock)) {
    updatedBlock = updatedBlock.replace(/^\s{4}receipt:\s*$/m, `    receipt:\n${indent(receiptYaml, 6)}`);
  } else {
    updatedBlock = updatedBlock.replace(/^\s{4}receipt:[\s\S]*?(?=^\s{4}\w|\s*$)/m, `    receipt:\n${indent(receiptYaml, 6)}`);
  }
  return text.replace(block, updatedBlock);
}

function formatReceiptYaml(receipt) {
  const lines = [];
  const scalarKeys = ["result", "summary", "decision", "task_id", "board_path", "note_needed", "full_outcome_complete", "stopped_because"];
  for (const key of scalarKeys) {
    if (receipt[key] === undefined || receipt[key] === null) continue;
    if (typeof receipt[key] === "boolean") {
      lines.push(`${key}: ${receipt[key]}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(String(receipt[key]))}`);
    }
  }
  for (const key of ["evidence", "facts", "changed_files", "remaining_blockers", "commands"]) {
    if (!Array.isArray(receipt[key]) || receipt[key].length === 0) continue;
    lines.push(`${key}:`);
    for (const item of receipt[key]) {
      if (typeof item === "object" && item !== null) {
        lines.push(`  - cmd: ${JSON.stringify(String(item.cmd || ""))}`);
        if (item.status) lines.push(`    status: ${item.status}`);
      } else {
        lines.push(`  - ${JSON.stringify(String(item))}`);
      }
    }
  }
  return lines.join("\n");
}

function indent(text, spaces) {
  const pad = " ".repeat(spaces);
  return text
    .split(/\r?\n/)
    .map((line) => (line ? `${pad}${line}` : line))
    .join("\n");
}

export function loadAgentInstructions(cursorHome, agentName) {
  const path = join(cursorHome, "agents", `${agentName}.md`);
  return readFileSync(path, "utf8");
}

export function buildAgentHandoffPrompt({ agentInstructions, taskPromptPayload }) {
  const metadata = taskPromptPayload.metadata;
  const task = taskPromptPayload.task;
  return [
    agentInstructions.trim(),
    "",
    "# GoalBuddy task handoff",
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
    "Return exactly one parseable JSON object with goalbuddy_receipt_v1 as specified in your agent contract.",
  ].join("\n");
}
