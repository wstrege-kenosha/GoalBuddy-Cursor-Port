import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findBlockedTasksInText } from "./goal-stale.mjs";

export function listBlockedTasks(statePath) {
  const resolved = resolve(statePath);
  const text = readFileSync(resolved, "utf8");
  const ids = findBlockedTasksInText(text);
  return ids.map((id) => summarizeBlockedTask(text, id));
}

export function buildBlockedTriagePlan(statePath) {
  const blocked = listBlockedTasks(statePath);
  return {
    state_path: resolve(statePath),
    blocked_count: blocked.length,
    blocked_tasks: blocked,
    triage_steps: blocked.map((task) => buildTriageStep(task)),
    approval_gate_objective_template:
      "Triage blocked task(s): read receipt blockers, decide smallest unblock path (owner input, credentials, smaller Worker slice, or defer). Do not advance active_task blindly.",
  };
}

function summarizeBlockedTask(text, taskId) {
  const block = taskBlock(text, taskId) || "";
  return {
    id: taskId,
    type: taskScalar(block, "type"),
    objective: taskScalar(block, "objective"),
    receipt_summary: receiptScalar(block, "summary"),
    stopped_because: receiptScalar(block, "stopped_because"),
    remaining_blockers: receiptList(block, "remaining_blockers"),
  };
}

function buildTriageStep(task) {
  const blockers = task.remaining_blockers?.length
    ? task.remaining_blockers.join("; ")
    : task.stopped_because || task.receipt_summary || "unknown blocker";
  return {
    task_id: task.id,
    action: "spawn_approval_gate_triage",
    reason: blockers,
    suggestions: [
      "Spawn Approval Gate to convert blockers into PM credential/decision tasks or a smaller Worker slice.",
      "Keep active_task on the blocked task until triage records a receipt.",
      "If blockers are owner-only, queue a PM task to document required input without stopping other safe local work.",
    ],
  };
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

function taskScalar(block, key) {
  const match = block.match(new RegExp(`^\\s{4}${key}:\\s*(.*?)\\s*$`, "m"));
  return match ? clean(match[1]) : null;
}

function receiptScalar(block, key) {
  const match = block.match(new RegExp(`^\\s{6}${key}:\\s*(.*?)\\s*$`, "m"));
  return match ? clean(match[1]) : null;
}

function receiptList(block, key) {
  const lines = block.split(/\r?\n/);
  const items = [];
  let inList = false;
  for (const line of lines) {
    if (new RegExp(`^\\s{6}${key}:\\s*$`).test(line)) {
      inList = true;
      continue;
    }
    if (inList && /^\s{6}-\s+/.test(line)) {
      items.push(clean(line.replace(/^\s{6}-\s+/, "")));
      continue;
    }
    if (inList && /^\s{4}\S/.test(line)) break;
  }
  return items;
}

function clean(value) {
  return String(value || "").replace(/#.*/, "").trim().replace(/^['"]|['"]$/g, "") || null;
}
