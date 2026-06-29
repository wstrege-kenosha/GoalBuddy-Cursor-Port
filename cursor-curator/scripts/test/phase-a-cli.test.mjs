import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { checkCompletionReadiness } from "../../dist/completion/objective-completion.mjs";
import { buildHubPayload } from "../../dist/hub/objective-hub.mjs";
import { validateReceipt } from "../../dist/receipt/objective-receipt.mjs";
import { findStaleObjectives } from "../../dist/stale/objective-stale.mjs";
import { createParallelPlan } from "../../dist/prompt/parallel-plan.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const smokeGoal = join(repoRoot, "docs/objectives/sample-cursor-smoke");

test("validateReceipt accepts worker receipt shape", () => {
  const result = validateReceipt({
    cursor_curator_receipt_v1: {
      result: "done",
      task_id: "T003",
      board_path: "docs/objectives/sample/state.json",
      changed_files: ["README.md"],
      commands: [{ cmd: "npm run check", status: "pass" }],
      summary: "Updated readme.",
    },
  }, { role: "worker", expectedTaskId: "T003" });
  assert.equal(result.ok, true);
});

test("checkCompletionReadiness reports ready for completed sample-cursor-smoke objective", async () => {
  const statePath = join(smokeGoal, "state.json");
  const result = checkCompletionReadiness(statePath);
  assert.equal(result.ready, true);
  const { validateObjectiveStateFile } = await import("../../dist/mcp/validate-state-bridge.mjs");
  assert.equal(validateObjectiveStateFile(statePath).ok, true);
});

test("buildHubPayload discovers repo objectives", () => {
  const payload = buildHubPayload({ roots: [repoRoot] });
  assert.ok(payload.objective_count >= 1);
  assert.ok(payload.objectives.some((objective) => objective.slug === "sample-cursor-smoke"));
  assert.equal(payload.repo?.portLabel, "wstrege-kenosha/Cursor-Curator");
  assert.equal(payload.repo?.upstreamLabel, "tolibear/goalbuddy");
  assert.equal(payload.repo?.cursorPortVersion, "4.0.0");
});

test("findStaleObjectives returns structured report", () => {
  const result = findStaleObjectives({ days: 0, roots: [repoRoot] });
  assert.ok(Array.isArray(result.objectives));
});

test("parallel-plan includes spawn_plan array and spawn metadata", () => {
  const plan = createParallelPlan({ objectiveRoot: smokeGoal, json: true });
  assert.ok(Array.isArray(plan.spawn_plan));
  assert.ok(Array.isArray(plan.candidates));
  assert.ok(["parallel", "serial"].includes(plan.spawn_mode));
  assert.equal(typeof plan.max_write_workers, "number");
  assert.equal(typeof plan.worker_candidate_count, "number");
});
