#!/usr/bin/env node
/**
 * One-time bulk text replacements for Cursor Curator 3.0 rebrand.
 * Run from repo root: node scripts/rebrand-3.0-apply.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "curator-mark.png",
  "goalbuddy-mark.png",
]);

const TEXT_EXT = new Set([
  ".mjs", ".js", ".json", ".md", ".yaml", ".yml", ".txt", ".gitignore", ".cmd",
]);

/** Order matters: longer / more specific patterns first. */
const REPLACEMENTS = [
  ["goalbuddy-cursor-port", "cursor-curator"],
  ["GoalBuddy-Cursor-Port", "Cursor-Curator"],
  ["GoalBuddy Cursor Port", "Cursor Curator"],
  ["goalbuddy_receipt_v1", "cursor_curator_receipt_v1"],
  ["GOALBUDDY_TEST_NPM_LATEST_VERSION", "CURATOR_TEST_NPM_LATEST_VERSION"],
  ["GOALBUDDY_LOCAL_BOARD_SETTINGS_PATH", "CURATOR_LOCAL_BOARD_SETTINGS_PATH"],
  ["GOALBUDDY_WORKSPACE_FORCE", "CURATOR_WORKSPACE_FORCE"],
  ["GOALBUDDY_WORKSPACE", "CURATOR_WORKSPACE"],
  ["GOALBUDDY_SKILL_ROOT", "CURATOR_SKILL_ROOT"],
  ["GOALBUDDY_REPO_ROOT", "CURATOR_REPO_ROOT"],
  ["__GOALBUDDY_GLOBSTAR__", "__CURATOR_GLOBSTAR__"],
  [".goalbuddy-board", ".cursor-curator-board"],
  [".goalbuddy-port.json", ".cursor-curator-port.json"],
  [".goalbuddy-install.json", ".cursor-curator-install.json"],
  ["~/.goalbuddy/", "~/.cursor-curator/"],
  ["~/.goalbuddy", "~/.cursor-curator"],
  ["goalbuddy.localBoardSettings.v1", "cursor-curator.localBoardSettings.v1"],
  ["goalbuddy.boardSkin.v1", "cursor-curator.boardSkin.v1"],
  ["goalbuddy.localhost", "curator.localhost"],
  ["goalbuddy-mark.png", "curator-mark.png"],
  ["goal-approval-gate.md", "goal-approval-gate.md"], // noop anchor
  ["goal-judge.md", "goal-approval-gate.md"],
  ["goal-judge", "goal-approval-gate"],
  ["goal_judge", "goal_approval_gate"],
  ["goal_pressure_requires_oracle", "goal_pressure_requires_success_criteria"],
  ["no_completion_without_judge_or_pm_audit", "no_completion_without_approval_gate_or_pm_audit"],
  ["judge_picks_largest_safe_slice", "approval_gate_picks_largest_safe_slice"],
  ["ambiguity_requiring_judge", "ambiguity_requiring_approval_gate"],
  ["goal.oracle.final_proof", "objective.success_criteria.final_proof"],
  ["goal.oracle.signal", "objective.success_criteria.signal"],
  ["goal.oracle.cadence", "objective.success_criteria.cadence"],
  ["goal.oracle", "objective.success_criteria"],
  ["oracle_health", "success_criteria_health"],
  ["oracle_ready", "success_criteria_ready"],
  ["oracle_signal", "success_criteria_signal"],
  ["weak-oracle", "weak-success-criteria"],
  ["weak oracle", "weak success criteria"],
  ["oracle ready", "success criteria ready"],
  ["Goal oracle", "Success criteria"],
  ["goal oracle", "success criteria"],
  ["hub-oracle", "hub-success-criteria"],
  ["oracle strip", "success criteria strip"],
  ["aria-label=\"Goal oracle\"", "aria-label=\"Success criteria\""],
  ["oracle.md", "success-criteria.md"],
  ["reference/oracle", "reference/success-criteria"],
  ["assignee: Judge", "assignee: Approval Gate"],
  ['role: "judge"', 'role: "approval_gate"'],
  ["role: judge", "role: approval_gate"],
  ["type: judge", "type: approval_gate"],
  ["agents.judge", "agents.approval_gate"],
  ["| judge |", "| approval_gate |"],
  ["| Judge |", "| Approval Gate |"],
  ["Judge/PM", "Approval Gate/PM"],
  ["Judge task", "Approval Gate task"],
  ["You are Judge", "You are the Approval Gate"],
  ["GoalBuddy Judge", "Cursor Curator Approval Gate"],
  ["for GoalBuddy", "for Cursor Curator"],
  ["GoalBuddy on Cursor", "Cursor Curator"],
  ["GoalBuddy board", "Cursor Curator board"],
  ["GoalBuddy boards", "Cursor Curator boards"],
  ["GoalBuddy MCP", "cursor-curator MCP"],
  ["goalbuddy MCP", "cursor-curator MCP"],
  ["the goalbuddy MCP", "the cursor-curator MCP"],
  ["goalbuddy/goal", "cursor-curator/goal"],
  ["scripts/goalbuddy.mjs", "scripts/curator.mjs"],
  ["goalbuddy.mjs", "curator.mjs"],
  ["node goalbuddy", "node curator"],
  ["goalbuddy doctor", "curator doctor"],
  ["goalbuddy install", "curator install"],
  ["goalbuddy list", "curator list"],
  ["goalbuddy board", "curator board"],
  ["goalbuddy hub", "curator hub"],
  ["goalbuddy prompt", "curator prompt"],
  ["goalbuddy receipt", "curator receipt"],
  ["goalbuddy run", "curator run"],
  ["goalbuddy check", "curator check"],
  ["goalbuddy ", "curator "],
  ["`goalbuddy`", "`curator`"],
  ['"goalbuddy"', '"cursor-curator"'],
  ["mcp:goalbuddy", "mcp:cursor-curator"],
  ["skills/goalbuddy", "skills/cursor-curator"],
  ["goalbuddy/", "cursor-curator/"],
  ["goal-prep/", "curator-prep/"],
  ["goal-prep", "curator-prep"],
  ["GoalBuddy-Loop", "Cursor-Curator-Loop"],
  ["GoalBuddy Loop", "Cursor Curator Loop"],
  ["GoalBuddy", "Cursor Curator"],
  ["goalbuddy", "cursor-curator"],
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      walk(p, files);
    } else if (TEXT_EXT.has(extname(name)) || name === ".gitignore") {
      files.push(p);
    }
  }
  return files;
}

let changed = 0;
for (const file of walk(ROOT)) {
  if (file.includes("rebrand-3.0-apply.mjs")) continue;
  if (file.includes(".cursor/plans/")) continue;
  let text = readFileSync(file, "utf8");
  const before = text;
  for (const [from, to] of REPLACEMENTS) {
    text = text.split(from).join(to);
  }
  if (text !== before) {
    writeFileSync(file, text, "utf8");
    changed++;
    console.log("updated:", file.replace(ROOT + "/", "").replace(ROOT + "\\", ""));
  }
}

console.log(`\n${changed} files updated.`);
