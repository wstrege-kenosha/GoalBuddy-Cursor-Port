import assert from "node:assert/strict";
import { test } from "node:test";
import {
  crossCheckWorkerReceipt,
  readLastVerificationFromState,
  verifyWorkerReceiptForTask,
} from "../../dist/verify/objective-verify.mjs";

test("crossCheckWorkerReceipt matches verify commands with pass status", () => {
  const result = crossCheckWorkerReceipt(
    { id: "T003", verify: ["bun run check"] },
    {
      task_id: "T003",
      commands: [{ cmd: "bun run check", status: "pass" }],
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.matched.length, 1);
});

test("crossCheckWorkerReceipt fails when verify command missing", () => {
  const result = crossCheckWorkerReceipt(
    { id: "T003", verify: ["bun run check"] },
    { task_id: "T003", commands: [] },
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /Missing receipt command/);
});

test("readLastVerificationFromState parses JSON checks.last_verification", () => {
  const text = JSON.stringify({
    version: 3,
    checks: {
      last_verification: {
        result: "pass",
        task: "T003",
        commands: [{ cmd: "bun run check", status: "pass" }],
      },
    },
  });
  const parsed = readLastVerificationFromState(text);
  assert.equal(parsed?.result, "pass");
  assert.equal(parsed?.task, "T003");
  assert.equal(parsed?.commands[0].cmd, "bun run check");
});

test("verifyWorkerReceiptForTask returns structured last_verification patch", () => {
  const result = verifyWorkerReceiptForTask(
    { id: "T003", verify: ["bun run check"] },
    {
      task_id: "T003",
      commands: [{ cmd: "bun run check", status: "pass" }],
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.last_verification.result, "pass");
  assert.equal(result.last_verification.task, "T003");
});
