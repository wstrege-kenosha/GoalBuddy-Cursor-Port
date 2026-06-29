import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { buildMcpServerEntry, buildMcpServerEntryForProject, checkMcpConfig, installMcpConfig, mergeMcpConfig, readPortConfig, resolveMcpRepoRoot } from "../../dist/install/install-mcp.mjs";
import { resolveObjectiveStatePath, getWorkspaceRoot, resolveWorkspaceForObjective, registerKnownWorkspace } from "../../dist/mcp/path-utils.mjs";
import {
  runMcpSmokeTest,
  toolCompletionCheck,
  toolGetActiveTask,
  toolListObjectives,
  toolMisfireAuditCheck,
  toolRenderTaskPrompt,
  toolSessionResumeDigest,
  toolSubobjectiveRollupCheck,
  toolValidateReceipt,
  toolValidateState,
  toolBlockedTasks,
  toolGetUsageSummary,
} from "../../dist/mcp/tools.mjs";

import { importObjectiveFixture } from "../../dist/db/state-repository.mjs";
import { createBoardPayload } from "../../dist/board/objective-board.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const skillRoot = join(repoRoot, "cursor-curator");
const smokeSlug = "sample-cursor-smoke";
const subobjectiveParentSlug = "subobjective-parent-board";
const subobjectiveParentDir = join(
  repoRoot,
  "cursor-curator/surfaces/local-objective-board/examples/subobjective-parent",
);

process.env.CURATOR_SKILL_ROOT = skillRoot;
const previousGoalWorkspace = process.env.CURATOR_WORKSPACE;
process.env.CURATOR_WORKSPACE = repoRoot;
const previousWorkspacePaths = process.env.WORKSPACE_FOLDER_PATHS;
process.env.WORKSPACE_FOLDER_PATHS = repoRoot;
importObjectiveFixture(repoRoot, "sample-cursor-smoke");
importObjectiveFixture(repoRoot, "board-examples/subobjective-parent", {
  dirPath: subobjectiveParentDir,
});

test("registerKnownWorkspace skips write when workspace list is unchanged", () => {
  const configPath = join(skillRoot, "known-workspaces.json");
  const previous = existsSync(configPath) ? readFileSync(configPath, "utf8") : null;
  try {
    registerKnownWorkspace(repoRoot);
    const afterFirst = readFileSync(configPath, "utf8");
    const first = registerKnownWorkspace(repoRoot);
    assert.equal(first.reason, "unchanged");
    const afterSecond = readFileSync(configPath, "utf8");
    assert.equal(afterFirst, afterSecond);
  } finally {
    if (previous === null) {
      if (existsSync(configPath)) unlinkSync(configPath);
    } else {
      writeFileSync(configPath, previous, "utf8");
    }
  }
});

test("resolveObjectiveStatePath returns logical db board path", () => {
  const statePath = resolveObjectiveStatePath(smokeSlug, repoRoot);
  assert.equal(statePath, "db:sample-cursor-smoke");
});

test("resolveObjectiveStatePath rejects escape attempts", () => {
  assert.throws(() => resolveObjectiveStatePath("../../package.json", repoRoot));
});

test("getWorkspaceRoot prefers CURATOR_WORKSPACE when forced", () => {
  const previous = process.env.CURATOR_WORKSPACE;
  const previousForce = process.env.CURATOR_WORKSPACE_FORCE;
  const previousWorkspace = process.env.WORKSPACE_FOLDER_PATHS;
  process.env.CURATOR_WORKSPACE = join(repoRoot, "docs");
  process.env.CURATOR_WORKSPACE_FORCE = "1";
  process.env.WORKSPACE_FOLDER_PATHS = repoRoot;
  try {
    assert.equal(getWorkspaceRoot(), resolve(join(repoRoot, "docs")));
  } finally {
    if (previous === undefined) {
      delete process.env.CURATOR_WORKSPACE;
    } else {
      process.env.CURATOR_WORKSPACE = previous;
    }
    if (previousForce === undefined) {
      delete process.env.CURATOR_WORKSPACE_FORCE;
    } else {
      process.env.CURATOR_WORKSPACE_FORCE = previousForce;
    }
    if (previousWorkspace === undefined) {
      delete process.env.WORKSPACE_FOLDER_PATHS;
    } else {
      process.env.WORKSPACE_FOLDER_PATHS = previousWorkspace;
    }
  }
});

test("getWorkspaceRoot prefers WORKSPACE_FOLDER_PATHS over stale home CURATOR_WORKSPACE", () => {
  const previousWorkspace = process.env.WORKSPACE_FOLDER_PATHS;
  const previousGoalWorkspace = process.env.CURATOR_WORKSPACE;
  process.env.CURATOR_WORKSPACE = homedir();
  process.env.WORKSPACE_FOLDER_PATHS = repoRoot;
  try {
    assert.equal(getWorkspaceRoot(), repoRoot);
  } finally {
    if (previousWorkspace === undefined) {
      delete process.env.WORKSPACE_FOLDER_PATHS;
    } else {
      process.env.WORKSPACE_FOLDER_PATHS = previousWorkspace;
    }
    if (previousGoalWorkspace === undefined) {
      delete process.env.CURATOR_WORKSPACE;
    } else {
      process.env.CURATOR_WORKSPACE = previousGoalWorkspace;
    }
  }
});

test("resolveWorkspaceForObjective finds objective in registered workspace when cwd is home", () => {
  const previousGoalWorkspace = process.env.CURATOR_WORKSPACE;
  const configPath = join(skillRoot, "known-workspaces.json");
  const previousConfig = existsSync(configPath) ? readFileSync(configPath, "utf8") : null;
  delete process.env.CURATOR_WORKSPACE;
  registerKnownWorkspace(repoRoot);
  try {
    assert.equal(resolveWorkspaceForObjective(smokeSlug), repoRoot);
    const statePath = resolveObjectiveStatePath(smokeSlug);
    assert.equal(statePath, "db:sample-cursor-smoke");
  } finally {
    if (previousGoalWorkspace === undefined) {
      delete process.env.CURATOR_WORKSPACE;
    } else {
      process.env.CURATOR_WORKSPACE = previousGoalWorkspace;
    }
    if (previousConfig === null) {
      if (existsSync(configPath)) {
        unlinkSync(configPath);
      }
    } else {
      writeFileSync(configPath, previousConfig, "utf8");
    }
  }
});

test("getWorkspaceRoot uses WORKSPACE_FOLDER_PATHS when cwd is home", () => {
  const previousWorkspace = process.env.WORKSPACE_FOLDER_PATHS;
  const previousGoalWorkspace = process.env.CURATOR_WORKSPACE;
  delete process.env.CURATOR_WORKSPACE;
  process.env.WORKSPACE_FOLDER_PATHS = repoRoot;
  try {
    assert.equal(getWorkspaceRoot(), repoRoot);
  } finally {
    if (previousWorkspace === undefined) {
      delete process.env.WORKSPACE_FOLDER_PATHS;
    } else {
      process.env.WORKSPACE_FOLDER_PATHS = previousWorkspace;
    }
    if (previousGoalWorkspace === undefined) {
      delete process.env.CURATOR_WORKSPACE;
    } else {
      process.env.CURATOR_WORKSPACE = previousGoalWorkspace;
    }
  }
});

test("getWorkspaceRoot splits comma-separated WORKSPACE_FOLDER_PATHS", () => {
  const previousWorkspace = process.env.WORKSPACE_FOLDER_PATHS;
  const previousGoalWorkspace = process.env.CURATOR_WORKSPACE;
  delete process.env.CURATOR_WORKSPACE;
  process.env.WORKSPACE_FOLDER_PATHS = `${join(tmpdir(), "missing-root")},${repoRoot},${join(tmpdir(), "other-missing")}`;
  try {
    assert.equal(getWorkspaceRoot(), repoRoot);
    const result = toolSessionResumeDigest({ objective: smokeSlug });
    assert.equal(result.slug, smokeSlug);
    assert.equal(result.validation.ok, true);
  } finally {
    if (previousWorkspace === undefined) {
      delete process.env.WORKSPACE_FOLDER_PATHS;
    } else {
      process.env.WORKSPACE_FOLDER_PATHS = previousWorkspace;
    }
    if (previousGoalWorkspace === undefined) {
      delete process.env.CURATOR_WORKSPACE;
    } else {
      process.env.CURATOR_WORKSPACE = previousGoalWorkspace;
    }
  }
});

test("toolSessionResumeDigest resolves objectives when WORKSPACE_FOLDER_PATHS uses lowercase drive letter", () => {
  const previousWorkspace = process.env.WORKSPACE_FOLDER_PATHS;
  const previousGoalWorkspace = process.env.CURATOR_WORKSPACE;
  delete process.env.CURATOR_WORKSPACE;
  const lowerDriveRoot = repoRoot.replace(/^([A-Z]):/, (_, drive) => `${drive.toLowerCase()}:`);
  process.env.WORKSPACE_FOLDER_PATHS = lowerDriveRoot;
  try {
    const result = toolSessionResumeDigest({ objective: smokeSlug });
    assert.equal(result.slug, smokeSlug);
    assert.equal(result.validation.ok, true);
  } finally {
    if (previousWorkspace === undefined) {
      delete process.env.WORKSPACE_FOLDER_PATHS;
    } else {
      process.env.WORKSPACE_FOLDER_PATHS = previousWorkspace;
    }
    if (previousGoalWorkspace === undefined) {
      delete process.env.CURATOR_WORKSPACE;
    } else {
      process.env.CURATOR_WORKSPACE = previousGoalWorkspace;
    }
  }
});

test("resolveWorkspaceForObjective finds objective slug across comma-separated WORKSPACE_FOLDER_PATHS", () => {
  const previousWorkspace = process.env.WORKSPACE_FOLDER_PATHS;
  const previousGoalWorkspace = process.env.CURATOR_WORKSPACE;
  delete process.env.CURATOR_WORKSPACE;
  process.env.WORKSPACE_FOLDER_PATHS = `${join(tmpdir(), "missing-root")},${repoRoot},${join(tmpdir(), "other-missing")}`;
  try {
    assert.equal(resolveWorkspaceForObjective(smokeSlug), repoRoot);
    const result = toolSessionResumeDigest({ objective: smokeSlug });
    assert.equal(result.slug, smokeSlug);
    assert.equal(result.validation.ok, true);
  } finally {
    if (previousWorkspace === undefined) {
      delete process.env.WORKSPACE_FOLDER_PATHS;
    } else {
      process.env.WORKSPACE_FOLDER_PATHS = previousWorkspace;
    }
    if (previousGoalWorkspace === undefined) {
      delete process.env.CURATOR_WORKSPACE;
    } else {
      process.env.CURATOR_WORKSPACE = previousGoalWorkspace;
    }
  }
});

test("toolValidateState passes smoke objective", () => {
  const result = toolValidateState({ objective: smokeSlug });
  assert.equal(result.ok, true);
  assert.equal(result.slug, smokeSlug);
});

test("toolGetActiveTask returns active task row", () => {
  const result = toolGetActiveTask({ objective: smokeSlug });
  assert.match(result.task.id, /^T\d{3}$/);
  assert.ok(result.task.type);
});

test("toolRenderTaskPrompt includes cursor subagent metadata", () => {
  const result = toolRenderTaskPrompt({ objective: smokeSlug });
  assert.ok(result.metadata.board_path);
  assert.ok(result.task.id);
  assert.ok("cursor_task_subagent_type" in result.metadata);
});

test("toolValidateReceipt rejects malformed receipt", () => {
  const result = toolValidateReceipt({ receipt: { bad: true }, role: "worker" });
  assert.equal(result.ok, false);
});

test("toolCompletionCheck reports ready for completed sample-cursor-smoke objective", () => {
  const result = toolCompletionCheck({ objective: smokeSlug });
  assert.equal(result.ready, true);
  assert.equal(result.validation_ok, true);
});

test("toolListObjectives discovers repo objectives", () => {
  const result = toolListObjectives({});
  assert.ok(result.objective_count >= 1);
  assert.ok(result.objectives.some((entry) => entry.slug === "sample-cursor-smoke"));
});

test("toolListObjectives include_usage adds usage fields", () => {
  const base = toolListObjectives({});
  const smokeBase = base.objectives.find((entry) => entry.slug === smokeSlug);
  assert.ok(smokeBase);
  assert.equal(smokeBase.usage_summary, undefined);

  const withUsage = toolListObjectives({ include_usage: true });
  const smokeWithUsage = withUsage.objectives.find((entry) => entry.slug === smokeSlug);
  assert.ok(smokeWithUsage);
  assert.ok(smokeWithUsage.usage_summary);
  assert.ok(smokeWithUsage.usage_rollup);
  assert.equal(typeof smokeWithUsage.usage_has_unattributed, "boolean");
});

test("toolGetUsageSummary returns usage board view for smoke objective", () => {
  const result = toolGetUsageSummary({ objective: smokeSlug });
  assert.equal(result.objective_slug, smokeSlug);
  assert.ok(result.usage);
  assert.equal(result.usage.visible, true);
  assert.match(result.usage.summary, /agent time/);
  assert.equal(result.include_subobjectives, true);
});

test("toolGetUsageSummary respects include_subobjectives false", () => {
  const result = toolGetUsageSummary({ objective: smokeSlug, include_subobjectives: false });
  assert.equal(result.include_subobjectives, false);
  assert.equal(result.rollup_includes_subobjectives, false);
  assert.deepEqual(result.children, {});
});

test("board createBoardPayload rollup matches get_usage_summary for subobjective parent", () => {
  const boardPayload = createBoardPayload(subobjectiveParentDir);
  const mcpSummary = toolGetUsageSummary({ objective: subobjectiveParentSlug });

  assert.equal(mcpSummary.rollup_includes_subobjectives, true);
  assert.equal(boardPayload.usage.rollup.duration_ms, mcpSummary.usage.rollup.duration_ms);
  assert.equal(boardPayload.usage.rollup.session_count, mcpSummary.usage.rollup.session_count);
  assert.equal(boardPayload.usage.rollup.input_tokens, mcpSummary.usage.rollup.input_tokens);
  assert.equal(boardPayload.usage.rollup.output_tokens, mcpSummary.usage.rollup.output_tokens);
  assert.equal(boardPayload.usage.summary, mcpSummary.usage.summary);
  assert.equal(boardPayload.usage.visible, mcpSummary.usage.visible);
  assert.equal(boardPayload.usage.rollup.duration_ms, 150_000);
  assert.equal(boardPayload.usage.rollup.session_count, 2);
});

test("toolSessionResumeDigest returns handoff fields", () => {
  const result = toolSessionResumeDigest({ objective: smokeSlug });
  assert.equal(result.slug, smokeSlug);
  assert.ok(result.validation);
  assert.ok("session" in result);
});

test("toolMisfireAuditCheck returns audit status", () => {
  const result = toolMisfireAuditCheck({ objective: smokeSlug });
  assert.equal(typeof result.must_audit, "boolean");
  assert.ok(result.recommendation);
});

test("toolSubobjectiveRollupCheck returns pending rollups list", () => {
  const result = toolSubobjectiveRollupCheck({ objective: smokeSlug });
  assert.equal(typeof result.pending_count, "number");
  assert.ok(Array.isArray(result.pending_rollups));
});

test("toolBlockedTasks returns blocked task array", () => {
  const result = toolBlockedTasks({ objective: smokeSlug, triage: true });
  assert.ok(Array.isArray(result.blocked_tasks));
  assert.ok(result.triage);
});

test("runMcpSmokeTest passes on sample objective", () => {
  const result = runMcpSmokeTest({ workspaceRoot: repoRoot, objective: smokeSlug });
  assert.equal(result.ok, true);
  assert.equal(result.validation_ok, true);
});

test("mergeMcpConfig preserves other servers", () => {
  const merged = mergeMcpConfig({ mcpServers: { other: { command: "echo" } } }, buildMcpServerEntry(skillRoot));
  assert.ok(merged.mcpServers.other);
  assert.ok(merged.mcpServers["cursor-curator"]);
});

test("buildMcpServerEntry points at dist MCP server", () => {
  const entry = buildMcpServerEntry(skillRoot);
  assert.equal(entry.command, "bun");
  assert.equal(entry.cwd, ".");
  assert.equal(
    resolve(String(entry.args[0])),
    resolve(skillRoot, "dist", "mcp", "server.mjs"),
  );
});

test("buildMcpServerEntryForProject uses dist launcher for external repos", () => {
  const externalRoot = resolve(repoRoot, "..", "external-goal-project");
  const entry = buildMcpServerEntryForProject(externalRoot, skillRoot);
  assert.equal(entry.command, "bun");
  assert.equal(entry.cwd, ".");
  assert.equal(
    resolve(String(entry.args[0])),
    resolve(skillRoot, "dist", "mcp", "server.mjs"),
  );
});

test("buildMcpServerEntryForProject uses portable repo-relative dist path", () => {
  const entry = buildMcpServerEntryForProject(repoRoot, skillRoot);
  assert.equal(entry.command, "bun");
  assert.deepEqual(entry.args, ["cursor-curator/dist/mcp/server.mjs"]);
  assert.equal(entry.cwd, ".");
  assert.equal(entry.args.some((arg) => arg.includes("Users")), false);
});

test("installMcpConfig writes user-level and project configs", () => {
  const tempHome = mkdtempSync(join(tmpdir(), "cursor-curator-mcp-"));
  const userConfigPath = join(tempHome, "mcp.json");
  writeFileSync(
    userConfigPath,
    `${JSON.stringify({ mcpServers: { other: { command: "echo" } } }, null, 2)}\n`,
    "utf8",
  );

  const result = installMcpConfig({
    skillRoot,
    projectRoots: [repoRoot],
    cursorHome: tempHome,
    repoRoot,
  });

  assert.equal(result.installed.length, 2);
  const userConfig = JSON.parse(readFileSync(userConfigPath, "utf8"));
  assert.ok(userConfig.mcpServers.other);
  assert.ok(userConfig.mcpServers["cursor-curator"]);
  assert.equal(
    resolve(String(userConfig.mcpServers["cursor-curator"].args[0])),
    resolve(skillRoot, "dist", "mcp", "server.mjs"),
  );
  assert.equal(readPortConfig(skillRoot)?.repoRoot, repoRoot);
});

test("resolveMcpRepoRoot finds repo deps from port config", () => {
  installMcpConfig({
    skillRoot,
    projectRoots: [repoRoot],
    repoRoot,
  });
  assert.equal(resolveMcpRepoRoot(skillRoot), repoRoot);
});

test("checkMcpConfig accepts repo project config", () => {
  const configPath = join(repoRoot, ".cursor", "mcp.json");
  const check = checkMcpConfig(configPath, skillRoot);
  assert.equal(check.ok, true);
  assert.equal(existsSync(check.server_path), true);
});
