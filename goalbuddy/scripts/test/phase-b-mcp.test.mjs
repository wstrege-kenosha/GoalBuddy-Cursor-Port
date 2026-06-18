import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { buildMcpServerEntry, checkMcpConfig, mergeMcpConfig } from "../install-mcp.mjs";
import { resolveGoalStatePath } from "../../mcp/path-utils.mjs";
import {
  runMcpSmokeTest,
  toolCompletionCheck,
  toolGetActiveTask,
  toolListGoals,
  toolRenderTaskPrompt,
  toolValidateReceipt,
  toolValidateState,
} from "../../mcp/tools.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const skillRoot = join(repoRoot, "goalbuddy");
const smokeSlug = "sample-cursor-smoke";

test("resolveGoalStatePath stays under docs/goals", () => {
  const statePath = resolveGoalStatePath(smokeSlug, repoRoot);
  assert.match(statePath, /docs[/\\]goals[/\\]sample-cursor-smoke[/\\]state\.yaml$/);
});

test("resolveGoalStatePath rejects escape attempts", () => {
  assert.throws(() => resolveGoalStatePath("../../package.json", repoRoot));
});

test("toolValidateState passes smoke goal", () => {
  const result = toolValidateState({ goal: smokeSlug });
  assert.equal(result.ok, true);
  assert.equal(result.slug, smokeSlug);
});

test("toolGetActiveTask returns active task row", () => {
  const result = toolGetActiveTask({ goal: smokeSlug });
  assert.match(result.task.id, /^T\d{3}$/);
  assert.ok(result.task.type);
});

test("toolRenderTaskPrompt includes cursor subagent metadata", () => {
  const result = toolRenderTaskPrompt({ goal: smokeSlug });
  assert.ok(result.metadata.board_path);
  assert.ok(result.task.id);
  assert.ok("cursor_task_subagent_type" in result.metadata);
});

test("toolValidateReceipt rejects malformed receipt", () => {
  const result = toolValidateReceipt({ receipt: { bad: true }, role: "worker" });
  assert.equal(result.ok, false);
});

test("toolCompletionCheck reports not ready for active smoke goal", () => {
  const result = toolCompletionCheck({ goal: smokeSlug });
  assert.equal(result.ready, false);
  assert.equal(result.validation_ok, true);
});

test("toolListGoals discovers repo goals", () => {
  const result = toolListGoals({});
  assert.ok(result.goal_count >= 2);
  assert.ok(result.goals.some((goal) => goal.slug === smokeSlug));
});

test("runMcpSmokeTest passes on sample goal", () => {
  const result = runMcpSmokeTest({ workspaceRoot: repoRoot, goal: smokeSlug });
  assert.equal(result.ok, true);
  assert.equal(result.validation_ok, true);
});

test("mergeMcpConfig preserves other servers", () => {
  const merged = mergeMcpConfig({ mcpServers: { other: { command: "echo" } } }, buildMcpServerEntry(skillRoot));
  assert.ok(merged.mcpServers.other);
  assert.ok(merged.mcpServers.goalbuddy);
});

test("checkMcpConfig accepts repo project config", () => {
  const configPath = join(repoRoot, ".cursor", "mcp.json");
  const check = checkMcpConfig(configPath, skillRoot);
  assert.equal(check.ok, true);
  assert.equal(existsSync(check.server_path), true);
});
