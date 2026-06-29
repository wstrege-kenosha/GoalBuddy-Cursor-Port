import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { resetDatabaseCache } from "./connection.mjs";
import {
  appendUsageSessionToDb,
  buildUsageFileFromSessions,
  importUsageFileToDb,
  loadUsageFileFromDb,
  logicalUsagePath,
  usageSessionCountInDb,
} from "./usage-repository.mjs";
import { seedObjectiveInDb, removeWorkspaceDir } from "./test-helpers.mjs";
import { emptyUsageFile } from "../usage/objective-usage.mjs";

function seedSlug(root: string, slug: string) {
  resetDatabaseCache();
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
    visual_board: { selected: "none", local: { status: "not_requested" } },
    active_task: "T001",
    tasks: [
      {
        id: "T001",
        type: "scout",
        assignee: "Scout",
        status: "active",
        objective: "Scout",
        receipt: null,
      },
    ],
    checks: { dirty_fingerprint: "test" },
  }, { slug });
}

test("logicalUsagePath uses db slug anchor", () => {
  assert.equal(logicalUsagePath("alpha"), "db:alpha#usage");
});

test("appendUsageSessionToDb persists and loadUsageFileFromDb reads sessions", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-usage-db-"));
  try {
    seedSlug(root, "usage-db-alpha");
    const objectiveDir = join(root, "docs", "objectives", "usage-db-alpha");

    const result = appendUsageSessionToDb(root, { objectiveDir }, {
      at: "2026-06-29T12:00:00.000Z",
      task_id: "T001",
      hook: "subagentStop",
      model: "composer",
      duration_ms: 90_000,
      input_tokens: 12_000,
      output_tokens: 900,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      status: "completed",
    });

    assert.ok(result);
    assert.equal(result!.usage_path, "db:usage-db-alpha#usage");
    assert.equal(usageSessionCountInDb(root, "usage-db-alpha"), 1);

    const file = loadUsageFileFromDb(root, "usage-db-alpha");
    assert.ok(file);
    assert.equal(file!.rollup.session_count, 1);
    assert.equal(file!.rollup.duration_ms, 90_000);
    assert.equal(file!.tasks.T001.input_tokens, 12_000);
  } finally {
    removeWorkspaceDir(root);
  }
});

test("importUsageFileToDb imports legacy JSON once", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-usage-db-"));
  try {
    seedSlug(root, "usage-db-beta");
    const legacy = emptyUsageFile();
    legacy.sessions.push({
      at: "2026-06-29T12:00:00.000Z",
      task_id: "T001",
      hook: "stop",
      model: null,
      duration_ms: 30_000,
      input_tokens: 1_000,
      output_tokens: 100,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      status: "completed",
    });
    const rebuilt = buildUsageFileFromSessions(legacy.sessions);
    assert.equal(importUsageFileToDb(root, "usage-db-beta", rebuilt), 1);
    assert.equal(importUsageFileToDb(root, "usage-db-beta", rebuilt), 0);
    assert.equal(usageSessionCountInDb(root, "usage-db-beta"), 1);
  } finally {
    removeWorkspaceDir(root);
  }
});
