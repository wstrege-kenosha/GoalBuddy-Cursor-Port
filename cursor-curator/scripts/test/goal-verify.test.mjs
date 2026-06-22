import assert from "node:assert/strict";
import { test } from "node:test";
import {
  crossCheckWorkerReceipt,
  formatLastVerificationYaml,
  readLastVerificationFromState,
  verifyWorkerReceiptForTask,
} from "../lib/goal-verify.mjs";

test("crossCheckWorkerReceipt matches verify commands with pass status", () => {
  const result = crossCheckWorkerReceipt(
    { id: "T003", verify: ["npm run check"] },
    {
      task_id: "T003",
      commands: [{ cmd: "npm run check", status: "pass" }],
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.matched.length, 1);
});

test("crossCheckWorkerReceipt fails when verify command missing", () => {
  const result = crossCheckWorkerReceipt(
    { id: "T003", verify: ["npm run check"] },
    { task_id: "T003", commands: [] },
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /Missing receipt command/);
});

test("readLastVerificationFromState parses checks.last_verification", () => {
  const text = `version: 2
checks:
  last_verification:
    result: pass
    task: T003
    commands:
      - cmd: "npm run check"
        status: pass
`;
  const parsed = readLastVerificationFromState(text);
  assert.equal(parsed.result, "pass");
  assert.equal(parsed.task, "T003");
  assert.equal(parsed.commands[0].cmd, "npm run check");
});

test("verifyWorkerReceiptForTask emits yaml patch", () => {
  const result = verifyWorkerReceiptForTask(
    { id: "T003", verify: ["npm run check"] },
    {
      task_id: "T003",
      commands: [{ cmd: "npm run check", status: "pass" }],
    },
  );
  assert.equal(result.ok, true);
  assert.match(result.last_verification_yaml, /last_verification:/);
  assert.match(formatLastVerificationYaml(result.last_verification), /result: pass/);
});
