import { basename, join, resolve } from "node:path";
import { loadState } from "../state/objective-state.mjs";
import { listObjectives } from "../db/state-repository.mjs";

export function resolveObjectiveDirsFromHook(
  payload: Record<string, unknown>,
  objectiveSlug?: string | null,
): string[] {
  const slug = objectiveSlug ?? (typeof payload.objective_slug === "string" ? payload.objective_slug : null);
  const dirs = discoverObjectiveDirs(payload, slug);
  if (slug || dirs.length <= 1) {
    return dirs;
  }
  return pickSingleObjectiveDir(dirs, payload);
}

export function discoverAllObjectiveDirsFromHook(payload: Record<string, unknown>): string[] {
  return discoverObjectiveDirs(payload, null);
}

function discoverObjectiveDirs(payload: Record<string, unknown>, slug: string | null): string[] {
  const roots = new Set<string>();

  if (Array.isArray(payload.workspace_roots)) {
    for (const root of payload.workspace_roots) {
      if (typeof root === "string" && root.trim()) {
        roots.add(resolve(root));
      }
    }
  }

  if (typeof payload.cwd === "string" && payload.cwd.trim()) {
    roots.add(resolve(payload.cwd));
  }

  if (!roots.size) {
    roots.add(process.cwd());
  }

  const dirs = [...roots].flatMap((root) =>
    listObjectives(root).map((entry) => entry.dirPath),
  );
  if (!slug) {
    return dirs;
  }
  return dirs.filter((dir) => basename(dir) === slug);
}

function pickSingleObjectiveDir(
  dirs: string[],
  payload: Record<string, unknown>,
): string[] {
  const activeDirs = dirs.filter((dir) => objectiveHasStatus(dir, "active"));
  if (activeDirs.length === 1) {
    return activeDirs;
  }

  if (typeof payload.task_id === "string" && /^T\d{3}$/.test(payload.task_id)) {
    const taskId = payload.task_id;
    const matching = dirs.filter((dir) => objectiveHasActiveTask(dir, taskId));
    if (matching.length === 1) {
      return matching;
    }
  }

  return [];
}

function objectiveHasStatus(objectiveDir: string, status: string): boolean {
  try {
    return loadState(basename(objectiveDir), resolve(objectiveDir, "..", "..", "..")).state.objective.status === status;
  } catch {
    return false;
  }
}

function objectiveHasActiveTask(objectiveDir: string, taskId: string): boolean {
  try {
    const workspaceRoot = resolve(objectiveDir, "..", "..", "..");
    const state = loadState(basename(objectiveDir), workspaceRoot).state;
    return state.active_task === taskId
      && state.tasks.some((entry) => entry.id === taskId && entry.status === "active");
  } catch {
    return false;
  }
}
