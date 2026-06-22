#!/usr/bin/env node
/**
 * Migrate GoalBuddy / 2.x objective boards to Cursor Curator 3.0 schema.
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

const LEGACY_REPLACEMENTS = [
  ["goalbuddy-cursor-port", "cursor-curator"],
  ["goalbuddy_receipt_v1", "cursor_curator_receipt_v1"],
  ["GOALBUDDY_", "CURATOR_"],
  [".goalbuddy-board", ".cursor-curator-board"],
  [".goalbuddy-port.json", ".cursor-curator-port.json"],
  [".goalbuddy-install.json", ".cursor-curator-install.json"],
  ["goalbuddy.localhost", "curator.localhost"],
  ["goalbuddy-mark.png", "curator-mark.png"],
  ["scripts/goalbuddy.mjs", "scripts/curator.mjs"],
  ["goalbuddy.mjs", "curator.mjs"],
  ["skills/goalbuddy", "skills/cursor-curator"],
  ["goal-prep", "objective-prep"],
  ["goal-judge", "objective-approval-gate"],
  ["goal_judge", "objective_approval_gate"],
  ["type: judge", "type: approval_gate"],
  ["assignee: Judge", "assignee: Approval Gate"],
  ["agents.judge", "agents.approval_gate"],
  ["  judge:", "  approval_gate:"],
  ["goal_pressure_requires_oracle", "goal_pressure_requires_success_criteria"],
  ["judge_picks_largest_safe_slice", "approval_gate_picks_largest_safe_slice"],
  ["no_completion_without_judge_or_pm_audit", "no_completion_without_approval_gate_or_pm_audit"],
  ["ambiguity_requiring_judge", "ambiguity_requiring_approval_gate"],
  ["needs_judge", "needs_approval_gate"],
  ['role: "judge"', 'role: "approval_gate"'],
  ["role: judge", "role: approval_gate"],
];

function migrateYamlText(text) {
  let out = text;
  for (const [from, to] of LEGACY_REPLACEMENTS) {
    out = out.split(from).join(to);
  }

  if (/\n\s{2}oracle:\s*\n/.test(out) && !/\n\s{2}success_criteria:\s*\n/.test(out)) {
    out = out.replace(/\n(\s{2})oracle:\s*\n/g, "\n$1success_criteria:\n");
  }

  return out;
}

function migrateMarkdownText(text) {
  let out = text;
  for (const [from, to] of LEGACY_REPLACEMENTS) {
    out = out.split(from).join(to);
  }
  out = out
    .split("GoalBuddy")
    .join("Cursor Curator")
    .split("goalbuddy")
    .join("cursor-curator");
  return out;
}

function migrateGoalDir(goalDir, { dryRun = false } = {}) {
  const root = resolve(goalDir);
  const changes = [];

  const statePath = join(root, "state.yaml");
  if (existsSync(statePath)) {
    const before = readFileSync(statePath, "utf8");
    const after = migrateYamlText(before);
    if (after !== before) {
      if (!dryRun) writeFileSync(statePath, after, "utf8");
      changes.push("state.yaml");
    }
  }

  for (const name of ["objective.md"]) {
    const filePath = join(root, name);
    if (!existsSync(filePath)) continue;
    const before = readFileSync(filePath, "utf8");
    const after = migrateMarkdownText(before);
    if (after !== before) {
      if (!dryRun) writeFileSync(filePath, after, "utf8");
      changes.push(name);
    }
  }

  const notesDir = join(root, "notes");
  if (existsSync(notesDir) && statSync(notesDir).isDirectory()) {
    for (const note of readdirSync(notesDir)) {
      const notePath = join(notesDir, note);
      if (!statSync(notePath).isFile()) continue;
      const before = readFileSync(notePath, "utf8");
      const after = migrateMarkdownText(before);
      if (after !== before) {
        if (!dryRun) writeFileSync(notePath, after, "utf8");
        changes.push(`notes/${note}`);
      }
      if (/-judge\.md$/i.test(note)) {
        const renamed = note.replace(/-judge\.md$/i, "-approval-gate.md");
        const dest = join(notesDir, renamed);
        if (!dryRun && !existsSync(dest)) renameSync(notePath, dest);
        changes.push(`notes/${note} -> notes/${renamed}`);
      }
    }
  }

  const legacyBoard = join(root, ".goalbuddy-board");
  const newBoard = join(root, ".cursor-curator-board");
  if (existsSync(legacyBoard) && !existsSync(newBoard)) {
    if (!dryRun) renameSync(legacyBoard, newBoard);
    changes.push(".goalbuddy-board -> .cursor-curator-board");
  }

  const subgoalsDir = join(root, "subgoals");
  if (existsSync(subgoalsDir) && statSync(subgoalsDir).isDirectory()) {
    for (const child of readdirSync(subgoalsDir)) {
      const childDir = join(subgoalsDir, child);
      if (statSync(childDir).isDirectory()) {
        changes.push(...migrateGoalDir(childDir, { dryRun }));
      }
    }
  }

  return changes;
}

function discoverObjectiveDirs(roots) {
  const dirs = new Set();
  for (const root of roots) {
    const goalsRoot = join(resolve(root), "docs", "goals");
    if (!existsSync(goalsRoot)) continue;
    for (const entry of readdirSync(goalsRoot)) {
      const goalDir = join(goalsRoot, entry);
      if (existsSync(join(goalDir, "state.yaml"))) dirs.add(goalDir);
    }
  }
  return [...dirs];
}

export function runMigrate(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const paths = options.paths?.length
    ? options.paths.map((p) => resolve(p))
    : discoverObjectiveDirs(options.roots || [process.cwd()]);

  const report = [];
  for (const goalDir of paths) {
    const changes = migrateGoalDir(goalDir, { dryRun });
    if (changes.length) report.push({ objective_dir: goalDir, changes });
  }

  if (basename(resolve(paths[0] || process.cwd())) === "goalbuddy-cursor-port") {
    const parent = dirname(resolve(paths[0]));
    const dest = join(parent, "cursor-curator");
    if (!dryRun && existsSync(paths[0]) && !existsSync(dest)) {
      renameSync(paths[0], dest);
      report.push({ objective_dir: paths[0], changes: ["renamed directory to cursor-curator"] });
    }
  }

  return { dry_run: dryRun, migrated: report.length, goals: report };
}

function parseArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  const pathFlag = argv.indexOf("--path");
  const paths = pathFlag >= 0 ? [argv[pathFlag + 1]].filter(Boolean) : [];
  return { dryRun, paths };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("migrate-3.0.mjs")) {
  const { dryRun, paths } = parseArgs(process.argv.slice(2));
  const result = runMigrate({ dryRun, paths: paths.length ? paths : undefined });
  console.log(JSON.stringify(result, null, 2));
  if (dryRun) console.log("\n(dry run — no files written)");
}
