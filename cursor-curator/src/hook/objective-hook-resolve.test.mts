import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { resolveObjectiveDirsFromHook } from "./objective-hook-resolve.mjs";
import { seedObjectiveInDb, removeWorkspaceDir } from "../db/test-helpers.mjs";

function scaffoldObjective(root: string, slug: string, activeTask: string | null, activeStatus = "active") {
  seedObjectiveInDb(root, {
    version: 3,
    objective: {
      title: slug,
      slug,
      status: "active",
      success_criteria: { signal: "done", cadence: "once", final_proof: "done" },
    },
    rules: { pm_owns_state: true, one_active_task: true },
    agents: { scout: "installed", worker: "installed", approval_gate: "installed" },
    active_task: activeTask,
    tasks: [
      {
        id: "T001",
        type: "scout",
        assignee: "Scout",
        status: activeTask === "T001" ? activeStatus : "done",
        objective: "Scout slice",
        receipt: activeTask === "T001" ? null : { result: "done", summary: "done" },
      },
      {
        id: "T002",
        type: "worker",
        assignee: "Worker",
        status: activeTask === "T002" ? activeStatus : "queued",
        objective: "Worker slice",
        allowed_files: ["README.md"],
        verify: ["bun run check"],
        stop_if: ["blocked"],
        receipt: null,
      },
    ],
  }, { slug });
}

test("resolveObjectiveDirsFromHook filters by objective slug", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-hook-resolve-"));
  try {
    scaffoldObjective(root, "one", "T001");
    scaffoldObjective(root, "two", "T001");
    const dirs = resolveObjectiveDirsFromHook({ workspace_roots: [root], objective_slug: "two" });
    assert.equal(dirs.length, 1);
    assert.match(dirs[0]!, /two$/);
  } finally {
    removeWorkspaceDir(root);
  }
});

test("resolveObjectiveDirsFromHook returns one dir when workspace has a single objective", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-hook-resolve-"));
  try {
    scaffoldObjective(root, "solo", "T001");
    const dirs = resolveObjectiveDirsFromHook({ workspace_roots: [root] });
    assert.equal(dirs.length, 1);
    assert.match(dirs[0]!, /solo$/);
  } finally {
    removeWorkspaceDir(root);
  }
});
