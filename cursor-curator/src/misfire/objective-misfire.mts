import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isWeakProof } from "../state/objective-state.mjs";

const DEFAULT_WORKERS_BETWEEN_AUDITS = 3;
const MISFIRE_MARKERS = ["misfire", "interpreted_outcome", "original_request", "wrong thing", "intake"];

interface ParsedTask {
  id: string | null;
  type: string | null;
  status: string | null;
  receiptSummary: string | null;
  receiptDecision: string | null;
  receiptEvidence: string[];
  raw?: string;
}

export function misfireAuditStatus(
  statePath: string,
  options: { workers_between_audits?: number } = {},
) {
  const resolved = resolve(statePath);
  const text = readFileSync(resolved, "utf8");
  const threshold = Number(options.workers_between_audits) > 0
    ? Number(options.workers_between_audits)
    : DEFAULT_WORKERS_BETWEEN_AUDITS;

  const likelyMisfire = pathScalar(text, ["objective", "intake"], "likely_misfire");
  const interpretedOutcome = pathScalar(text, ["objective", "intake"], "interpreted_outcome");
  const originalRequest = pathScalar(text, ["objective", "intake"], "original_request");
  const mustAudit = nestedScalar(text, "rules", "intake_misfire_must_be_audited") === true;

  const tasks = parseTasks(text);
  const doneWorkersSinceAudit = countDoneWorkersSinceLastAudit(tasks);
  const lastAuditTaskId = findLastAuditTaskId(tasks);

  const due = mustAudit && (
    lastAuditTaskId === null
    || doneWorkersSinceAudit >= threshold
  );

  let recommendation = "No misfire audit required.";
  if (mustAudit && due) {
    recommendation = lastAuditTaskId === null
      ? "Queue an Approval Gate task to compare recent Worker receipts against objective.intake (likely_misfire, interpreted_outcome)."
      : `Queue an Approval Gate misfire audit — ${doneWorkersSinceAudit} Worker task(s) completed since ${lastAuditTaskId}.`;
  }

  return {
    must_audit: mustAudit,
    due,
    workers_since_audit: doneWorkersSinceAudit,
    workers_between_audits: threshold,
    last_audit_task_id: lastAuditTaskId,
    likely_misfire: likelyMisfire,
    interpreted_outcome: interpretedOutcome,
    original_request: originalRequest,
    weak_likely_misfire: isWeakProof(likelyMisfire),
    weak_interpreted_outcome: isWeakProof(interpretedOutcome),
    recommendation,
    state_path: resolved,
  };
}

export function misfireAuditOverdueAtCompletion(statePath: string) {
  const status = misfireAuditStatus(statePath);
  if (!status.must_audit) return { overdue: false, ...status };
  return {
    ...status,
    overdue: status.due,
  };
}

function countDoneWorkersSinceLastAudit(tasks: ParsedTask[]): number {
  let workers = 0;
  for (let index = tasks.length - 1; index >= 0; index -= 1) {
    const task = tasks[index];
    if (isMisfireAuditReceipt(task)) break;
    if (task.type === "worker" && task.status === "done") workers += 1;
  }
  return workers;
}

function findLastAuditTaskId(tasks: ParsedTask[]): string | null {
  for (let index = tasks.length - 1; index >= 0; index -= 1) {
    if (isMisfireAuditReceipt(tasks[index])) return tasks[index].id;
  }
  return null;
}

function isMisfireAuditReceipt(task: ParsedTask): boolean {
  if (!task || task.status !== "done" || !["approval_gate", "pm"].includes(task.type || "")) return false;
  const blob = receiptBlob(task).toLowerCase();
  return MISFIRE_MARKERS.some((marker) => blob.includes(marker));
}

function receiptBlob(task: ParsedTask): string {
  return [
    task.receiptSummary,
    task.receiptDecision,
    ...(task.receiptEvidence || []),
  ].join(" ");
}

function parseTasks(text: string): ParsedTask[] {
  const body = sectionText(text, "tasks");
  if (!body) return [];
  const lines = body.split(/\r?\n/);
  const tasks: Array<{ id: string | null; raw?: string }> = [];
  let current: { id: string | null; raw?: string } | null = null;
  let currentLines: string[] = [];

  function finish() {
    if (!current) return;
    current.raw = currentLines.join("\n");
    tasks.push(current);
  }

  for (const line of lines) {
    const idMatch = line.match(/^\s{2}-\s+id:\s*(.+?)\s*$/);
    if (idMatch) {
      finish();
      current = { id: cleanStr(idMatch[1]) };
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
    receiptSummary: receiptScalar(task, "summary"),
    receiptDecision: receiptScalar(task, "decision"),
    receiptEvidence: receiptList(task, "evidence"),
  }));
}

function sectionText(text: string, section: string): string {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^${section}:\\s*$`).test(line));
  if (start === -1) return "";
  const collected: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\S/.test(lines[i])) break;
    collected.push(lines[i]);
  }
  return collected.join("\n");
}

function taskScalar(task: { raw?: string }, key: string): string | null {
  const match = task.raw?.match(new RegExp(`^\\s{4}${key}:\\s*(.*?)\\s*$`, "m"));
  return match ? cleanStr(match[1]) : null;
}

function receiptScalar(task: { raw?: string }, key: string): string | null {
  const match = task.raw?.match(new RegExp(`^\\s{6}${key}:\\s*(.*?)\\s*$`, "m"));
  return match ? cleanStr(match[1]) : null;
}

function receiptList(task: { raw?: string }, key: string): string[] {
  const lines = (task.raw || "").split(/\r?\n/);
  const items: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (new RegExp(`^\\s{6}${key}:\\s*$`).test(line)) {
      inList = true;
      continue;
    }
    if (inList && /^\s{6}-\s+/.test(line)) {
      const item = cleanStr(line.replace(/^\s{6}-\s+/, ""));
      if (item) items.push(item);
      continue;
    }
    if (inList && /^\s{4}\S/.test(line)) break;
  }
  return items;
}

function nestedScalar(text: string, section: string, key: string): boolean {
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
      if (match) return clean(match[1]) === "true";
    }
  }
  return false;
}

function pathScalar(text: string, path: string[], key: string): string | boolean | null {
  const lines = text.split(/\r?\n/);
  let depth = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const indent = line.match(/^ */)?.[0].length ?? 0;
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

function cleanStr(value: unknown): string | null {
  const cleaned = clean(value);
  return typeof cleaned === "string" ? cleaned : null;
}

function clean(value: unknown): string | boolean | null {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).replace(/#.*/, "").trim().replace(/^['"]|['"]$/g, "");
  if (cleaned === "" || cleaned === "null") return null;
  if (cleaned === "true") return true;
  if (cleaned === "false") return false;
  return cleaned;
}
