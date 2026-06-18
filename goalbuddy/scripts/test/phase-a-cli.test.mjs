import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { checkCompletionReadiness } from "../lib/goal-completion.mjs";
import { buildHubPayload } from "../lib/goal-hub.mjs";
import { validateReceipt } from "../lib/goal-receipt.mjs";
import { findStaleGoals } from "../lib/goal-stale.mjs";
import { createParallelPlan } from "../parallel-plan.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const smokeGoal = join(repoRoot, "docs/goals/sample-cursor-smoke");

test("validateReceipt accepts worker receipt shape", () => {
  const result = validateReceipt({
    goalbuddy_receipt_v1: {
      result: "done",
      task_id: "T003",
      board_path: "docs/goals/sample/state.yaml",
      changed_files: ["README.md"],
      commands: [{ cmd: "npm run check", status: "pass" }],
      summary: "Updated readme.",
    },
  }, { role: "worker", expectedTaskId: "T003" });
  assert.equal(result.ok, true);
});

test("checkCompletionReadiness is not ready for active smoke goal", () => {
  const result = checkCompletionReadiness(join(smokeGoal, "state.yaml"));
  assert.equal(result.ready, false);
  assert.equal(result.validation_ok, true);
});

test("buildHubPayload discovers repo goals", () => {
  const payload = buildHubPayload({ roots: [repoRoot] });
  assert.ok(payload.goal_count >= 2);
  assert.ok(payload.goals.some((goal) => goal.slug === "sample-cursor-smoke"));
});

test("findStaleGoals returns structured report", () => {
  const result = findStaleGoals({ days: 0, roots: [repoRoot] });
  assert.ok(Array.isArray(result.goals));
});

test("parallel-plan includes spawn_plan array", () => {
  const plan = createParallelPlan({ goalRoot: smokeGoal, json: true });
  assert.ok(Array.isArray(plan.spawn_plan));
  assert.ok(Array.isArray(plan.candidates));
});
