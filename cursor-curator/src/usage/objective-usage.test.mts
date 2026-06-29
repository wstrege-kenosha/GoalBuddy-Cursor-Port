import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import {
  appendUsageEvent,
  attributeTaskId,
  buildTaskMetricsWithRollup,
  buildUsageBoardView,
  discoverChildUsageDirs,
  emptyUsageFile,
  formatDuration,
  formatUsageShort,
  mergeUsageCounters,
  parseHookUsagePayload,
  processHookUsage,
  readUsageSummary,
  readUsageSummaryForObjective,
} from "./objective-usage.mjs";
import { seedObjectiveInDb, removeWorkspaceDir } from "../db/test-helpers.mjs";
import { resetDatabaseCache } from "../db/connection.mjs";
import { usageSessionCountInDb } from "../db/usage-repository.mjs";

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

    assert.equal(usageSessionCountInDb(root, "gamma"), 2);
    assert.equal(existsSync(join(objectiveDir, "notes", "usage.json")), false);
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
    assert.equal(result.appended[0]?.usage_path, "db:delta#usage");
    assert.equal(usageSessionCountInDb(root, "delta"), 1);
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

function writeUsageJson(objectiveDir: string, rollup: {
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  session_count: number;
}) {
  const notesDir = join(objectiveDir, "notes");
  mkdirSync(notesDir, { recursive: true });
  writeFileSync(join(notesDir, "usage.json"), JSON.stringify({
    version: 1,
    rollup: {
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      ...rollup,
    },
    tasks: {},
    unattributed: emptyUsageFile().unattributed,
    sessions: [],
  }, null, 2));
}

function scaffoldParentWithChild(root: string, slug: string) {
  const { objectiveDir } = scaffoldObjective(root, slug, "T002");
  const childDir = join(objectiveDir, "subobjectives", "T002-child");
  mkdirSync(childDir, { recursive: true });
  return { objectiveDir, childDir, childPath: "subobjectives/T002-child" };
}

test("mergeUsageCounters is idempotent for repeated empty partials", () => {
  const base = {
    duration_ms: 60_000,
    input_tokens: 10_000,
    output_tokens: 500,
    cache_read_tokens: 100,
    cache_write_tokens: 0,
    session_count: 2,
  };
  const once = mergeUsageCounters(base);
  const twice = mergeUsageCounters(base, emptyUsageFile().rollup, {});
  assert.deepEqual(once, twice);
  assert.deepEqual(mergeUsageCounters(once), once);
});

test("readUsageSummaryForObjective returns parent-only rollup without child tasks", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-usage-parent-only-"));
  try {
    const { objectiveDir } = scaffoldObjective(root, "parent-only", "T002");
    writeUsageJson(objectiveDir, {
      duration_ms: 90_000,
      input_tokens: 20_000,
      output_tokens: 1_000,
      session_count: 1,
    });

    const summary = readUsageSummaryForObjective(objectiveDir);
    assert.equal(summary.rollup.duration_ms, 90_000);
    assert.equal(summary.rollup_includes_subobjectives, false);
    assert.deepEqual(summary.children, {});
  } finally {
    removeWorkspaceDir(root);
  }
});

test("readUsageSummaryForObjective merges distinct parent and child rollups", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-usage-parent-child-"));
  try {
    const { objectiveDir, childDir, childPath } = scaffoldParentWithChild(root, "parent-child");
    writeUsageJson(objectiveDir, {
      duration_ms: 60_000,
      input_tokens: 12_000,
      output_tokens: 800,
      session_count: 1,
    });
    writeUsageJson(childDir, {
      duration_ms: 30_000,
      input_tokens: 5_000,
      output_tokens: 200,
      session_count: 1,
    });

    const tasks = [{ id: "T002", subobjective: { path: childPath } }];
    const summary = readUsageSummaryForObjective(objectiveDir, { tasks });
    assert.equal(summary.rollup.duration_ms, 90_000);
    assert.equal(summary.rollup.input_tokens, 17_000);
    assert.equal(summary.rollup.session_count, 2);
    assert.equal(summary.rollup_includes_subobjectives, true);
    assert.equal(summary.children[childPath]?.rollup.duration_ms, 30_000);

    const dirs = discoverChildUsageDirs(objectiveDir, tasks);
    assert.equal(dirs.length, 1);
    assert.equal(dirs[0]?.path, childPath);
    assert.ok(existsSync(dirs[0]!.usage_path));
  } finally {
    removeWorkspaceDir(root);
  }
});

test("readUsageSummaryForObjective ignores missing child usage file", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-usage-missing-child-"));
  try {
    const { objectiveDir, childDir, childPath } = scaffoldParentWithChild(root, "missing-child");
    writeUsageJson(objectiveDir, {
      duration_ms: 45_000,
      input_tokens: 8_000,
      output_tokens: 400,
      session_count: 1,
    });
    assert.ok(existsSync(childDir));
    assert.ok(!existsSync(join(childDir, "notes", "usage.json")));

    const summary = readUsageSummaryForObjective(objectiveDir, {
      tasks: [{ id: "T002", subobjective: { path: childPath } }],
    });
    assert.equal(summary.rollup.duration_ms, 45_000);
    assert.equal(summary.children[childPath]?.rollup.session_count, 0);
    assert.equal(summary.children[childPath]?.present, false);
  } finally {
    removeWorkspaceDir(root);
  }
});

test("buildTaskMetricsWithRollup splits parent and child agent time", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-usage-metrics-rollup-"));
  try {
    const { objectiveDir, childDir, childPath } = scaffoldParentWithChild(root, "metrics-rollup");
    appendUsageEvent(objectiveDir, {
      at: "2026-06-25T12:00:00.000Z",
      task_id: "T002",
      hook: "subagentStop",
      model: "composer",
      duration_ms: 120_000,
      input_tokens: 40_000,
      output_tokens: 1_500,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      status: "completed",
    });
    writeUsageJson(childDir, {
      duration_ms: 30_000,
      input_tokens: 5_000,
      output_tokens: 200,
      session_count: 1,
    });

    const summary = readUsageSummaryForObjective(objectiveDir, {
      tasks: [{ id: "T002", subobjective: { path: childPath } }],
    });
    const metrics = buildTaskMetricsWithRollup("T002", summary, childPath);
    assert.equal(metrics.detail?.parent_agent_time, "2m");
    assert.equal(metrics.detail?.child_agent_time, "30s");
    assert.equal(metrics.detail?.agent_time, "3m");
    assert.match(metrics.badge, /3m/);
  } finally {
    removeWorkspaceDir(root);
  }
});
