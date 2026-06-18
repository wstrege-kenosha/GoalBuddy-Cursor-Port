import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateGoalState } from "./goal-state.mjs";

const DEFAULT_STALE_DAYS = 7;

export function discoverGoalStatePaths(roots = []) {
  const paths = new Set();
  for (const root of roots) {
    const goalsRoot = join(resolve(root), "docs", "goals");
    if (!existsSync(goalsRoot)) continue;
    for (const entry of readdirSync(goalsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith("_")) continue;
      const statePath = join(goalsRoot, entry.name, "state.yaml");
      if (existsSync(statePath)) paths.add(statePath);
    }
  }
  return [...paths];
}

export function findStaleGoals(options = {}) {
  const staleDays = Number(options.days) > 0 ? Number(options.days) : DEFAULT_STALE_DAYS;
  const staleMs = staleDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const roots = options.roots?.length ? options.roots : [process.cwd()];
  const goals = [];

  for (const statePath of discoverGoalStatePaths(roots)) {
    const goalDir = resolve(statePath, "..");
    const stateStat = statSync(statePath);
    const validation = validateGoalState(statePath);
    const notesDir = join(goalDir, "notes");
    let notesMtimeMs = stateStat.mtimeMs;
    if (existsSync(notesDir)) {
      for (const note of readdirSync(notesDir)) {
        const notePath = join(notesDir, note);
        if (!statSync(notePath).isFile()) continue;
        notesMtimeMs = Math.max(notesMtimeMs, statSync(notePath).mtimeMs);
      }
    }

    const ageMs = now - Math.max(stateStat.mtimeMs, notesMtimeMs);
    const blockedTasks = findBlockedTasks(readFileSync(statePath, "utf8"));
    const reasons = [];

    if (validation.goal_status !== "done" && ageMs >= staleMs) {
      reasons.push(`no state or notes changes in ${staleDays} days`);
    }
    if (blockedTasks.length > 0) {
      reasons.push(`blocked tasks: ${blockedTasks.join(", ")}`);
    }
    if (validation.goal_status === "active" && validation.active_task && ageMs >= staleMs) {
      reasons.push(`active task ${validation.active_task} unchanged for ${staleDays}+ days`);
    }

    if (reasons.length === 0) continue;

    goals.push({
      state_path: statePath,
      goal_dir: goalDir,
      slug: goalDir.split(/[/\\]/).pop(),
      goal_status: validation.goal_status,
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
    goals,
  };
}

function findBlockedTasks(text) {
  const tasks = [];
  const lines = text.split(/\r?\n/);
  let currentId = null;
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

function suggestRecovery(validation, blockedTasks) {
  const suggestions = [];
  if (blockedTasks.length > 0) {
    suggestions.push("Run Judge triage on blocked tasks or convert blockers into PM credential/decision tasks.");
  }
  if (validation.warnings?.some((warning) => warning.includes("oracle"))) {
    suggestions.push("Strengthen goal.oracle.signal and final_proof before continuing Worker slices.");
  }
  if (validation.goal_status === "active") {
    suggestions.push("Re-run /goal on the active task or run goalbuddy stale after unblocking.");
  }
  return suggestions;
}
