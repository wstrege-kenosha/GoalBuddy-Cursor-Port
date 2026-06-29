import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { resetDatabaseCache } from "../../dist/db/connection.mjs";
import { importObjectiveFixture } from "../../dist/db/state-repository.mjs";
import { seedObjectiveInDb } from "../../dist/db/test-helpers.mjs";
import { StateV3Schema } from "../../dist/schema/state-v3.js";
import { isWeakProof, validateObjectiveState } from "../../dist/state/objective-state.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const fixturesDir = join(__dirname, "fixtures");

function loadFixture(slug) {
  const jsonPath = join(fixturesDir, slug, "state.json");
  return StateV3Schema.parse(JSON.parse(readFileSync(jsonPath, "utf8")));
}

function seedFixtures() {
  resetDatabaseCache();
  for (const slug of ["weak-success-criteria", "invalid-active-worker", "agent-warning"]) {
    seedObjectiveInDb(repoRoot, loadFixture(slug), { slug });
  }
  importObjectiveFixture(repoRoot, "sample-cursor-smoke");
}

seedFixtures();

test("isWeakProof flags placeholders", () => {
  assert.equal(isWeakProof("<placeholder>"), true);
  assert.equal(isWeakProof("TBD"), true);
  assert.equal(isWeakProof("bun run check exits 0"), false);
});

test("validateObjectiveState passes sample-cursor-smoke schema via dist validator", async () => {
  const { validateStateV3 } = await import("../../dist/state/objective-state.mjs");
  const smokeJson = join(repoRoot, "cursor-curator/scripts/test/fixtures/sample-cursor-smoke/state.json");
  const smoke = StateV3Schema.parse(JSON.parse(readFileSync(smokeJson, "utf8")));
  const result = validateStateV3(smoke);
  assert.equal(result.ok, true);
  assert.equal(result.version, 3);
});

test("validateObjectiveState passes sample-cursor-smoke slug via bridge", async () => {
  const { validateObjectiveStateFile } = await import("../../dist/mcp/validate-state-bridge.mjs");
  const result = validateObjectiveStateFile("sample-cursor-smoke", repoRoot);
  assert.equal(result.ok, true);
  assert.equal(result.version, 3);
  assert.equal(result.board_path, "db:sample-cursor-smoke");
  assert.equal(result.errors.length, 0);
});

test("validateObjectiveState warns on weak success criteria", () => {
  const result = validateObjectiveState("weak-success-criteria", repoRoot);
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((warning) => warning.includes("objective.success_criteria.signal")));
  assert.ok(result.warnings.some((warning) => warning.includes("objective.success_criteria.final_proof")));
});

test("validateObjectiveState errors on active worker without contract fields", () => {
  const result = validateObjectiveState("invalid-active-worker", repoRoot);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("allowed_files")));
  assert.ok(result.errors.some((error) => error.includes("verify")));
  assert.ok(result.errors.some((error) => error.includes("stop_if")));
});

test("validateObjectiveState returns not found for missing slug", () => {
  const result = validateObjectiveState("missing-fixture-slug", repoRoot);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("not found"));
});

test("validateObjectiveState rejects state.yaml paths", () => {
  const result = validateObjectiveState(join(fixturesDir, "weak-success-criteria/state.yaml"), repoRoot);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("state.yaml is not read at runtime"));
});

test("agent warnings reference curator install not npx curator agents", () => {
  const result = validateObjectiveState("agent-warning", repoRoot);
  const scoutWarning = result.warnings.find((warning) => warning.includes("agents.scout"));
  assert.ok(scoutWarning);
  assert.ok(scoutWarning.includes("curator.mjs install") || scoutWarning.includes("curator install"));
  assert.ok(!scoutWarning.includes("npx curator agents"));
});
