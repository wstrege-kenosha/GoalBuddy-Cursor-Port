#!/usr/bin/env node
/**
 * Migrate Cursor Curator 3.0 objective boards to 4.0 structural schema.
 * - docs/goals/ → docs/objectives/
 * - goal.md → objective.md
 * - YAML root goal: → objective:
 * - Path and command references (/goal → /objective, docs/goals → docs/objectives)
 */
import {
  existsSync,
  readFileSync,
  renameSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const TEXT_EXTENSIONS = new Set([".md", ".yaml", ".yml", ".json", ".txt", ".mjs", ".html", ".js", ".css"]);

const PATH_REPLACEMENTS = [
  ["docs/goals/", "docs/objectives/"],
  ["docs\\goals\\", "docs\\objectives\\"],
  ["goal.md", "objective.md"],
  ["/goal-board", "/objective-board"],
  ["`/goal`", "`/objective`"],
  ["/goal ", "/objective "],
  ["/goal\n", "/objective\n"],
  ["check-goal-state", "check-objective-state"],
  ["list_goals", "list_objectives"],
  ["get_goal_state", "get_objective_state"],
  ["goal-approval-gate", "objective-approval-gate"],
  ["goal-scout", "objective-scout"],
  ["goal-worker", "objective-worker"],
  ["goal_approval_gate", "objective_approval_gate"],
  ["goal_scout", "objective_scout"],
  ["goal_worker", "objective_worker"],
  ["curator-prep", "objective-prep"],
  ["/curator-prep", "/objective-prep"],
  ["curator-prep/", "objective-prep/"],
  ["curator-prep.md", "objective-prep.md"],
];

function migrateYamlRootKey(text) {
  return text.replace(/^goal:\s*$/m, "objective:");
}

function migrateText(text) {
  let out = migrateYamlRootKey(text);
  for (const [from, to] of PATH_REPLACEMENTS) {
    out = out.split(from).join(to);
  }
  if (out.includes('"goal":') && out.includes("board-snapshot")) {
    out = out.replace(/"goal":\s*\{/g, '"objective": {');
  }
  return out;
}

function migrateObjectiveDir(objectiveDir, { dryRun = false } = {}) {
  const root = resolve(objectiveDir);
  const changes = [];

  const legacyGoalMd = join(root, "goal.md");
  const objectiveMd = join(root, "objective.md");
  if (existsSync(legacyGoalMd) && !existsSync(objectiveMd)) {
    if (!dryRun) renameSync(legacyGoalMd, objectiveMd);
    changes.push("goal.md -> objective.md");
  }

  const statePath = join(root, "state.yaml");
  if (existsSync(statePath)) {
    const before = readFileSync(statePath, "utf8");
    const after = migrateText(before);
    if (after !== before) {
      if (!dryRun) writeFileSync(statePath, after, "utf8");
      changes.push("state.yaml");
    }
  }

  if (existsSync(objectiveMd)) {
    const before = readFileSync(objectiveMd, "utf8");
    const after = migrateText(before);
    if (after !== before) {
      if (!dryRun) writeFileSync(objectiveMd, after, "utf8");
      changes.push("objective.md");
    }
  }

  const notesDir = join(root, "notes");
  if (existsSync(notesDir) && statSync(notesDir).isDirectory()) {
    for (const note of readdirSync(notesDir)) {
      const notePath = join(notesDir, note);
      if (!statSync(notePath).isFile()) continue;
      const before = readFileSync(notePath, "utf8");
      const after = migrateText(before);
      if (after !== before) {
        if (!dryRun) writeFileSync(notePath, after, "utf8");
        changes.push(`notes/${note}`);
      }
    }
  }

  const boardDir = join(root, ".cursor-curator-board");
  if (existsSync(boardDir) && statSync(boardDir).isDirectory()) {
    for (const file of readdirSync(boardDir)) {
      const filePath = join(boardDir, file);
      if (!statSync(filePath).isFile()) continue;
      const ext = file.slice(file.lastIndexOf("."));
      if (!TEXT_EXTENSIONS.has(ext)) continue;
      const before = readFileSync(filePath, "utf8");
      const after = migrateText(before);
      if (after !== before) {
        if (!dryRun) writeFileSync(filePath, after, "utf8");
        changes.push(`.cursor-curator-board/${file}`);
      }
    }
  }

  const subgoalsDir = join(root, "subgoals");
  if (existsSync(subgoalsDir) && statSync(subgoalsDir).isDirectory()) {
    for (const child of readdirSync(subgoalsDir)) {
      const childDir = join(subgoalsDir, child);
      if (statSync(childDir).isDirectory()) {
        changes.push(...migrateObjectiveDir(childDir, { dryRun }));
      }
    }
  }

  return changes;
}

function migrateWorkspaceRoot(workspaceRoot, { dryRun = false } = {}) {
  const root = resolve(workspaceRoot);
  const changes = [];
  const legacyGoals = join(root, "docs", "goals");
  const objectives = join(root, "docs", "objectives");

  if (existsSync(legacyGoals) && !existsSync(objectives)) {
    if (!dryRun) renameSync(legacyGoals, objectives);
    changes.push("docs/goals -> docs/objectives");
  }

  const objectivesRoot = existsSync(objectives) ? objectives : legacyGoals;
  if (!existsSync(objectivesRoot)) return changes;

  for (const entry of readdirSync(objectivesRoot)) {
    const objectiveDir = join(objectivesRoot, entry);
    if (!statSync(objectiveDir).isDirectory()) continue;
    if (!existsSync(join(objectiveDir, "state.yaml"))) continue;
    const dirChanges = migrateObjectiveDir(objectiveDir, { dryRun });
    if (dirChanges.length) {
      changes.push({ objective_dir: objectiveDir, changes: dirChanges });
    }
  }

  return changes;
}

function discoverWorkspaceRoots(roots) {
  const discovered = new Set();
  for (const root of roots) {
    discovered.add(resolve(root));
  }
  return [...discovered];
}

export function runMigrate(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const roots = discoverWorkspaceRoots(options.roots || [process.cwd()]);
  const report = [];

  for (const root of roots) {
    const changes = migrateWorkspaceRoot(root, { dryRun });
    const objectiveDirs = changes.filter((entry) => entry?.objective_dir);
    if (changes.includes("docs/goals -> docs/objectives") || objectiveDirs.length) {
      report.push({ workspace_root: root, changes });
    }
  }

  return { dry_run: dryRun, migrated: report.length, objectives: report };
}

function parseArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  const pathFlag = argv.indexOf("--path");
  const paths = pathFlag >= 0 ? [argv[pathFlag + 1]].filter(Boolean) : [];
  return { dryRun, paths };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("migrate-4.0.mjs")) {
  const { dryRun, paths } = parseArgs(process.argv.slice(2));
  const result = paths.length
    ? { dry_run: dryRun, migrated: 0, objectives: paths.map((p) => ({ objective_dir: resolve(p), changes: migrateObjectiveDir(p, { dryRun }) })).filter((e) => e.changes.length) }
    : runMigrate({ dryRun });
  console.log(JSON.stringify(result, null, 2));
  if (dryRun) console.log("\n(dry run — no files written)");
}
