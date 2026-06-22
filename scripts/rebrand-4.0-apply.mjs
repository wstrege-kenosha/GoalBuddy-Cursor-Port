#!/usr/bin/env node
/** Cursor Curator 4.0 structural rebrand: docs/objectives, objective:, /objective */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const SKIP = new Set(["node_modules", ".git", "rebrand-3.0", "rebrand-4.0", "goal-to-objective"]);

const REPLACEMENTS = [
  ["docs/goals/", "docs/objectives/"],
  ["docs\\\\goals\\\\", "docs\\\\objectives\\\\"],
  ["goal.md", "objective.md"],
  ["goal-board.md", "objective-board.md"],
  ["/goal-board", "/objective-board"],
  ["# goal-board", "# objective-board"],
  ["# goal\n", "# objective\n"],
  ["list_goals", "list_objectives"],
  ["get_goal_state", "get_objective_state"],
  ["toolListGoals", "toolListObjectives"],
  ["toolGetGoalState", "toolGetObjectiveState"],
  ["goalRootsForList", "objectiveRootsForList"],
  ["hasGoalsDir", "hasObjectivesDir"],
  ["discoverGoalStatePaths", "discoverObjectiveStatePaths"],
  ["discoverGoalDirs", "discoverObjectiveDirs"],
  ["resolveGoalStatePath", "resolveObjectiveStatePath"],
  ["resolveGoalDir", "resolveObjectiveDir"],
  ["resolveWorkspaceForGoal", "resolveWorkspaceForObjective"],
  ["goal_slug", "objective_slug"],
  ["goal_root", "objective_root"],
  ["goal_dir", "objective_dir"],
  ["goal_count", "objective_count"],
  ["goal_status", "objective_status"],
  ["goalRootsForList", "objectiveRootsForList"],
  ["goalRoot:", "objectiveRoot:"],
  ["goalRoot:", "objectiveRoot:"],
  ["goalRoot ", "objectiveRoot "],
  ["goalRoot}", "objectiveRoot}"],
  ["goalRoot,", "objectiveRoot,"],
  ["goalRoot =", "objectiveRoot ="],
  ["args.goal", "args.objective"],
  ["options.goal", "options.objective"],
  ["goal:", "objective:"],
  ["goal.success_criteria", "objective.success_criteria"],
  ["goal.status", "objective.status"],
  ["goal.intake", "objective.intake"],
  ["goal.slug", "objective.slug"],
  ["goal.title", "objective.title"],
  ["goal.kind", "objective.kind"],
  ["goal.tranche", "objective.tranche"],
  ["goal.full_outcome_complete", "objective.full_outcome_complete"],
  ["goal.first_milestone_complete", "objective.first_milestone_complete"],
  ["nestedScalar(\"goal\"", "nestedScalar(\"objective\""],
  ["nestedScalar(text, \"goal\"", "nestedScalar(text, \"objective\""],
  ["pathScalar([\"goal\"", "pathScalar([\"objective\""],
  ["pathScalar(text, [\"goal\"", "pathScalar(text, [\"objective\""],
  ["findNestedScalar(text, \"goal\"", "findNestedScalar(text, \"objective\""],
  ["replaceNestedScalar(text, \"goal\"", "replaceNestedScalar(text, \"objective\""],
  ["document.goal", "document.objective"],
  ["board.goal", "board.objective"],
  ["loadBoard(statePath).goal", "loadBoard(statePath).objective"],
  ["goal_success_criteria: board.goal", "goal_success_criteria: board.objective"],
  ["check-goal-state", "check-objective-state"],
  ["--goal-ready", "--objective-ready"],
  ["doctor --goal-ready", "doctor --objective-ready"],
  ["missing docs/goals/", "missing docs/objectives/"],
  ["under docs/goals/", "under docs/objectives/"],
  ["under docs/goals:", "under docs/objectives:"],
  ["stay under docs/goals/", "stay under docs/objectives/"],
  ["v2 objective roots may contain only goal.md", "v2 objective roots may contain only objective.md"],
  ["only goal.md,", "only objective.md,"],
  ["Follow docs/objectives/<slug>/goal.md", "Follow docs/objectives/<slug>/objective.md"],
  ["printed objective path", "printed objective path"],
  ["get_goal_state", "get_objective_state"],
  ["MCP tools: `list_goals`", "MCP tools: `list_objectives`"],
  ["`get_goal_state`", "`get_objective_state`"],
  ["/goal ", "/objective "],
  ["/goal.", "/objective."],
  ["/goal`", "/objective`"],
  ["/goal\n", "/objective\n"],
  ["`/goal`", "`/objective`"],
  ["| `/goal`", "| `/objective`"],
  ["via `/goal`", "via `/objective`"],
  ["use `/goal`", "use `/objective`"],
  ["Run `/goal`", "Run `/objective`"],
  ["then /goal", "then /objective"],
  ["and /goal", "and /objective"],
  ["PM `/goal`", "PM `/objective`"],
  ["Manual `/goal`", "Manual `/objective`"],
  ["each `/goal`", "each `/objective`"],
  ["start `/goal`", "start `/objective`"],
  ["Re-run /goal", "Re-run /objective"],
  ["before /goal", "before /objective"],
  ["after /goal", "after /objective"],
  ["through /goal", "through /objective"],
  ["`/goal,", "`/objective,"],
  ["commands/goal.md", "commands/objective.md"],
  ["commands-src/goal.md", "commands-src/objective.md"],
  ["goal-prompt.txt", "objective-prompt.txt"],
  ["migrate-3.0", "migrate-3.0"],
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if ([".mjs", ".md", ".yaml", ".yml", ".json", ".txt", ".html", ".gitignore"].includes(extname(name)) || name === ".gitignore") {
      files.push(p);
    }
  }
  return files;
}

let n = 0;
for (const file of walk(ROOT)) {
  if (file.includes("rebrand-4.0-apply.mjs")) continue;
  if (file.includes(".cursor-curator-board") && (file.endsWith(".html") || file.endsWith("app.js"))) continue;
  let t = readFileSync(file, "utf8");
  const b = t;
  for (const [from, to] of REPLACEMENTS) t = t.split(from).join(to);
  if (t !== b) {
    writeFileSync(file, t, "utf8");
    n++;
    console.log(file.replace(ROOT, ""));
  }
}
console.log(`\n${n} files updated.`);
