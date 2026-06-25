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
} from "../../dist/mcp/tools.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const skillRoot = join(repoRoot, "cursor-curator");
const smokeSlug = "sample-cursor-smoke";

process.env.CURATOR_SKILL_ROOT = skillRoot;
const previousGoalWorkspace = process.env.CURATOR_WORKSPACE;
process.env.CURATOR_WORKSPACE = repoRoot;

test("resolveObjectiveStatePath stays under docs/objectives", () => {
  const statePath = resolveObjectiveStatePath(smokeSlug, repoRoot);
  assert.match(statePath, /docs[/\\]objectives[/\\]sample-cursor-smoke[/\\]state\.json$/);
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
    assert.match(statePath, /sample-cursor-smoke[/\\]state\.json$/);
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
  assert.equal(entry.command, "node");
  assert.equal(entry.cwd, ".");
  assert.equal(
    resolve(String(entry.args[0])),
    resolve(skillRoot, "dist", "mcp", "server.mjs"),
  );
});

test("buildMcpServerEntryForProject uses dist launcher for external repos", () => {
  const externalRoot = resolve(repoRoot, "..", "external-goal-project");
  const entry = buildMcpServerEntryForProject(externalRoot, skillRoot);
  assert.equal(entry.command, "node");
  assert.equal(entry.cwd, ".");
  assert.equal(
    resolve(String(entry.args[0])),
    resolve(skillRoot, "dist", "mcp", "server.mjs"),
  );
});

test("buildMcpServerEntryForProject uses portable repo-relative dist path", () => {
  const entry = buildMcpServerEntryForProject(repoRoot, skillRoot);
  assert.equal(entry.command, "node");
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
