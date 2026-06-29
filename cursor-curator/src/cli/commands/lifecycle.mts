import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import dns from "node:dns/promises";
import net from "node:net";
import { installCursorSurfaces, resetCursorSurfaces } from "../../install/install-agents.mjs";
import {
  checkMcpConfig,
  defaultProjectRootsFromSkill,
  ensureProjectMcpConfig,
  installMcpConfig,
} from "../../install/install-mcp.mjs";
import { installCliBin, resolveCliBinDir } from "../../install/install-cli-bin.mjs";
import {
  buildDirectCliInvokeHint,
  buildWindowsPathSessionRefreshCommand,
  ensureCliOnPath,
  isPathEntryPresent,
} from "../../install/install-cli-path.mjs";
import { getWorkspaceRoot, registerKnownWorkspace } from "../../mcp/path-utils.mjs";
import { runMcpSmokeTest } from "../../mcp/tools.mjs";
import { buildUpdateReport } from "../check-update.mjs";
import { runReinstallClean } from "../../install/reinstall-clean.mjs";
import { openDatabase } from "../../db/connection.mjs";
import type { CuratorCliContext } from "../curator-context.mjs";

const REQUIRED_AGENTS = ["objective-scout.md", "objective-approval-gate.md", "objective-worker.md"];
const REQUIRED_COMMANDS = ["objective-prep.md", "objective.md", "objective-board.md"];

export function runInstall(ctx: CuratorCliContext): void {
  const force = ctx.hasFlag("--force");
  const result = installCursorSurfaces({ force, quiet: false });
  if (result.errors.length) {
    console.error(result.errors.join("\n"));
    process.exit(1);
  }

  const projectRoots = defaultProjectRootsFromSkill(ctx.skillRoot);
  const mcpResult = installMcpConfig({
    skillRoot: ctx.skillRoot,
    projectRoots,
    cursorHome: ctx.cursorHome,
    repoRoot: process.env.CURATOR_REPO_ROOT || projectRoots[0],
  });
  if (mcpResult.errors.length) {
    console.error(mcpResult.errors.join("\n"));
    process.exit(1);
  }

  const cliResult = installCliBin({ cursorHome: ctx.cursorHome, skillRoot: ctx.skillRoot });
  if (!cliResult.ok) {
    console.error(cliResult.error);
    process.exit(1);
  }

  const pathResult = ensureCliOnPath(cliResult.binDir, { enabled: !ctx.hasFlag("--no-add-to-path") });
  reportCliPathResult(pathResult, cliResult.pathHint);

  console.log("Cursor Curator install complete.");
  console.log(`Skills: ${join(ctx.cursorHome, "skills", "cursor-curator")}`);
  console.log(`CLI: ${cliResult.cmdPath}`);
  console.log(`Agents: ${join(ctx.cursorHome, "agents")}`);
  console.log(`Commands: ${join(ctx.cursorHome, "commands")}`);
  if (result.hooks) {
    console.log(`Hooks: ${result.hooks.path}`);
  }
  for (const entry of mcpResult.installed) {
    console.log(`MCP: ${entry.configPath}`);
  }
  const workspaceRoot = projectRoots[0] || process.cwd();
  if (existsSync(join(workspaceRoot, "docs", "objectives"))) {
    console.log("Run `curator db import` once to migrate any legacy state.json files into curator.db.");
  }
  console.log("Next: enable the cursor-curator MCP server in Cursor Settings → MCP, then /objective-prep and /objective.");
  console.log("User-level MCP (~/.cursor/mcp.json) works in every workspace; project .cursor/mcp.json is written for repos with docs/objectives/.");
}

export function runWorkspace(ctx: CuratorCliContext, subcommand: string): void {
  if (subcommand !== "register") {
    console.error("Usage: bun dist/cli/curator.mjs workspace register [--json]");
    process.exit(2);
  }

  const workspaceRoot = resolve(process.cwd());
  const json = ctx.hasFlag("--json");
  const registered = registerKnownWorkspace(workspaceRoot);
  const mcp = ensureProjectMcpConfig(workspaceRoot, ctx.skillRoot);
  const payload = {
    ok: registered.ok && mcp.ok,
    workspace_root: workspaceRoot,
    registered,
    mcp,
  };

  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    if (registered.ok) {
      console.log(`Registered workspace: ${workspaceRoot}`);
    } else {
      console.error(`Could not register workspace: ${registered.reason}`);
    }
    if (mcp.ok) {
      console.log(`MCP config: ${mcp.configPath}`);
    } else if (mcp.reason) {
      console.error(`MCP config skipped: ${mcp.reason}`);
    }
  }

  if (!payload.ok) {
    process.exit(1);
  }
}

export function runReset(ctx: CuratorCliContext): void {
  const { removed } = resetCursorSurfaces();
  console.log(`Reset removed ${removed.length} file(s). Skill payload kept at ${ctx.skillRoot}`);
}

export function runReinstall(ctx: CuratorCliContext): void {
  if (!ctx.hasFlag("--clean")) {
    console.error("Usage: bun dist/cli/curator.mjs reinstall --clean [--json] [--no-add-to-path]");
    console.error("Removes installed skills under ~/.cursor/skills, re-copies from the clone, and re-runs install.");
    console.error("Does not delete the Cursor-Curator source tree in your clone.");
    process.exit(2);
  }

  runReinstallClean({
    skillRoot: ctx.skillRoot,
    cursorHome: ctx.cursorHome,
    json: ctx.hasFlag("--json"),
    addToPath: !ctx.hasFlag("--no-add-to-path"),
  });
}

export async function runDoctor(ctx: CuratorCliContext): Promise<void> {
  const goalReady = ctx.hasFlag("--objective-ready");
  const json = ctx.hasFlag("--json");
  const checks = [];
  const cwd = resolve(process.cwd());
  if (existsSync(join(cwd, "docs", "objectives"))) {
    registerKnownWorkspace(cwd);
    ensureProjectMcpConfig(cwd, ctx.skillRoot);
    openDatabase(cwd);
  }

  checks.push(bunVersionCheck());
  checks.push(...requiredFilesCheck(ctx));
  checks.push(...installSurfacesCheck(ctx));
  checks.push(cliPathCheck(ctx));
  checks.push(...mcpConfigCheck(ctx));
  checks.push(mcpSmokeCheck());
  if (goalReady) {
    checks.push(...agentFrontmatterCheck(ctx));
    checks.push(...legacyInstallCheck(ctx));
    checks.push(await dnsCheck());
    checks.push(await portCheck());
  }

  const ok = checks.every((c) => c.ok);
  const report = { ok, target: "cursor", checks, skillRoot: ctx.skillRoot, version: ctx.versionInfo };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const c of checks) {
      console.log(`${c.ok ? "ok" : "fail"} ${c.name}${c.detail ? `: ${c.detail}` : ""}`);
    }
    if (!ok) console.error("\nDoctor found issues. Run: bun dist/cli/curator.mjs install");
    if (goalReady && ok) console.log("\nGoal-ready: Cursor surfaces look good. Restart Cursor if Task subagents are missing.");
  }
  if (!ok) process.exit(1);
}

export async function runUpdate(ctx: CuratorCliContext): Promise<void> {
  const payload = buildUpdateReport();
  if (ctx.hasFlag("--json")) {
    console.log(JSON.stringify({
      check: payload,
      skillRoot: ctx.skillRoot,
      note: "Vendored dist lives in ~/.cursor/skills/cursor-curator. Re-clone upstream or copy from a fresh clone to refresh.",
    }, null, 2));
  } else if (payload.update_available) {
    console.log(`cursor-curator ${payload.latest_version} available (installed port tracks ${ctx.versionInfo.upstreamVersion}).`);
    console.log("To refresh vendored files, re-run the port installer or copy from a fresh upstream clone.");
  } else {
    console.log(`Cursor Curator Cursor port is current with vendored upstream ${ctx.versionInfo.upstreamVersion}.`);
  }
}

function bunVersionCheck() {
  const version = process.versions.bun;
  return { name: "bun-installed", ok: Boolean(version), detail: version ?? "bun not detected" };
}

function requiredFilesCheck(ctx: CuratorCliContext) {
  const results = [];
  for (const rel of [
    "SKILL.md",
    "LICENSE",
    "version.json",
    "assets/curator-mark.png",
    "dist/mcp/server.mjs",
    "dist/mcp/tools.mjs",
    "dist/mcp/path-utils.mjs",
    "dist/cli/curator.mjs",
    "dist/board/objective-board.mjs",
    "dist/board/board-theme.mjs",
    "dist/board/port-metadata.mjs",
    "dist/board/local-objective-board.mjs",
    "dist/install/install-agents.mjs",
    "dist/install/install-mcp.mjs",
    "dist/install/install-cli-bin.mjs",
    "dist/install/install-cli-path.mjs",
    "dist/prompt/render-task-prompt.mjs",
    "dist/prompt/parallel-plan.mjs",
    "dist/cli/check-update.mjs",
  ]) {
    const path = join(ctx.skillRoot, rel);
    results.push({ name: `file:${rel}`, ok: existsSync(path), detail: path });
  }
  return results;
}

function installSurfacesCheck(ctx: CuratorCliContext) {
  const results = [];
  for (const file of REQUIRED_AGENTS) {
    const path = join(ctx.cursorHome, "agents", file);
    results.push({ name: `agent:${file}`, ok: existsSync(path), detail: path });
  }
  for (const file of REQUIRED_COMMANDS) {
    const path = join(ctx.cursorHome, "commands", file);
    results.push({ name: `command:${file}`, ok: existsSync(path), detail: path });
  }
  return results;
}

function cliPathCheck(ctx: CuratorCliContext) {
  const binDir = resolveCliBinDir(ctx.cursorHome);
  const onPath = isPathEntryPresent(process.env.PATH ?? "", binDir);
  return {
    name: "cli:path",
    ok: onPath,
    detail: onPath ? binDir : `From clone: bun run install:cursor (or add ${binDir} to PATH)`,
  };
}

function reportCliPathResult(
  pathResult: ReturnType<typeof ensureCliOnPath>,
  manualHint: string,
): void {
  if (pathResult.skipped) {
    console.log(pathResult.message);
    console.log(manualHint);
    return;
  }
  if (pathResult.ok) {
    console.log(`PATH: ${pathResult.message}`);
    if (pathResult.persisted) {
      if (process.platform === "win32") {
        console.log("PATH: restart Cursor so integrated terminals inherit User PATH.");
        console.log("PATH: or reload this PowerShell session:");
        console.log(`  ${buildWindowsPathSessionRefreshCommand()}`);
        console.log(`PATH: invoke now: ${buildDirectCliInvokeHint(pathResult.binDir)}`);
      } else {
        console.log("PATH: open a new terminal for the global curator command.");
      }
    }
    return;
  }
  console.warn(`PATH: ${pathResult.message}`);
  console.log(manualHint);
}

function mcpConfigCheck(ctx: CuratorCliContext) {
  const candidates = [
    join(process.cwd(), ".cursor", "mcp.json"),
    join(ctx.skillRoot, "..", ".cursor", "mcp.json"),
    join(ctx.cursorHome, "mcp.json"),
  ];
  const checks = candidates.map((configPath) => checkMcpConfig(configPath, ctx.skillRoot));
  const ok = checks.find((check) => check.ok);
  return ok ? [ok] : [checks[0]];
}

function mcpSmokeCheck() {
  try {
    const smoke = runMcpSmokeTest({
      workspaceRoot: getWorkspaceRoot(),
      objective: "sample-cursor-smoke",
    });
    return {
      name: "mcp:smoke",
      ok: smoke.ok,
      detail: smoke.validation_ok
        ? `validate_state ok on ${smoke.state_path}`
        : `validation failed on ${smoke.state_path}`,
    };
  } catch (error) {
    return { name: "mcp:smoke", ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function agentFrontmatterCheck(ctx: CuratorCliContext) {
  const results = [];
  for (const file of REQUIRED_AGENTS) {
    const path = join(ctx.cursorHome, "agents", file);
    if (!existsSync(path)) {
      results.push({ name: `frontmatter:${file}`, ok: false, detail: "missing" });
      continue;
    }
    const text = readFileSync(path, "utf8");
    const ok = /^---\s*\nname:\s*objective-(scout|approval-gate|worker)/m.test(text);
    results.push({ name: `frontmatter:${file}`, ok, detail: ok ? "valid" : "invalid frontmatter" });
  }
  return results;
}

async function dnsCheck() {
  try {
    const records = await dns.lookup("curator.localhost");
    const ok = records.address === "127.0.0.1" || records.address === "::1";
    return { name: "dns:curator.localhost", ok, detail: records.address };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    return {
      name: "dns:curator.localhost",
      ok: true,
      detail: `${err.code || err.message}; use http://127.0.0.1:41737/<slug>/ if .localhost fails`,
    };
  }
}

function portCheck(): Promise<{ name: string; ok: boolean; detail: string }> {
  return new Promise((resolvePromise) => {
    const server = net.createServer();
    server.once("error", () => {
      resolvePromise({ name: "port:41737", ok: true, detail: "in use (board may already be running)" });
    });
    server.once("listening", () => {
      server.close(() => {
        resolvePromise({ name: "port:41737", ok: true, detail: "available" });
      });
    });
    server.listen(41737, "127.0.0.1");
  });
}

export function legacyInstallCheck(ctx: CuratorCliContext) {
  const legacySkill = join(ctx.cursorHome, "skills", "goalbuddy");
  const legacyCli = join(ctx.cursorHome, "bin", "goalbuddy");
  const legacyCliCmd = join(ctx.cursorHome, "bin", "goalbuddy.cmd");
  const legacyMcpPath = join(ctx.cursorHome, "mcp.json");
  const findings: string[] = [];
  if (existsSync(legacySkill)) findings.push(`remove legacy skill: ${legacySkill}`);
  if (existsSync(legacyCli) || existsSync(legacyCliCmd)) {
    findings.push(`remove legacy CLI: ${legacyCli} (and goalbuddy.cmd if present)`);
  }
  if (existsSync(legacyMcpPath)) {
    try {
      const config = JSON.parse(readFileSync(legacyMcpPath, "utf8")) as { mcpServers?: Record<string, unknown> };
      if (config?.mcpServers?.goalbuddy) {
        findings.push("remove mcpServers.goalbuddy from ~/.cursor/mcp.json and enable cursor-curator");
      }
    } catch {
      /* ignore */
    }
  }
  return [{
    name: "legacy:goalbuddy",
    ok: true,
    detail: findings.length
      ? `cleanup recommended: ${findings.join("; ")}`
      : "no legacy goalbuddy-branded install artifacts detected",
  }];
}
