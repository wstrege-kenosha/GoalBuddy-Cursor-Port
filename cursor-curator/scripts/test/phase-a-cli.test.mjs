import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { checkCompletionReadiness } from "../lib/objective-completion.mjs";
import { buildHubPayload } from "../lib/objective-hub.mjs";
import { validateReceipt } from "../lib/objective-receipt.mjs";
import { findStaleGoals } from "../lib/objective-stale.mjs";
import { createParallelPlan } from "../parallel-plan.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const smokeGoal = join(repoRoot, "docs/objectives/sample-cursor-smoke");

test("validateReceipt accepts worker receipt shape", () => {
  const result = validateReceipt({
    cursor_curator_receipt_v1: {
      result: "done",
      task_id: "T003",
      board_path: "docs/objectives/sample/state.yaml",
      changed_files: ["README.md"],
      commands: [{ cmd: "npm run check", status: "pass" }],
      summary: "Updated readme.",
    },
  }, { role: "worker", expectedTaskId: "T003" });
  assert.equal(result.ok, true);
});

test("checkCompletionReadiness is not ready for active smoke objective", () => {
  const result = checkCompletionReadiness(join(smokeGoal, "state.yaml"));
  assert.equal(result.ready, false);
  assert.equal(result.validation_ok, true);
});

test("buildHubPayload discovers repo goals", () => {
  const payload = buildHubPayload({ roots: [repoRoot] });
  assert.ok(payload.objective_count >= 2);
  assert.ok(payload.goals.some((goal) => goal.slug === "sample-cursor-smoke"));
  assert.equal(payload.repo?.portLabel, "wstrege-kenosha/Cursor-Curator");
  assert.equal(payload.repo?.upstreamLabel, "tolibear/goalbuddy");
  assert.equal(payload.repo?.cursorPortVersion, "4.0.0");
});

test("findStaleGoals returns structured report", () => {
  const result = findStaleGoals({ days: 0, roots: [repoRoot] });
  assert.ok(Array.isArray(result.goals));
});

test("parallel-plan includes spawn_plan array", () => {
  const plan = createParallelPlan({ objectiveRoot: smokeGoal, json: true });
  assert.ok(Array.isArray(plan.spawn_plan));
  assert.ok(Array.isArray(plan.candidates));
});
