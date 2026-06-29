import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateObjectiveState } from "../state/objective-state.mjs";
import { listObjectives } from "../db/state-repository.mjs";
import { logicalBoardPath } from "../db/connection.mjs";

const DEFAULT_STALE_DAYS = 7;

export interface StaleObjectiveEntry {
  state_path: string;
  board_path: string;
  objective_dir: string;
  slug: string | undefined;
  objective_status: string | null;
  active_task: string | null;
  stale_days: number;
  last_activity_ms: number;
  reasons: string[];
  suggestions: string[];
}

export interface FindStaleObjectivesResult {
  stale_days: number;
  scanned_roots: string[];
  objectives: StaleObjectiveEntry[];
}

export function resolveObjectiveStatePath(objectiveDir: string): string | null {
  const root = resolve(objectiveDir);
  const slug = root.split(/[/\\]/).pop();
  if (!slug) return null;
  return logicalBoardPath(slug);
}

export function discoverObjectiveStatePaths(roots: string[] = []): string[] {
  const paths = new Set<string>();
  for (const root of roots) {
    const resolvedRoot = resolve(root);
    for (const entry of listObjectives(resolvedRoot)) {
      paths.add(logicalBoardPath(entry.slug));
    }
  }
  return [...paths];
}

function findBlockedTasksInState(validation: ReturnType<typeof validateObjectiveState>): string[] {
  if (!validation.active_task) return [];
  return validation.objective_status === "blocked" ? [validation.active_task] : [];
}

export function findStaleObjectives(options: {
  days?: number;
  roots?: string[];
} = {}): FindStaleObjectivesResult {
  const staleDays = Number(options.days) > 0 ? Number(options.days) : DEFAULT_STALE_DAYS;
  const staleMs = staleDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const roots = options.roots?.length ? options.roots : [process.cwd()];
  const objectives: StaleObjectiveEntry[] = [];

  for (const root of roots) {
    const resolvedRoot = resolve(root);
    for (const entry of listObjectives(resolvedRoot)) {
      const boardPath = logicalBoardPath(entry.slug);
      const objectiveDir = entry.dirPath;
      const validation = validateObjectiveState(entry.slug, resolvedRoot);
      const updatedAt = entry.updatedAt ? Date.parse(entry.updatedAt) : now;
      const notesDir = join(objectiveDir, "notes");
      let notesMtimeMs = updatedAt;
      if (existsSync(notesDir)) {
        for (const note of readdirSync(notesDir)) {
          const notePath = join(notesDir, note);
          if (!statSync(notePath).isFile()) continue;
          notesMtimeMs = Math.max(notesMtimeMs, statSync(notePath).mtimeMs);
        }
      }

      const ageMs = now - notesMtimeMs;
      const blockedTasks = findBlockedTasksInState(validation);
      const reasons: string[] = [];

      if (validation.objective_status !== "done" && ageMs >= staleMs) {
        reasons.push(`no database or notes changes in ${staleDays} days`);
      }
      if (blockedTasks.length > 0) {
        reasons.push(`blocked tasks: ${blockedTasks.join(", ")}`);
      }

      if (reasons.length === 0) continue;

      objectives.push({
        state_path: boardPath,
        board_path: boardPath,
        objective_dir: objectiveDir,
        slug: entry.slug,
        objective_status: validation.objective_status,
        active_task: validation.active_task,
        stale_days: staleDays,
        last_activity_ms: ageMs,
        reasons,
        suggestions: [
          "Run /objective with session_resume_digest to resume.",
          validation.ok ? "Validation is ok; inspect blocked tasks or receipts." : "Fix validation errors before continuing.",
        ],
      });
    }
  }

  return {
    stale_days: staleDays,
    scanned_roots: roots.map((root) => resolve(root)),
    objectives,
  };
}
