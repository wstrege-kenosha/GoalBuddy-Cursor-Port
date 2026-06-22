#!/usr/bin/env node
/** Second-pass rebrand fixes for schema keys and role names. */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const SKIP = new Set(["node_modules", ".git"]);
const EXT = new Set([".mjs", ".js", ".json", ".md", ".yaml", ".yml", ".txt"]);

const REPLACEMENTS = [
  ["needs_judge", "needs_approval_gate"],
  ["goal_oracle", "goal_success_criteria"],
  ["readOracleSignal", "readSuccessCriteriaSignal"],
  ["oracleSignal", "successCriteriaSignal"],
  ["oracleFinalProof", "successCriteriaFinalProof"],
  ["goalPressureRequiresOracle", "goalPressureRequiresSuccessCriteria"],
  ["isMicroJudgeForWorker", "isMicroApprovalGateForWorker"],
  ["oracleEyebrow", "successCriteriaEyebrow"],
  ["oracle-strip", "success-criteria-strip"],
  ["oracle-signal", "success-criteria-signal"],
  ["oracle-meta", "success-criteria-meta"],
  ["oracle-status-wrap", "success-criteria-status-wrap"],
  ["oracle-health", "success-criteria-health"],
  ["oracle-eyebrow", "success-criteria-eyebrow"],
  ["oracle-final-proof", "success-criteria-final-proof"],
  ["oracle-audit", "success-criteria-audit"],
  ["hub-oracle", "hub-success-criteria"],
  ["oracleEyebrowEl", "successCriteriaEyebrowEl"],
  ["Weak oracle fixture", "Weak success criteria fixture"],
  ["# Weak oracle", "# Weak success criteria"],
  ["No oracle signal", "No success criteria signal"],
  ["maps proof to oracle", "maps proof to success criteria"],
  ["weak success criterias", "weak success criteria"],
  ["concrete completion oracle", "concrete success criteria"],
  ["Scout/Judge/Worker", "Scout/Approval Gate/Worker"],
  ["scout/judge/worker", "scout/approval_gate/worker"],
  ["scout|judge|worker", "scout|approval_gate|worker"],
  ["goal-(scout|judge|worker)", "goal-(scout|approval-gate|worker)"],
  ["agents.scout|worker|judge", "agents.scout|worker|approval_gate"],
  ["type judge or", "type approval_gate or"],
  ["-judge.md", "-approval-gate.md"],
  ["T002-judge", "T002-approval-gate"],
  ["T999-judge", "T999-approval-gate"],
  ["notes/T002-judge", "notes/T002-approval-gate"],
  ["The oracle for this goal", "The success criteria for this goal"],
  ["to this oracle", "to these success criteria"],
  ["against an oracle", "against success criteria"],
  ["against the oracle", "against success criteria"],
  ["proof against an oracle", "proof against success criteria"],
  ["No oracle, no serious objective", "No success criteria, no serious objective"],
  ["Re-test against the oracle", "Re-test against success criteria"],
  ["map back to the oracle", "map back to success criteria"],
  ["Record the oracle in", "Record success criteria in"],
  ["The oracle is the observable", "Success criteria are the observable"],
  ["oracle health", "success criteria health"],
  ["oracle is not concrete", "success criteria are not concrete enough"],
  ["final done Judge or PM", "final done Approval Gate or PM"],
  ["Judge receipt", "Approval Gate receipt"],
  ["Judge is read-only", "Approval Gate is read-only"],
  ["A Judge should judge", "An Approval Gate should review"],
  ["or judge agents", "or approval gate agents"],
  ["activeRole === \"judge\"", "activeRole === \"approval_gate\""],
  ["role === \"judge\"", "role === \"approval_gate\""],
  ["task.type === \"judge\"", "task.type === \"approval_gate\""],
  ["candidate.role === \"judge\"", "candidate.role === \"approval_gate\""],
  ["role === 'judge'", "role === 'approval_gate'"],
  ["\"judge\", \"worker\"", "\"approval_gate\", \"worker\""],
  ["\"scout\", \"judge\"", "\"scout\", \"approval_gate\""],
  ["[\"judge\", \"pm\"]", "[\"approval_gate\", \"pm\"]"],
  ["judge: \"Judge\"", "approval_gate: \"Approval Gate\""],
  ["judge: { agent", "approval_gate: { agent"],
  ["judge: installed", "approval_gate: installed"],
  ["judge: unknown", "approval_gate: unknown"],
  ["assignee: Judge", "assignee: Approval Gate"],
  ["type: judge", "type: approval_gate"],
  ["pathScalar([\"goal\", \"oracle\"]", "pathScalar([\"goal\", \"success_criteria\"]"],
  ["document.objective?.oracle", "document.objective?.success_criteria"],
  ["board.objective?.oracle", "board.objective?.success_criteria"],
  ["goal?.oracle", "goal?.success_criteria"],
  ["      oracle:", "      success_criteria:"],
  ["  oracle:", "  success_criteria:"],
  ["Preserve upstream concepts: oracle,", "Preserve upstream concepts: success criteria,"],
  ["objective.md oracle", "objective.md success criteria"],
  ["for oracle", "for success criteria"],
  ["toward oracle", "toward success criteria"],
  ["oracle E2E", "success criteria E2E"],
  ["oracle gaps", "success criteria gaps"],
  ["oracle audit", "success criteria audit"],
  ["oracle satisfaction", "success criteria satisfaction"],
  ["oracle clause", "success criteria clause"],
  ["wiki oracle", "wiki success criteria"],
  ["prep-test oracle", "prep-test success criteria"],
  ["port oracle", "port success criteria"],
  ["live (oracle)", "live (success criteria)"],
  ["oracle and", "success criteria and"],
  ["oracle;", "success criteria;"],
  ["oracle.", "success criteria."],
  ["oracle,", "success criteria,"],
  ["oracle)", "success criteria)"],
  ["oracle:", "success_criteria:"],
  ["oracle=", "success_criteria="],
  ["oracle ", "success criteria "],
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
  if (file.includes("rebrand-3.0")) continue;
  let t = readFileSync(file, "utf8");
  const b = t;
  for (const [from, to] of REPLACEMENTS) t = t.split(from).join(to);
  if (t !== b) { writeFileSync(file, t); n++; console.log(file.replace(ROOT, "")); }
}
console.log(`\n${n} files updated.`);
