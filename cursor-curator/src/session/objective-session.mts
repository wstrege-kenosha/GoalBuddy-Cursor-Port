import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadState, validateObjectiveState } from "../state/objective-state.mjs";
import { readLastVerificationFromLoadedState } from "../verify/objective-verify.mjs";
import { findStaleObjectives } from "../stale/objective-stale.mjs";
import { findObjectiveSlugByDirPath } from "../db/state-repository.mjs";
import { resolveObjectiveDirsFromHook } from "../hook/objective-hook-resolve.mjs";
import { resolveWorkspaceForObjective } from "../mcp/path-utils.mjs";
import type { StateV3, StateV3Task } from "../schema/state-v3.js";

export interface AppendSessionNoteOptions {
  workspaceRoot?: string;
  timestamp?: string;
  summary?: string;
  status?: string;
  task_id?: string;
  objective_slug?: string;
}

export function appendSessionNote(options: AppendSessionNoteOptions = {}) {
  const workspaceRoot = resolve(options.workspaceRoot || process.cwd());
  const objectivesRoot = join(workspaceRoot, "docs", "objectives");
  if (!existsSync(objectivesRoot)) {
    return { ok: true, skipped: "no docs/objectives", appended: [] as string[] };
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

  const payload = {
    workspace_roots: [workspaceRoot],
    cwd: workspaceRoot,
    objective_slug: goalSlug ?? undefined,
    task_id: taskId ?? undefined,
  };
  const objectiveDirs = resolveObjectiveDirsFromHook(payload, goalSlug);

  if (!objectiveDirs.length) {
    const skipped = goalSlug
      ? "objective not found"
      : "ambiguous objective; set objective_slug";
    return { ok: true, skipped, appended: [] as string[], summary, timestamp };
  }

  const appended: string[] = [];
  for (const objectiveDir of objectiveDirs) {
    const notesDir = join(objectiveDir, "notes");
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

export function readSessionDigest(objectiveDir: string, options: { limit?: number } = {}) {
  const limit = Number(options.limit) > 0 ? Number(options.limit) : 3;
  const root = resolve(objectiveDir);
  const sessionPath = join(root, "notes", "SESSION.md");
  if (!existsSync(sessionPath)) {
    return { path: sessionPath, entries: [] as SessionEntry[], preview: null as string | null };
  }

  const content = readFileSync(sessionPath, "utf8");
  const entries: SessionEntry[] = [];
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

interface SessionEntry {
  timestamp: string | null;
  summary: string;
  task_id: string | null;
}

export function buildResumeDigest(
  objectiveDir: string,
  statePath: string,
  options: { limit?: number; stale_days?: number } = {},
) {
  const root = resolve(objectiveDir);
  const workspaceRoot = resolveWorkspaceForObjective(root);
  const slug = findObjectiveSlugByDirPath(workspaceRoot, root) ?? (root.split(/[/\\]/).pop() || statePath);
  const validation = validateObjectiveState(slug, workspaceRoot);
  const session = readSessionDigest(root, options);

  let state: StateV3;
  try {
    state = loadState(root, workspaceRoot).state;
  } catch (error) {
    return {
      objective_dir: root,
      state_path: validation.board_path || statePath,
      board_path: validation.board_path || statePath,
      slug,
      session,
      validation: {
        ok: false,
        errors: [error instanceof Error ? error.message : String(error), ...validation.errors],
        warnings: validation.warnings,
      },
      active_task: null,
      active_task_objective: null,
      last_verification: null,
      recent_receipts: [],
      stale: null,
      stale_nudge: null,
    };
  }

  const activeTaskId = state.active_task;
  const activeTask = state.tasks.find((task) => task.id === activeTaskId) ?? null;
  const lastVerification = readLastVerificationFromLoadedState(
    state as Parameters<typeof readLastVerificationFromLoadedState>[0],
  );
  const recentReceipts = collectRecentReceiptsFromState(state, 2);

  const staleReport = findStaleObjectives({
    days: Number(options.stale_days) > 0 ? Number(options.stale_days) : 7,
    roots: [workspaceRoot],
  });
  const staleEntry = (staleReport.objectives || []).find((entry) => entry.slug === slug) || null;

  return {
    objective_dir: root,
    state_path: validation.board_path || statePath,
    board_path: validation.board_path || statePath,
    slug,
    session,
    validation: {
      ok: validation.ok,
      errors: validation.errors,
      warnings: validation.warnings,
    },
    active_task: activeTaskId,
    active_task_objective: activeTask?.objective ?? null,
    last_verification: lastVerification,
    recent_receipts: recentReceipts,
    stale: staleEntry,
    stale_nudge: staleEntry
      ? `Objective may be stale: ${staleEntry.reasons.join("; ")}. ${(staleEntry.suggestions || []).join(" ")}`
      : null,
  };
}

function receiptSummary(task: StateV3Task): { task_id: string; summary: string | null; result: string | null } {
  const receipt = task.receipt;
  const summary =
    receipt && typeof receipt === "object" && "summary" in receipt
      ? String((receipt as Record<string, unknown>).summary ?? "")
      : null;
  const result =
    receipt && typeof receipt === "object" && "result" in receipt
      ? String((receipt as Record<string, unknown>).result ?? "")
      : null;
  return {
    task_id: task.id,
    summary: summary || null,
    result: result || null,
  };
}

function collectRecentReceiptsFromState(state: StateV3, limit: number) {
  return state.tasks
    .filter((task) => task.status === "done")
    .slice(-limit)
    .map(receiptSummary);
}
