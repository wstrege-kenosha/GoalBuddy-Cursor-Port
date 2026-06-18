import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { discoverGoalStatePaths } from "./goal-stale.mjs";

export function appendSessionNote(options = {}) {
  const workspaceRoot = resolve(options.workspaceRoot || process.cwd());
  const goalsRoot = join(workspaceRoot, "docs", "goals");
  if (!existsSync(goalsRoot)) {
    return { ok: true, skipped: "no docs/goals", appended: [] };
  }

  const timestamp = options.timestamp || new Date().toISOString();
  const summary = String(options.summary || options.status || "Agent session ended").trim();
  const taskId = options.task_id ? String(options.task_id) : null;
  const goalSlug = options.goal_slug ? String(options.goal_slug) : null;

  const lines = [
    "",
    `## ${timestamp}`,
    `- summary: ${summary}`,
  ];
  if (taskId) lines.push(`- task: ${taskId}`);

  const statePaths = discoverGoalStatePaths([workspaceRoot]).filter((statePath) => {
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
      appendFileSync(sessionPath, "# GoalBuddy session log\n", "utf8");
    }
    appendFileSync(sessionPath, `${lines.join("\n")}\n`, "utf8");
    appended.push(sessionPath);
  }

  return { ok: true, appended, summary, timestamp };
}
