import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateGoalState } from "./goal-state.mjs";
import { readLastVerificationFromState } from "./goal-verify.mjs";
import { discoverObjectiveStatePaths, findStaleGoals } from "./goal-stale.mjs";

export function appendSessionNote(options = {}) {
  const workspaceRoot = resolve(options.workspaceRoot || process.cwd());
  const goalsRoot = join(workspaceRoot, "docs", "objectives");
  if (!existsSync(goalsRoot)) {
    return { ok: true, skipped: "no docs/objectives", appended: [] };
  }

  const timestamp = options.timestamp || new Date().toISOString();
  const summary = String(options.summary || options.status || "Agent session ended").trim();
  const taskId = options.task_id ? String(options.task_id) : null;
  const goalSlug = options.objective_slug ? String(options.objective_slug) : null;

  const lines = [
    "",
    `## ${timestamp}`,
    `- summary: ${summary}`,
  ];
  if (taskId) lines.push(`- task: ${taskId}`);

  const statePaths = discoverObjectiveStatePaths([workspaceRoot]).filter((statePath) => {
    if (!goalSlug) return true;
    const slug = statePath.split(/[/\\]/).slice(-2, -1)[0];
    return slug === goalSlug;
  });

  const appended = [];
  for (const statePath of statePaths) {
    const goalDir = resolve(statePath, "..");
    const notesDir = join(goalDir, "notes");
    mkdirSync(notesDir, { recursive: true });
    const sessionPath = join(notesDir, "SESSION.md");
    if (!existsSync(sessionPath)) {
      appendFileSync(sessionPath, "# Cursor Curator session log\n", "utf8");
    }
    appendFileSync(sessionPath, `${lines.join("\n")}\n`, "utf8");
    appended.push(sessionPath);
  }

  return { ok: true, appended, summary, timestamp };
}

export function readSessionDigest(objectiveDir, options = {}) {
  const limit = Number(options.limit) > 0 ? Number(options.limit) : 3;
  const root = resolve(objectiveDir);
  const sessionPath = join(root, "notes", "SESSION.md");
  if (!existsSync(sessionPath)) {
    return { path: sessionPath, entries: [], preview: null };
  }

  const content = readFileSync(sessionPath, "utf8");
  const entries = [];
  const chunks = content.split(/\n(?=##\s)/);
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed || trimmed.startsWith("# Cursor Curator session log")) continue;
    const headingMatch = trimmed.match(/^##\s+(.+?)\s*$/m);
    const summaryMatch = trimmed.match(/^-\s+summary:\s*(.+?)\s*$/m);
    const taskMatch = trimmed.match(/^-\s+task:\s*(.+?)\s*$/m);
    entries.push({
      timestamp: headingMatch ? headingMatch[1].trim() : null,
      summary: summaryMatch ? summaryMatch[1].trim() : trimmed,
      task_id: taskMatch ? taskMatch[1].trim() : null,
    });
  }

  const recent = entries.slice(-limit);
  const preview = recent.length ? recent[recent.length - 1].summary : null;
  return { path: sessionPath, entries: recent, preview };
}

export function buildResumeDigest(objectiveDir, statePath, options = {}) {
  const root = resolve(objectiveDir);
  const resolvedState = resolve(statePath);
  const validation = validateGoalState(resolvedState);
  const stateText = readFileSync(resolvedState, "utf8");
  const session = readSessionDigest(root, options);
  const lastVerification = readLastVerificationFromState(stateText);
  const activeTaskId = readTopScalar(stateText, "active_task");
  const activeObjective = activeTaskId ? readTaskObjective(stateText, activeTaskId) : null;
  const recentReceipts = collectRecentReceipts(stateText, 2);

  const workspaceRoot = resolve(root, "../..");
  const staleReport = findStaleGoals({
    days: Number(options.stale_days) > 0 ? Number(options.stale_days) : 7,
    roots: [workspaceRoot],
  });
  const slug = root.split(/[/\\]/).pop();
  const staleEntry = (staleReport.goals || []).find((entry) => entry.slug === slug) || null;

  return {
    objective_dir: root,
    state_path: resolvedState,
    slug,
    session,
    validation: {
      ok: validation.ok,
      errors: validation.errors,
      warnings: validation.warnings,
    },
    active_task: activeTaskId,
    active_task_objective: activeObjective,
    last_verification: lastVerification,
    recent_receipts: recentReceipts,
    stale: staleEntry,
    stale_nudge: staleEntry
      ? `Objective may be stale: ${staleEntry.reasons.join("; ")}. ${(staleEntry.suggestions || []).join(" ")}`
      : null,
  };
}

function readTopScalar(text, key) {
  const match = text.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"));
  if (!match) return null;
  const cleaned = match[1].replace(/#.*/, "").trim().replace(/^['"]|['"]$/g, "");
  return cleaned === "null" ? null : cleaned;
}

function readTaskObjective(text, taskId) {
  const block = taskBlock(text, taskId);
  if (!block) return null;
  const match = block.match(/^\s{4}objective:\s*(.+?)\s*$/m);
  return match ? match[1].replace(/^['"]|['"]$/g, "").trim() : null;
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

function collectRecentReceipts(text, limit) {
  const taskIds = [...text.matchAll(/^\s{2}-\s+id:\s*(T\d{3})\s*$/gm)].map((match) => match[1]);
  const doneIds = taskIds.filter((taskId) => {
    const block = taskBlock(text, taskId);
    return /^\s{4}status:\s*done\s*$/m.test(block || "");
  });
  const receipts = [];
  for (const taskId of doneIds.slice(-limit)) {
    const block = taskBlock(text, taskId);
    const summaryMatch = block?.match(/^\s{6}summary:\s*(.+?)\s*$/m);
    const resultMatch = block?.match(/^\s{6}result:\s*(.+?)\s*$/m);
    receipts.push({
      task_id: taskId,
      summary: summaryMatch ? summaryMatch[1].replace(/^['"]|['"]$/g, "").trim() : null,
      result: resultMatch ? resultMatch[1].replace(/^['"]|['"]$/g, "").trim() : null,
    });
  }
  return receipts;
}
