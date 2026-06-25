import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateObjectiveState } from "../state/objective-state.mjs";

const DEFAULT_STALE_DAYS = 7;

export interface StaleObjectiveEntry {
  state_path: string;
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
  const jsonPath = join(root, "state.json");
  if (existsSync(jsonPath)) return jsonPath;
  return null;
}

export function discoverObjectiveStatePaths(roots: string[] = []): string[] {
  const paths = new Set<string>();
  for (const root of roots) {
    const objectivesRoot = join(resolve(root), "docs", "objectives");
    if (!existsSync(objectivesRoot)) continue;
    for (const entry of readdirSync(objectivesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith("_")) continue;
      const statePath = resolveObjectiveStatePath(join(objectivesRoot, entry.name));
      if (statePath) paths.add(statePath);
    }
  }
  return [...paths];
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

  for (const statePath of discoverObjectiveStatePaths(roots)) {
    const objectiveDir = resolve(statePath, "..");
    const stateStat = statSync(statePath);
    const validation = validateObjectiveState(statePath);
    const notesDir = join(objectiveDir, "notes");
    let notesMtimeMs = stateStat.mtimeMs;
    if (existsSync(notesDir)) {
      for (const note of readdirSync(notesDir)) {
        const notePath = join(notesDir, note);
        if (!statSync(notePath).isFile()) continue;
        notesMtimeMs = Math.max(notesMtimeMs, statSync(notePath).mtimeMs);
      }
    }

    const ageMs = now - Math.max(stateStat.mtimeMs, notesMtimeMs);
    const blockedTasks = findBlockedTasksInText(readFileSync(statePath, "utf8"));
    const reasons: string[] = [];

    if (validation.objective_status !== "done" && ageMs >= staleMs) {
      reasons.push(`no state or notes changes in ${staleDays} days`);
    }
    if (blockedTasks.length > 0) {
      reasons.push(`blocked tasks: ${blockedTasks.join(", ")}`);
    }
    if (validation.objective_status === "active" && validation.active_task && ageMs >= staleMs) {
      reasons.push(`active task ${validation.active_task} unchanged for ${staleDays}+ days`);
    }

    if (reasons.length === 0) continue;

    objectives.push({
      state_path: statePath,
      objective_dir: objectiveDir,
      slug: objectiveDir.split(/[/\\]/).pop(),
      objective_status: validation.objective_status,
      active_task: validation.active_task,
      stale_days: staleDays,
      last_activity_ms: Math.max(stateStat.mtimeMs, notesMtimeMs),
      reasons,
      suggestions: suggestRecovery(validation, blockedTasks),
    });
  }

  return {
    stale_days: staleDays,
    scanned_roots: roots.map((root) => resolve(root)),
    objectives,
  };
}

export function findBlockedTasksInText(text: string): string[] {
  const tasks: string[] = [];
  const lines = text.split(/\r?\n/);
  let currentId: string | null = null;
  for (const line of lines) {
    const idMatch = line.match(/^\s{2}-\s+id:\s*(.+?)\s*$/);
    if (idMatch) currentId = idMatch[1].trim();
    const statusMatch = line.match(/^\s{4}status:\s*(.+?)\s*$/);
    if (statusMatch && statusMatch[1].trim() === "blocked" && currentId) {
      tasks.push(currentId);
    }
  }
  return tasks;
}

function suggestRecovery(
  validation: { warnings?: string[]; objective_status?: string | null },
  blockedTasks: string[],
): string[] {
  const suggestions: string[] = [];
  if (blockedTasks.length > 0) {
    suggestions.push("Run Approval Gate triage on blocked tasks or convert blockers into PM credential/decision tasks.");
  }
  if (validation.warnings?.some((warning) => warning.includes("success_criteria"))) {
    suggestions.push("Strengthen objective.success_criteria.signal and final_proof before continuing Worker slices.");
  }
  if (validation.objective_status === "active") {
    suggestions.push("Re-run /objective on the active task or run curator stale after unblocking.");
  }
  return suggestions;
}
