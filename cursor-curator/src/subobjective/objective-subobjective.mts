import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function checkSubobjectiveRollup(statePath: string) {
  const resolved = resolve(statePath);
  const text = readFileSync(resolved, "utf8");
  const pending: Array<Record<string, unknown>> = [];

  for (const task of parseTasksWithSubobjectives(text)) {
    if (!task.subobjectivePath) continue;
    const childStatePath = resolve(dirname(resolved), task.subobjectivePath);
    if (!existsSync(childStatePath)) {
      pending.push({
        parent_task_id: task.id,
        subobjective_path: task.subobjectivePath,
        reason: "missing_child_state",
        child_state_path: childStatePath,
      });
      continue;
    }
    const childText = readFileSync(childStatePath, "utf8");
    const childStatus = nestedScalar(childText, "objective", "status");
    const rollup = task.rollupReceipt;
    if (childStatus === "done" && (!rollup || rollup === "null") && task.id) {
      pending.push({
        parent_task_id: task.id,
        subobjective_path: task.subobjectivePath,
        reason: "child_done_missing_rollup",
        child_state_path: childStatePath,
        child_status: childStatus,
        suggested_rollup: buildRollupPatch(resolved, task.id)?.rollup_receipt || null,
      });
    }
  }

  return {
    state_path: resolved,
    pending_count: pending.length,
    pending_rollups: pending,
  };
}

export function buildRollupPatch(parentStatePath: string, taskId: string) {
  const resolved = resolve(parentStatePath);
  const text = readFileSync(resolved, "utf8");
  const task = parseTasksWithSubobjectives(text).find((entry) => entry.id === taskId);
  if (!task?.subobjectivePath) {
    throw new Error(`Task ${taskId} has no subobjective.path`);
  }

  const childStatePath = resolve(dirname(resolved), task.subobjectivePath);
  if (!existsSync(childStatePath)) {
    throw new Error(`Missing child state: ${task.subobjectivePath}`);
  }

  const childText = readFileSync(childStatePath, "utf8");
  const childTitle = nestedScalar(childText, "objective", "title") || basenameSlug(childStatePath);
  const childStatus = nestedScalar(childText, "objective", "status");
  const doneTasks = countTasksByStatus(childText, "done");
  const totalTasks = countTasks(childText);
  const finalAudit = findFinalAuditSummary(childText);

  const rollup = [
    `Subobjective ${childTitle} (${task.subobjectivePath}) status: ${childStatus || "unknown"}.`,
    `${doneTasks}/${totalTasks} child tasks done.`,
    finalAudit ? `Final audit: ${finalAudit}` : "Final audit: pending or not recorded.",
  ].join(" ");

  return {
    parent_task_id: taskId,
    subobjective_path: task.subobjectivePath,
    child_state_path: childStatePath,
    rollup_receipt: rollup,
    yaml_patch: `      rollup_receipt: ${JSON.stringify(rollup)}`,
    advance_hint: childStatus === "done"
      ? "PM may mark parent task done or advance active_task after recording rollup_receipt."
      : "Child objective is not done; wait for child completion before rollup.",
  };
}

function parseTasksWithSubobjectives(text: string) {
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
      current = { id: clean(idMatch[1]) };
      currentLines = [line];
      continue;
    }
    if (current) currentLines.push(line);
  }
  finish();

  return tasks.map((task) => ({
    id: task.id,
    subobjectivePath: subobjectivePathScalar(task.raw || ""),
    rollupReceipt: rollupReceiptScalar(task.raw || ""),
  }));
}

function subobjectivePathScalar(raw: string): string | null {
  const match = raw.match(/^\s{6}path:\s*(.+?)\s*$/m);
  return match ? clean(match[1]) : null;
}

function rollupReceiptScalar(raw: string): string | null {
  const match = raw.match(/^\s{6}rollup_receipt:\s*(.+?)\s*$/m);
  return match ? clean(match[1]) : null;
}

function countTasks(text: string): number {
  return (text.match(/^\s{2}-\s+id:\s*T\d{3}\s*$/gm) || []).length;
}

function countTasksByStatus(text: string, status: string): number {
  const tasks = parseTasksWithSubobjectives(sectionText(text, "tasks") ? `tasks:\n${sectionText(text, "tasks")}` : text);
  return tasks.filter((task) => taskScalarFromRaw(text, task.id || "", "status") === status).length;
}

function taskScalarFromRaw(text: string, taskId: string, key: string): string | null {
  const block = taskBlock(text, taskId);
  if (!block) return null;
  const match = block.match(new RegExp(`^\\s{4}${key}:\\s*(.*?)\\s*$`, "m"));
  return match ? clean(match[1]) : null;
}

function taskBlock(text: string, taskId: string): string | null {
  const lines = text.split(/\r?\n/);
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (new RegExp(`^\\s{2}-\\s+id:\\s*${taskId}\\s*$`).test(lines[index])) {
      start = index;
      break;
    }
  }
  if (start === -1) return null;
  const collected: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    if (index > start && /^\s{2}-\s+id:\s*T\d{3}\s*$/.test(lines[index])) break;
    if (index > start && /^\S/.test(lines[index])) break;
    collected.push(lines[index]);
  }
  return collected.join("\n");
}

function findFinalAuditSummary(text: string): string | null {
  const tasks = text.split(/^\s{2}-\s+id:/m).slice(1);
  for (let index = tasks.length - 1; index >= 0; index -= 1) {
    const chunk = tasks[index];
    if (!/^\s{4}type:\s*approval_gate/m.test(chunk)) continue;
    if (!/^\s{4}status:\s*done/m.test(chunk)) continue;
    const summaryMatch = chunk.match(/^\s{6}summary:\s*(.+?)\s*$/m);
    if (summaryMatch) return clean(summaryMatch[1]);
  }
  return null;
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

function nestedScalar(text: string, section: string, key: string): string | null {
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

function basenameSlug(statePath: string): string | undefined {
  return resolve(statePath, "..").split(/[/\\]/).pop();
}

function clean(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).replace(/#.*/, "").trim().replace(/^['"]|['"]$/g, "");
  if (cleaned === "" || cleaned === "null") return null;
  return cleaned;
}
