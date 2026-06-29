import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import {
  appendUsageEvent,
  attributeTaskId,
  buildUsageBoardView,
  emptyUsageFile,
  formatDuration,
  formatUsageShort,
  parseHookUsagePayload,
  processHookUsage,
  readUsageSummary,
} from "./objective-usage.mjs";
import { seedObjectiveInDb, removeWorkspaceDir } from "../db/test-helpers.mjs";
import { resetDatabaseCache } from "../db/connection.mjs";

function scaffoldObjective(root: string, slug: string, activeTask: string | null, activeStatus = "active") {
  resetDatabaseCache();
  const state = {
    version: 3 as const,
    objective: {
      title: slug,
      slug,
      status: "active" as const,
      success_criteria: { signal: "done", cadence: "once", final_proof: "done" },
    },
    rules: { pm_owns_state: true, one_active_task: true },
    agents: { scout: "installed" as const, worker: "installed" as const, approval_gate: "installed" as const },
    visual_board: { selected: "none" as const, local: { status: "not_requested" as const } },
    active_task: activeTask,
    tasks: [
      {
        id: "T001",
        type: "scout" as const,
        assignee: "Scout" as const,
        status: (activeTask === "T001" ? activeStatus : "done") as "active" | "done",
        objective: "Scout slice",
        receipt: activeTask === "T001" ? null : { result: "done", summary: "done" },
      },
      {
        id: "T002",
        type: "worker" as const,
        assignee: "Worker" as const,
        status: (activeTask === "T002" ? activeStatus : "queued") as "active" | "queued",
        objective: "Worker slice",
        allowed_files: ["README.md"],
        verify: ["bun run check"],
        stop_if: ["blocked"],
        receipt: null,
      },
    ],
    checks: { dirty_fingerprint: "test" },
  };
  seedObjectiveInDb(root, state, { slug });
  const objectiveDir = join(root, "docs", "objectives", slug);
  return { objectiveDir, notesDir: join(objectiveDir, "notes"), boardPath: `db:${slug}` };
}

test("parseHookUsagePayload tolerates missing token fields", () => {
  const parsed = parseHookUsagePayload({ status: "completed", model: "composer" });
  assert.equal(parsed.duration_ms, 0);
  assert.equal(parsed.input_tokens, 0);
  assert.equal(parsed.model, "composer");
});

test("attributeTaskId prefers explicit task_id then active task", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-usage-"));
  try {
    const { boardPath } = scaffoldObjective(root, "alpha", "T002");
    assert.equal(attributeTaskId({ task_id: "T001" }, boardPath, root), "T001");
    assert.equal(attributeTaskId({}, boardPath, root), "T002");
  } finally {
    removeWorkspaceDir(root);
  }
});

test("attributeTaskId falls back to unattributed when active task is not active", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-usage-"));
  try {
    const { boardPath } = scaffoldObjective(root, "beta", "T002", "queued");
    assert.equal(attributeTaskId({}, boardPath, root), "unattributed");
  } finally {
    removeWorkspaceDir(root);
  }
});

test("appendUsageEvent rolls up per task and board totals", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-usage-"));
  try {
    const { objectiveDir } = scaffoldObjective(root, "gamma", "T002");
    appendUsageEvent(objectiveDir, {
      at: "2026-06-25T12:00:00.000Z",
      task_id: "T002",
      hook: "subagentStop",
      model: "composer",
      duration_ms: 120_000,
      input_tokens: 40_000,
      output_tokens: 1_500,
      cache_read_tokens: 10_000,
      cache_write_tokens: 0,
      status: "completed",
    });
    appendUsageEvent(objectiveDir, {
      at: "2026-06-25T12:05:00.000Z",
      task_id: "unattributed",
      hook: "stop",
      model: null,
      duration_ms: 30_000,
      input_tokens: 5_000,
      output_tokens: 200,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      status: "completed",
    });

    const summary = readUsageSummary(objectiveDir);
    assert.equal(summary.rollup.session_count, 2);
    assert.equal(summary.rollup.duration_ms, 150_000);
    assert.equal(summary.tasks.T002.session_count, 1);
    assert.equal(summary.tasks.T002.input_tokens, 40_000);
    assert.equal(summary.unattributed.session_count, 1);
    assert.equal(summary.has_unattributed, true);

    const file = JSON.parse(readFileSync(join(objectiveDir, "notes", "usage.json"), "utf8"));
    assert.equal(file.version, 1);
    assert.equal(file.sessions.length, 2);
  } finally {
    removeWorkspaceDir(root);
  }
});

test("processHookUsage resolves objectives from workspace roots", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-usage-"));
  try {
    scaffoldObjective(root, "delta", "T001");
    const result = processHookUsage({
      hook_event_name: "subagentStop",
      workspace_roots: [root],
      duration_ms: 60_000,
      input_tokens: 12_000,
      output_tokens: 800,
      status: "completed",
    });
    assert.equal(result.appended.length, 1);
    assert.equal(result.appended[0]?.task_id, "T001");
    assert.ok(existsSync(join(result.appended[0]!.objective_dir, "notes", "usage.json")));
  } finally {
    removeWorkspaceDir(root);
  }
});

test("processHookUsage skips ambiguous multi-objective workspaces without objective_slug", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-usage-"));
  try {
    scaffoldObjective(root, "alpha", "T001");
    scaffoldObjective(root, "beta", "T001");
    const result = processHookUsage({
      hook_event_name: "stop",
      workspace_roots: [root],
      duration_ms: 60_000,
      input_tokens: 12_000,
      output_tokens: 800,
      status: "completed",
    });
    assert.equal(result.appended.length, 0);
    assert.equal(result.skipped, "ambiguous objective; set objective_slug");
    assert.match(result.warnings.join(" "), /objective_slug/);
  } finally {
    removeWorkspaceDir(root);
  }
});

test("buildUsageBoardView preformats rollup strings for board payloads", () => {
  const view = buildUsageBoardView({
    present: true,
    rollup: {
      duration_ms: 120_000,
      input_tokens: 50_000,
      output_tokens: 2_000,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      session_count: 1,
    },
    tasks: {},
    unattributed: emptyUsageFile().unattributed,
    has_unattributed: false,
  });
  assert.equal(view.visible, true);
  assert.match(view.summary, /agent time/);
  assert.equal(view.agent_time, "2m");
  assert.equal(view.tokens, "52k");
  assert.equal(view.usage_warning, "");
});

test("formatUsageShort renders duration and token summary", () => {
  assert.equal(formatDuration(90_000), "2m");
  assert.match(
    formatUsageShort(emptyUsageFile().rollup),
    /^—$/,
  );
  assert.match(
    formatUsageShort({
      duration_ms: 2_520_000,
      input_tokens: 1_700_000,
      output_tokens: 95_000,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      session_count: 3,
    }),
    /42m agent time/,
  );
});
