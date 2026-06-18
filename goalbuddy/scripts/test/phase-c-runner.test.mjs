import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createSdkExecutor } from "@goalbuddy/runner";
import { runGoalLoop } from "../lib/goal-runner-loop.mjs";
import {
  applyReceiptToState,
  parseReceiptFromText,
  pickNextActiveTaskId,
} from "../lib/goal-state-write.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const repoRoot = resolve(__dirname, "../../..");
const fixtureRoot = join(__dirname, "fixtures", "runner-fixture");

const scoutReceiptText = JSON.stringify({
  goalbuddy_receipt_v1: {
    result: "done",
    task_id: "T001",
    board_path: "docs/goals/runner-fixture/state.yaml",
    summary: "Mapped npm run check as verification.",
    evidence: ["package.json"],
    commands: [],
    note_needed: false,
  },
});

test("parseReceiptFromText extracts goalbuddy_receipt_v1", () => {
  const parsed = parseReceiptFromText(scoutReceiptText);
  assert.equal(parsed?.receipt.task_id, "T001");
});

test("pickNextActiveTaskId finds queued judge after scout done", () => {
  const text = readFileSync(join(fixtureRoot, "state.yaml"), "utf8");
  assert.equal(pickNextActiveTaskId(text, "T001", "done"), "T002");
});

test("applyReceiptToState advances scout to judge in dry-run", () => {
  const tempDir = join(tmpdir(), `goalbuddy-runner-${Date.now()}`);
  const goalDir = join(tempDir, "docs", "goals", "runner-fixture");
  mkdirSync(join(goalDir, "notes"), { recursive: true });
  copyFileSync(join(fixtureRoot, "state.yaml"), join(goalDir, "state.yaml"));
  copyFileSync(join(fixtureRoot, "goal.md"), join(goalDir, "goal.md"));

  const statePath = join(goalDir, "state.yaml");
  const result = applyReceiptToState(statePath, JSON.parse(scoutReceiptText), {
    role: "scout",
    expectedTaskId: "T001",
    dryRun: false,
  });
  assert.equal(result.ok, true);
  assert.equal(result.updates.next_active_task, "T002");

  const updated = readFileSync(statePath, "utf8");
  assert.match(updated, /active_task: T002/);
  assert.match(updated, /id: T001[\s\S]*status: done/m);

  rmSync(tempDir, { recursive: true, force: true });
});

test("runGoalLoop dry-run completes one scout turn with mock receipt", async () => {
  const tempDir = join(tmpdir(), `goalbuddy-loop-${Date.now()}`);
  const goalDir = join(tempDir, "docs", "goals", "runner-fixture");
  mkdirSync(join(goalDir, "notes"), { recursive: true });
  copyFileSync(join(fixtureRoot, "state.yaml"), join(goalDir, "state.yaml"));
  copyFileSync(join(fixtureRoot, "goal.md"), join(goalDir, "goal.md"));

  const report = await runGoalLoop({
    goal: "runner-fixture",
    workspaceRoot: tempDir,
    skillRoot: join(repoRoot, "goalbuddy"),
    maxTurns: 1,
    dryRun: true,
    json: true,
    sessionLog: false,
    mockAgentText: scoutReceiptText,
    log: () => {},
  });

  assert.equal(report.turns.length, 1);
  assert.equal(report.turns[0].phase, "complete");
  assert.equal(report.stop_reason, "max_turns");

  rmSync(tempDir, { recursive: true, force: true });
});

test("createSdkExecutor is exported from @goalbuddy/runner", () => {
  assert.equal(typeof createSdkExecutor, "function");
});

test("@goalbuddy/runner package build output exists", () => {
  const dist = join(repoRoot, "packages", "goal-runner", "dist", "index.js");
  assert.equal(existsSync(dist), true);
});
