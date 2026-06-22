import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { isWeakProof, validateGoalState } from "./objective-state.mjs";
import { misfireAuditOverdueAtCompletion } from "./objective-misfire.mjs";

export function checkCompletionReadiness(statePath) {
  const resolved = resolve(statePath);
  const validation = validateGoalState(resolved);
  const blockers = [...validation.errors];
  const warnings = [...validation.warnings];

  if (!existsSync(resolved)) {
    return {
      ready: false,
      validation_ok: false,
      success_criteria_ready: false,
      audit_ready: false,
      blockers,
      warnings,
      state_path: resolved,
    };
  }

  const text = readFileSync(resolved, "utf8");
  const goalStatus = nestedScalar(text, "objective", "status");
  const successCriteriaSignal = pathScalar(text, ["objective", "success_criteria"], "signal");
  const successCriteriaFinalProof = pathScalar(text, ["objective", "success_criteria"], "final_proof");
  const completionProof = pathScalar(text, ["objective", "intake"], "completion_proof");
  const successCriteriaReady = !isWeakProof(successCriteriaSignal) && !isWeakProof(successCriteriaFinalProof) && !isWeakProof(completionProof);

  if (!successCriteriaReady) {
    blockers.push("success criteria are not concrete enough for completion (signal, final_proof, or completion_proof is weak).");
  }

  const tasks = parseTaskStatuses(text);
  const unfinishedWorkers = tasks
    .filter((task) => task.type === "worker" && ["queued", "active"].includes(task.status))
    .map((task) => task.id);
  if (unfinishedWorkers.length > 0) {
    blockers.push(`queued or active Worker tasks remain: ${unfinishedWorkers.join(", ")}`);
  }

  const activeTasks = tasks.filter((task) => task.status === "active");
  if (activeTasks.length > 0) {
    blockers.push(`active tasks remain: ${activeTasks.map((task) => task.id).join(", ")}`);
  }

  const auditReady = tasks.some((task) => {
    if (!["approval_gate", "pm"].includes(task.type) || task.status !== "done") return false;
    return task.receiptResult === "done" && (task.decision === "complete" || task.decision === "done") && task.fullOutcomeComplete === true;
  });

  if (!auditReady) {
    blockers.push("missing final Approval Gate/PM audit with decision complete and full_outcome_complete: true");
  }

  const misfireAudit = misfireAuditOverdueAtCompletion(resolved);
  if (misfireAudit.overdue) {
    blockers.push(`intake misfire audit overdue: ${misfireAudit.recommendation}`);
  }

  if (goalStatus === "done" && !validation.ok) {
    blockers.push("objective.status is done but state validation failed");
  }

  const ready = validation.ok && successCriteriaReady && auditReady && unfinishedWorkers.length === 0 && activeTasks.length === 0;

  return {
    ready,
    validation_ok: validation.ok,
    success_criteria_ready: successCriteriaReady,
    audit_ready: auditReady,
    objective_status: goalStatus,
    blockers: [...new Set(blockers)],
    warnings,
    state_path: resolved,
    objective_root: dirname(resolved),
  };
}

function clean(value) {
  if (value === undefined || value === null) return null;
  const cleaned = value.replace(/#.*/, "").trim().replace(/^['"]|['"]$/g, "");
  if (cleaned === "" || cleaned === "null") return null;
  if (cleaned === "true") return true;
  if (cleaned === "false") return false;
  return cleaned;
}

function nestedScalar(text, section, key) {
  const lines = text.split(/\r?\n/);
  let inSection = false;
  for (const line of lines) {
    if (new RegExp(`^${section}:\\s*$`).test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^\S/.test(line)) break;
    if (inSection) {
      const match = line.match(new RegExp(`^\\s{2}${key}:\\s*(.*?)\\s*$`));
      if (match) return clean(match[1]);
    }
  }
  return null;
}

function pathScalar(text, path, key) {
  const lines = text.split(/\r?\n/);
  let depth = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const indent = line.match(/^ */)[0].length;
    if (indent < depth * 2) depth = Math.floor(indent / 2);
    if (depth < path.length && indent === depth * 2 && new RegExp(`^\\s{${indent}}${path[depth]}:\\s*$`).test(line)) {
      depth += 1;
      continue;
    }
    if (depth === path.length && indent === depth * 2) {
      const match = line.match(new RegExp(`^\\s{${indent}}${key}:\\s*(.*?)\\s*$`));
      if (match) return clean(match[1]);
    }
  }
  return null;
}

function parseTaskStatuses(text) {
  const body = sectionText(text, "tasks");
  if (!body) return [];
  const lines = body.split(/\r?\n/);
  const tasks = [];
  let current = null;
  let currentLines = [];

  function finish() {
    if (!current) return;
    current.raw = currentLines.join("\n");
    tasks.push(current);
  }

  for (const line of lines) {
    const idMatch = line.match(/^\s{2}-\s+id:\s*(.+?)\s*$/);
    if (idMatch) {
      finish();
      current = { id: clean(idMatch[1]) };
      currentLines = [line];
      continue;
    }
    if (current) currentLines.push(line);
  }
  finish();

  return tasks.map((task) => ({
    id: task.id,
    type: taskScalar(task, "type"),
    status: taskScalar(task, "status"),
    receiptResult: receiptScalar(task, "result"),
    decision: receiptScalar(task, "decision"),
    fullOutcomeComplete: receiptScalar(task, "full_outcome_complete"),
  }));
}

function sectionText(text, section) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^${section}:\\s*$`).test(line));
  if (start === -1) return "";
  const collected = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\S/.test(lines[i])) break;
    collected.push(lines[i]);
  }
  return collected.join("\n");
}

function taskScalar(task, key) {
  const match = task.raw.match(new RegExp(`^\\s{4}${key}:\\s*(.*?)\\s*$`, "m"));
  return match ? clean(match[1]) : null;
}

function receiptScalar(task, key) {
  const match = task.raw.match(new RegExp(`^\\s{6}${key}:\\s*(.*?)\\s*$`, "m"));
  return match ? clean(match[1]) : null;
}
