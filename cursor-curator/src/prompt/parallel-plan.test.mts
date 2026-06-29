import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { resetDatabaseCache } from "../db/connection.mjs";
import { importStateJsonFile } from "../db/state-repository.mjs";
import { createParallelPlan } from "./parallel-plan.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const previousWorkspacePaths = process.env.WORKSPACE_FOLDER_PATHS;
process.env.WORKSPACE_FOLDER_PATHS = repoRoot;
const fixturesRoot = join(repoRoot, "cursor-curator/scripts/test/fixtures/parallel-plan");
const overlappingRoot = join(
  repoRoot,
  "cursor-curator/surfaces/local-objective-board/examples/subobjective-parent",
);

after(() => {
  if (previousWorkspacePaths === undefined) {
    delete process.env.WORKSPACE_FOLDER_PATHS;
  } else {
    process.env.WORKSPACE_FOLDER_PATHS = previousWorkspacePaths;
  }
});

function importFixtureTree(root: string, options: { reset?: boolean } = {}): void {
  if (options.reset) {
    resetDatabaseCache();
  }
  const subRoot = join(root, "subobjectives");
  if (existsSync(subRoot)) {
    for (const entry of readdirSync(subRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        importFixtureTree(join(subRoot, entry.name));
      }
    }
  }
  const jsonPath = join(root, "state.json");
  if (existsSync(jsonPath)) {
    importStateJsonFile(repoRoot, jsonPath, { dirPath: root });
  }
}

function planForFixture(fixtureRoot: string) {
  importFixtureTree(fixtureRoot, { reset: true });
  return createParallelPlan({
    objectiveRoot: fixtureRoot,
    json: true,
    workspaceRoot: repoRoot,
  });
}

function workerSpawnEntries(plan: ReturnType<typeof createParallelPlan>) {
  return plan.spawn_plan.filter((entry) => entry.role === "worker");
}

test("parallel-plan: overlapping parent+child Workers are not in spawn_plan", () => {
  const plan = planForFixture(overlappingRoot);
  assert.equal(plan.worker_candidate_count, 2);
  assert.equal(workerSpawnEntries(plan).length, 0);
  assert.equal(plan.spawn_mode, "serial");
});

test("parallel-plan: disjoint parent+child Workers with max_write_workers 2", () => {
  const plan = planForFixture(join(fixturesRoot, "disjoint"));
  assert.equal(plan.max_write_workers, 2);
  assert.equal(plan.worker_candidate_count, 2);
  assert.equal(workerSpawnEntries(plan).length, 2);
  assert.equal(plan.spawn_mode, "parallel");
});

test("parallel-plan: max_write_workers 1 blocks parallel Workers even when disjoint", () => {
  const plan = planForFixture(join(fixturesRoot, "max-workers-blocked"));
  assert.equal(plan.max_write_workers, 1);
  assert.equal(plan.worker_candidate_count, 2);
  assert.equal(workerSpawnEntries(plan).length, 0);
  assert.ok(
    plan.candidates
      .filter((candidate) => candidate.role === "worker")
      .every((candidate) => candidate.safe_to_parallelize === false),
  );
});

test("parallel-plan: Scouts remain parallel-safe when max_write_workers blocks Workers", () => {
  const plan = planForFixture(join(fixturesRoot, "scout-parallel"));
  assert.equal(plan.max_write_workers, 1);
  assert.equal(workerSpawnEntries(plan).length, 0);
  const scoutEntries = plan.spawn_plan.filter((entry) => entry.role === "scout");
  assert.equal(scoutEntries.length, 2);
  assert.equal(plan.spawn_mode, "parallel");
});

test("parallel-plan: single active Worker is not parallel-safe", () => {
  const plan = planForFixture(join(fixturesRoot, "single-worker"));
  assert.equal(plan.worker_candidate_count, 1);
  assert.equal(workerSpawnEntries(plan).length, 0);
  assert.equal(plan.spawn_mode, "serial");
});

test("areAllowedFilesDisjoint detects overlap and disjoint globs", async () => {
  const { areAllowedFilesDisjoint } = await import("./parallel-plan.mjs");
  assert.equal(
    areAllowedFilesDisjoint(
      ["cursor-curator/dist/board/objective-board.mjs"],
      ["cursor-curator/dist/board/objective-board.mjs"],
    ),
    false,
  );
  assert.equal(
    areAllowedFilesDisjoint(["src/feature/tests/**"], ["src/feature/ui/**"]),
    true,
  );
});
