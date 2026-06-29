import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  loadState,
  resolveStatePath,
  validateStateV3,
} from "./objective-state.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const smokeJson = join(repoRoot, "docs/objectives/sample-cursor-smoke/state.json");
const yamlFixture = join(repoRoot, "cursor-curator/scripts/test/fixtures/runner-fixture/state.yaml");
const migrateScript = join(repoRoot, "scripts/migrate-5.0.mts");

function runnerFixtureV3() {
  return {
    version: 3 as const,
    objective: {
      title: "Runner fixture",
      slug: "runner-fixture",
      kind: "specific" as const,
      status: "active" as const,
      success_criteria: {
        signal: "npm run check exits 0",
        cadence: "after worker slice",
        final_proof: "phase-c tests pass",
      },
    },
    rules: {
      pm_owns_state: true,
      one_active_task: true,
    },
    agents: {
      scout: "installed" as const,
      worker: "installed" as const,
      approval_gate: "installed" as const,
    },
    active_task: "T001",
    tasks: [
      {
        id: "T001",
        type: "scout" as const,
        assignee: "Scout" as const,
        status: "active" as const,
        reasoning_hint: "low" as const,
        objective: "Map verification commands for runner fixture.",
        inputs: ["package.json"],
        constraints: ["Read-only."],
        expected_output: ["Verification command list"],
        receipt: null,
      },
      {
        id: "T002",
        type: "approval_gate" as const,
        assignee: "Approval Gate" as const,
        status: "queued" as const,
        reasoning_hint: "low" as const,
        objective: "Approve a notes-only worker slice.",
        inputs: ["T001 receipt"],
        constraints: ["Do not implement."],
        expected_output: ["Worker package"],
        receipt: null,
      },
    ],
    checks: {
      dirty_fingerprint: "unknown",
    },
  };
}

function invalidActiveWorkerV3() {
  return {
    version: 3 as const,
    objective: {
      title: "Invalid active worker",
      slug: "invalid-worker",
      status: "active" as const,
      success_criteria: {
        signal: "npm run check exits 0",
        final_proof: "check-objective-state passes on fixture",
      },
      intake: {
        completion_proof: "npm run check exits 0",
      },
    },
    rules: {
      pm_owns_state: true,
    },
    agents: {
      scout: "installed" as const,
      worker: "installed" as const,
      approval_gate: "installed" as const,
    },
    active_task: "T001",
    tasks: [
      {
        id: "T001",
        type: "worker" as const,
        assignee: "Worker" as const,
        status: "active" as const,
        objective: "Active worker missing allowed_files and verify.",
        allowed_files: [],
        verify: [],
        stop_if: [],
        receipt: null,
      },
    ],
  };
}

test("validateStateV3 accepts v2-shaped runner fixture as version 3", () => {
  const result = validateStateV3(runnerFixtureV3());
  assert.equal(result.ok, true);
  assert.equal(result.version, 3);
  assert.equal(result.errors.length, 0);
});

test("validateStateV3 rejects invalid active worker contract fields", () => {
  const result = validateStateV3(invalidActiveWorkerV3());
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("allowed_files")));
  assert.ok(result.errors.some((error) => error.includes("verify")));
  assert.ok(result.errors.some((error) => error.includes("stop_if")));
});

test("validateStateV3 rejects schema violations", () => {
  const result = validateStateV3({ version: 2, tasks: [] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("validateStateV3 rejects wrong assignee for task type", () => {
  const fixture = runnerFixtureV3();
  (fixture.tasks[0] as { assignee: string }).assignee = "Worker";
  const result = validateStateV3(fixture);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("assignee must be Scout")));
});

test("resolveStatePath uses state.json under objective directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "curator-state-"));
  const jsonPath = join(dir, "state.json");
  writeFileSync(jsonPath, '{"version":3}');
  assert.equal(resolveStatePath(dir), jsonPath);
});

test("resolveStatePath rejects explicit state.yaml path", () => {
  const dir = mkdtempSync(join(tmpdir(), "curator-state-yaml-"));
  const yamlPath = join(dir, "state.yaml");
  writeFileSync(yamlPath, "version: 2\n");
  assert.throws(() => resolveStatePath(yamlPath), /state\.yaml is deprecated/);
});

test("loadState reads json without deprecation warning", () => {
  const loaded = loadState(smokeJson);
  assert.equal(loaded.format, "json");
  assert.equal(loaded.deprecatedYaml, false);
  assert.equal(loaded.validation.ok, true);
  assert.equal(loaded.validation.version, 3);
});

test("loadState rejects yaml-only objective directories", () => {
  const dir = mkdtempSync(join(tmpdir(), "curator-yaml-"));
  const yamlPath = join(dir, "state.yaml");
  writeFileSync(yamlPath, readFileSync(yamlFixture, "utf8"));
  assert.throws(() => loadState(dir), /No state\.json found/);
});

test("migrate-5.0 dry-run reports conversion without writing", () => {
  const dir = mkdtempSync(join(tmpdir(), "curator-migrate-"));
  writeFileSync(join(dir, "state.yaml"), readFileSync(yamlFixture, "utf8"));

  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", migrateScript, dir, "--dry-run"],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /state\.yaml -> state\.json/);
  assert.throws(() => readFileSync(join(dir, "state.json")), /ENOENT/);
});

test("validateStateV3 warns when parallel parent+child Workers exceed max_write_workers", () => {
  const fixtureRoot = join(
    repoRoot,
    "cursor-curator/scripts/test/fixtures/parallel-plan/max-workers-blocked",
  );
  const statePath = join(fixtureRoot, "state.json");
  const loaded = loadState(statePath);
  assert.equal(loaded.validation.ok, true);
  assert.ok(
    loaded.validation.warnings.some((warning) => warning.includes("max_write_workers")),
  );
});
