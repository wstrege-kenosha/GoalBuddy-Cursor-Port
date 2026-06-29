import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createParallelPlan } from "./parallel-plan.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const fixturesRoot = join(repoRoot, "cursor-curator/scripts/test/fixtures/parallel-plan");
const overlappingRoot = join(
  repoRoot,
  "cursor-curator/surfaces/local-objective-board/examples/subobjective-parent",
);

function workerSpawnEntries(plan: ReturnType<typeof createParallelPlan>) {
  return plan.spawn_plan.filter((entry) => entry.role === "worker");
}

test("parallel-plan: overlapping parent+child Workers are not in spawn_plan", () => {
  const plan = createParallelPlan({ objectiveRoot: overlappingRoot, json: true });
  assert.equal(plan.worker_candidate_count, 2);
  assert.equal(workerSpawnEntries(plan).length, 0);
  assert.equal(plan.spawn_mode, "serial");
});

test("parallel-plan: disjoint parent+child Workers with max_write_workers 2", () => {
  const plan = createParallelPlan({ objectiveRoot: join(fixturesRoot, "disjoint"), json: true });
  assert.equal(plan.max_write_workers, 2);
  assert.equal(plan.worker_candidate_count, 2);
  assert.equal(workerSpawnEntries(plan).length, 2);
  assert.equal(plan.spawn_mode, "parallel");
});

test("parallel-plan: max_write_workers 1 blocks parallel Workers even when disjoint", () => {
  const plan = createParallelPlan({ objectiveRoot: join(fixturesRoot, "max-workers-blocked"), json: true });
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
  const plan = createParallelPlan({ objectiveRoot: join(fixturesRoot, "scout-parallel"), json: true });
  assert.equal(plan.max_write_workers, 1);
  assert.equal(workerSpawnEntries(plan).length, 0);
  const scoutEntries = plan.spawn_plan.filter((entry) => entry.role === "scout");
  assert.equal(scoutEntries.length, 2);
  assert.equal(plan.spawn_mode, "parallel");
});

test("parallel-plan: single active Worker is not parallel-safe", () => {
  const plan = createParallelPlan({ objectiveRoot: join(fixturesRoot, "single-worker"), json: true });
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
