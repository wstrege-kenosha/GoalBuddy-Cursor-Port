import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { resetDatabaseCache } from "./connection.mjs";
import {
  importLegacyObjectives,
  importObjectiveFixture,
  importStateJsonFile,
  patchObjective,
  patchTask,
  registerObjective,
  saveStateV3,
} from "./state-repository.mjs";
import { loadState } from "../state/objective-state.mjs";
import { removeWorkspaceDir } from "./test-helpers.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const previousWorkspacePaths = process.env.WORKSPACE_FOLDER_PATHS;
process.env.WORKSPACE_FOLDER_PATHS = repoRoot;

after(() => {
  if (previousWorkspacePaths === undefined) {
    delete process.env.WORKSPACE_FOLDER_PATHS;
  } else {
    process.env.WORKSPACE_FOLDER_PATHS = previousWorkspacePaths;
  }
});

test("importStateJsonFile imports subobjectives before parent", () => {
  const fixtureRoot = join(
    repoRoot,
    "cursor-curator/scripts/test/fixtures/parallel-plan/max-workers-blocked",
  );
  resetDatabaseCache();
  importStateJsonFile(repoRoot, join(fixtureRoot, "state.json"), { dirPath: fixtureRoot });
  const loaded = loadState("parallel-max-workers-blocked", repoRoot);
  assert.equal(loaded.validation.ok, true);
  const child = loadState("t004-ui-subobjective-blocked", repoRoot);
  assert.equal(child.state.objective.slug, "t004-ui-subobjective-blocked");
});

test("importLegacyObjectives skips objectives without on-disk state.json", () => {
  resetDatabaseCache();
  const result = importLegacyObjectives(repoRoot, { slug: "sample-cursor-smoke" });
  assert.ok(result.skipped.includes("sample-cursor-smoke"));
  assert.equal(result.imported.length, 0);
});

test("registerObjective seeds template board in database", () => {
  const workspace = mkdtempSync(join(tmpdir(), "curator-register-"));
  const slug = "register-objective-test";
  const dirPath = join(workspace, "docs", "objectives", slug);
  mkdirSync(join(dirPath, "notes"), { recursive: true });
  writeFileSync(join(dirPath, "objective.md"), "# Register test\n", "utf8");
  try {
    resetDatabaseCache();
    registerObjective(workspace, slug);
    const loaded = loadState(slug, workspace);
    assert.equal(loaded.state.objective.slug, slug);
    assert.equal(loaded.boardPath, `db:${slug}`);
  } finally {
    removeWorkspaceDir(workspace);
  }
});

test("patchTask updates task fields in database", () => {
  resetDatabaseCache();
  importObjectiveFixture(repoRoot, "sample-cursor-smoke");
  const result = patchTask(repoRoot, "sample-cursor-smoke", "T003", {
    verify: ["bun cursor-curator/dist/cli/curator.mjs check-objective sample-cursor-smoke --json"],
  });
  assert.equal(result.ok, true);
  const loaded = loadState("sample-cursor-smoke", repoRoot);
  const task = loaded.state.tasks.find((entry) => entry.id === "T003");
  assert.deepEqual(task?.verify, [
    "bun cursor-curator/dist/cli/curator.mjs check-objective sample-cursor-smoke --json",
  ]);
});

test("patchObjective updates objective metadata in database", () => {
  resetDatabaseCache();
  importObjectiveFixture(repoRoot, "sample-cursor-smoke");
  const result = patchObjective(repoRoot, "sample-cursor-smoke", {
    objective: { tranche: "Updated tranche label." },
  });
  assert.equal(result.ok, true);
  const loaded = loadState("sample-cursor-smoke", repoRoot);
  assert.equal(loaded.state.objective.tranche, "Updated tranche label.");
});

test("patchObjective dry run validates without persisting", () => {
  resetDatabaseCache();
  importObjectiveFixture(repoRoot, "sample-cursor-smoke");
  const before = loadState("sample-cursor-smoke", repoRoot);
  const result = patchObjective(repoRoot, "sample-cursor-smoke", {
    objective: { tranche: "Dry run tranche label." },
  }, { dryRun: true });
  assert.equal(result.ok, true);
  const after = loadState("sample-cursor-smoke", repoRoot);
  assert.equal(after.state.objective.tranche, before.state.objective.tranche);
});

test("saveStateV3 preserves parent subobjective links when child objective is updated", () => {
  const workspace = mkdtempSync(join(tmpdir(), "curator-subobjective-link-"));
  const parentDir = join(workspace, "parent-goal");
  const childDir = join(parentDir, "subobjectives", "T001-child");
  mkdirSync(join(parentDir, "notes"), { recursive: true });
  mkdirSync(join(childDir, "notes"), { recursive: true });

  const agents = { scout: "installed", worker: "installed", approval_gate: "installed" } as const;
  const childState = {
    version: 3 as const,
    objective: {
      title: "Child Goal",
      slug: "child-goal",
      kind: "specific" as const,
      tranche: "Child tranche.",
      status: "active" as const,
      success_criteria: { signal: "child ok", final_proof: "child proof" },
    },
    agents,
    active_task: "T001" as const,
    tasks: [{
      id: "T001" as const,
      type: "worker" as const,
      assignee: "Worker" as const,
      status: "active" as const,
      objective: "Child work.",
      receipt: null,
    }],
  };
  const parentState = {
    version: 3 as const,
    objective: {
      title: "Parent Goal",
      slug: "parent-goal",
      kind: "specific" as const,
      tranche: "Parent tranche.",
      status: "active" as const,
      success_criteria: { signal: "parent ok", final_proof: "parent proof" },
    },
    agents,
    active_task: "T001" as const,
    tasks: [{
      id: "T001" as const,
      type: "worker" as const,
      assignee: "Worker" as const,
      status: "active" as const,
      objective: "Watch child state.",
      allowed_files: ["notes/**"],
      verify: ["bun test"],
      stop_if: ["Needs files outside allowed_files"],
      subobjective: {
        status: "active" as const,
        path: "subobjectives/T001-child",
        owner: "Worker" as const,
        depth: 1,
      },
      receipt: null,
    }],
  };

  try {
    resetDatabaseCache();
    saveStateV3(workspace, childState, { dirPath: childDir });
    saveStateV3(workspace, parentState, { dirPath: parentDir });

    const parentBefore = loadState("parent-goal", workspace);
    assert.equal(parentBefore.state.tasks[0]?.subobjective?.path, "subobjectives/T001-child");

    saveStateV3(workspace, {
      ...childState,
      tasks: [{ ...childState.tasks[0], status: "blocked" }],
    }, { dirPath: childDir });

    const parentAfter = loadState("parent-goal", workspace);
    assert.equal(parentAfter.state.tasks[0]?.subobjective?.path, "subobjectives/T001-child");
    const childAfter = loadState("child-goal", workspace);
    assert.equal(childAfter.state.tasks[0]?.status, "blocked");
  } finally {
    removeWorkspaceDir(workspace);
  }
});
