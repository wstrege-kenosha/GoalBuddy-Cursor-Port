#!/usr/bin/env node
/** User-facing goal → Objective terminology (keeps paths, /goal, objective.md, YAML objective:). */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const SKIP = new Set(["node_modules", ".git", "rebrand-3.0", "goal-to-objective"]);
const EXT = new Set([".mjs", ".md", ".yaml", ".yml", ".json", ".html"]);

const REPLACEMENTS = [
  ["objectiveEyebrow", "objectiveEyebrow"],
  ['id="objective-eyebrow"', 'id="objective-eyebrow"'],
  ['getElementById("objective-eyebrow")', 'getElementById("objective-eyebrow")'],
  ["objectiveEyebrowEl", "objectiveEyebrowEl"],
  ['aria-label="Objective task board"', 'aria-label="Objective task board"'],
  [">Objective</p>", ">Objective</p>"],
  ["Untitled objective", "Untitled objective"],
  ["untitled-objective", "untitled-objective"],
  ["Objective state must be", "Objective state must be"],
  ["Objective state has more", "Objective state has more"],
  ["Objective state is empty", "Objective state is empty"],
  ["Missing objective metadata", "Missing objective metadata"],
  ["Missing objective root", "Missing objective root"],
  ["objective slug or path is required", "objective slug or path is required"],
  ["Objective path must stay", "Objective path must stay"],
  ["Objective slug (", "Objective slug ("],
  ["Objective slug or path", "Objective slug or path"],
  ["objective slug (", "objective slug ("],
  ["objective slug across", "objective slug across"],
  ["objective slug automatically", "objective slug automatically"],
  ["objective slug, like", "objective slug, like"],
  ["objective slug; omit", "objective slug; omit"],
  ["resolves from objective slug", "resolves from objective slug"],
  ["read-only objective board tools", "read-only objective board tools"],
  ["List objectives under", "List objectives under"],
  ["for all objectives in", "for all objectives in"],
  ["objective board tools", "objective board tools"],
  ["objective board active_task", "objective board active_task"],
  ["objective board", "objective board"],
  ["objective boards", "objective boards"],
  ["objective directory", "objective directory"],
  ["the objective board", "the objective board"],
  ["re-reads the objective board", "re-reads the objective board"],
  ["No objective boards needed", "No objective boards needed"],
  ["Multi-objective hub", "Multi-objective hub"],
  ["multi-objective hub", "multi-objective hub"],
  ["multi-objective dashboard", "multi-objective dashboard"],
  ["Multiple objective boards", "Multiple objective boards"],
  ["Smoke objective", "Smoke objective"],
  ["smoke objective", "smoke objective"],
  ["Scaffold a new objective", "Scaffold a new objective"],
  ["create an objective in", "create an objective in"],
  ["contains the objective", "contains the objective"],
  ["the objective's repo", "the objective's repo"],
  ["Every objective needs", "Every objective needs"],
  ["The objective does not", "The objective does not"],
  ["no serious objective", "no serious objective"],
  ["weak objectives", "weak objectives"],
  ["keep the objective pressured", "keep the objective pressured"],
  ["mark the objective complete", "mark the objective complete"],
  ["move the objective toward", "move the objective toward"],
  ["v2 objective roots", "v2 objective roots"],
  ["inside the objective root", "inside the objective root"],
  ["parent objective root", "parent objective root"],
  ["Objective Prep", "Objective Prep"],
  ["objective charter", "objective charter"],
  ["wants a objective board", "wants an objective board"],
  ["For vague objectives,", "For vague objectives,"],
  ["objective path or charter", "objective path or charter"],
  ["the objective slug", "the objective slug"],
  ["Determine the objective directory", "Determine the objective directory"],
  ["Subobjective board", "Sub-objective board"],
  ["Sub-objective sketch", "Sub-objective sketch"],
  ['"Sub-objective"', '"Sub-objective"'],
  ["`Sub-objective `", "`Sub-objective `"],
  ["Sub-objective ", "Sub-objective "],
  ["sub-objective ", "sub-objective "],
  ["sub-objectives", "sub-objectives"],
  ["Sub-objectives", "Sub-objectives"],
  ["depth-1 sub-objective", "depth-1 sub-objective"],
  ["child sub-objectives", "child sub-objectives"],
  ["depth-1 sub-objective", "depth-1 sub-objective"],
  ["# Sub-objectives", "# Sub-objectives"],
  ["objective board,", "objective board,"],
  ["printed objective path", "printed objective path"],
  ["Single objective", "Single objective"],
  ["with an objective:", "with an objective:"],
  ["GoalBuddy / 2.x objective boards", "GoalBuddy / 2.x objective boards"],
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (EXT.has(extname(name))) files.push(p);
  }
  return files;
}

let n = 0;
for (const file of walk(ROOT)) {
  if (file.includes(".cursor-curator-board") && file.endsWith(".html")) continue;
  if (file.includes(".cursor-curator-board") && file.endsWith("app.js")) continue;
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
