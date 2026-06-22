import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { isWeakProof, validateGoalState } from "../lib/goal-state.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const fixturesDir = join(__dirname, "fixtures");
const smokeState = join(repoRoot, "docs/objectives/sample-cursor-smoke/state.yaml");

test("isWeakProof flags placeholders", () => {
  assert.equal(isWeakProof("<placeholder>"), true);
  assert.equal(isWeakProof("TBD"), true);
  assert.equal(isWeakProof("npm run check exits 0"), false);
});

test("validateGoalState passes sample-cursor-smoke", () => {
  const result = validateGoalState(smokeState);
  assert.equal(result.ok, true);
  assert.equal(result.version, 2);
  assert.equal(result.errors.length, 0);
});

test("validateGoalState warns on weak success criteria", () => {
  const result = validateGoalState(join(fixturesDir, "weak-success-criteria/state.yaml"));
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((warning) => warning.includes("objective.success_criteria.signal")));
  assert.ok(result.warnings.some((warning) => warning.includes("objective.success_criteria.final_proof")));
});

test("validateGoalState errors on active worker without contract fields", () => {
  const result = validateGoalState(join(fixturesDir, "invalid-active-worker/state.yaml"));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("allowed_files")));
  assert.ok(result.errors.some((error) => error.includes("verify")));
  assert.ok(result.errors.some((error) => error.includes("stop_if")));
});

test("validateGoalState returns not found for missing path", () => {
  const result = validateGoalState(join(fixturesDir, "missing/state.yaml"));
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("not found"));
});

test("agent warnings reference curator.mjs install not npx curator agents", async () => {
  const fixtureDir = join(fixturesDir, "agent-warning");
  const statePath = join(fixtureDir, "state.yaml");
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(join(fixtureDir, "notes"), { recursive: true });
  writeFileSync(join(fixtureDir, "objective.md"), "# fixture\n");
  writeFileSync(statePath, `version: 2

objective:
  title: Agent warning
  slug: agent-warning
  status: active
  success_criteria:
    signal: npm run check exits 0
    final_proof: check passes
  intake:
    completion_proof: npm run check exits 0

rules:
  pm_owns_state: true

agents:
  scout: bundled_not_installed
  worker: installed
  approval_gate: installed

active_task: T001

tasks:
  - id: T001
    type: scout
    assignee: Scout
    status: active
    objective: "Fixture"
    receipt: null
`);

  const result = validateGoalState(statePath);
  const scoutWarning = result.warnings.find((warning) => warning.includes("agents.scout"));
  assert.ok(scoutWarning);
  assert.ok(scoutWarning.includes("curator.mjs install"));
  assert.ok(!scoutWarning.includes("npx curator agents"));
});
