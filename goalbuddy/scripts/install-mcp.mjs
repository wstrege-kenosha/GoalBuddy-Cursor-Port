import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerKnownWorkspace } from "../mcp/path-utils.mjs";

const SERVER_NAME = "goalbuddy";
const VENDORED_SERVER_REL = "goalbuddy/mcp/server.mjs";
export const PORT_CONFIG_FILE = ".goalbuddy-port.json";
export const MCP_LAUNCHER_NAME = "run-mcp-server.mjs";

function toPosixPath(path) {
  return path.replace(/\\/g, "/");
}

function resolveServerPath(skillRoot) {
  return join(resolve(skillRoot), "mcp", "server.mjs");
}

export function resolveMcpLauncherPath(skillRoot) {
  return join(resolve(skillRoot), "scripts", MCP_LAUNCHER_NAME);
}

export function hasMcpDeps(repoRoot) {
  return existsSync(join(resolve(repoRoot), "node_modules", "@modelcontextprotocol", "sdk"));
}

function listPortRepoCandidates(skillRoot) {
  const candidates = [];
  const config = readPortConfig(skillRoot);
  if (config?.repoRoot) candidates.push(resolve(config.repoRoot));

  const parentRepo = resolve(skillRoot, "..");
  if (existsSync(join(parentRepo, "goalbuddy", "mcp", "server.mjs"))) {
    candidates.push(parentRepo);
  }

  if (process.env.GOALBUDDY_REPO_ROOT) {
    candidates.push(resolve(process.env.GOALBUDDY_REPO_ROOT));
  }

  return [...new Set(candidates)];
}

export function readPortConfig(skillRoot) {
  const configPath = join(resolve(skillRoot), PORT_CONFIG_FILE);
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    return null;
  }
}

export function writePortConfig(skillRoot, repoRoot) {
  const resolvedRepoRoot = resolve(repoRoot);
  if (!hasMcpDeps(resolvedRepoRoot)) {
    return {
      ok: false,
      error: `missing node_modules/@modelcontextprotocol/sdk under ${resolvedRepoRoot}`,
    };
  }

  const portConfigPath = join(resolve(skillRoot), PORT_CONFIG_FILE);
  writeFileSync(
    portConfigPath,
    `${JSON.stringify({ repoRoot: resolvedRepoRoot }, null, 2)}\n`,
    "utf8",
  );
  return { ok: true, portConfigPath, repoRoot: resolvedRepoRoot };
}

export function resolveMcpRepoRoot(skillRoot) {
  for (const candidate of listPortRepoCandidates(skillRoot)) {
    if (hasMcpDeps(candidate)) return candidate;
  }

  console.error("GoalBuddy MCP: missing npm dependencies.");
  console.error("From your GoalBuddy-Cursor-Port clone run: npm install && npm run install:cursor");
  process.exit(1);
}

export function resolveInstallRepoRoot(skillRoot, projectRoots = []) {
  if (process.env.GOALBUDDY_REPO_ROOT && hasMcpDeps(process.env.GOALBUDDY_REPO_ROOT)) {
    return resolve(process.env.GOALBUDDY_REPO_ROOT);
  }

  for (const root of projectRoots) {
    const resolved = resolve(root);
    if (hasMcpDeps(resolved)) return resolved;
  }

  const parentRepo = resolve(skillRoot, "..");
  if (hasMcpDeps(parentRepo)) return parentRepo;

  return null;
}

function skillRootFromLauncherArg(args) {
  for (const arg of args) {
    const text = String(arg);
    if (text.includes(MCP_LAUNCHER_NAME)) {
      return resolve(dirname(resolve(text)), "..");
    }
  }
  return null;
}

export function buildMcpServerEntry(skillRoot) {
  return {
    command: "node",
    args: [resolveMcpLauncherPath(skillRoot)],
    cwd: ".",
  };
}

export function buildMcpServerEntryForProject(projectRoot, skillRoot) {
  const resolvedProject = resolve(projectRoot);
  const vendoredServer = join(resolvedProject, ...VENDORED_SERVER_REL.split("/"));

  if (existsSync(vendoredServer)) {
    return {
      command: "node",
      args: [VENDORED_SERVER_REL],
      cwd: ".",
    };
  }

  return buildMcpServerEntry(skillRoot);
}

export function projectRootFromMcpConfigPath(configPath) {
  return resolve(dirname(configPath), "..");
}

export function mergeMcpConfig(existing, entry) {
  const base = existing && typeof existing === "object" ? existing : {};
  const servers = { ...(base.mcpServers || {}) };
  servers[SERVER_NAME] = entry;
  return {
    ...base,
    mcpServers: servers,
  };
}

export function readMcpConfig(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function writeMergedMcpConfig(configPath, skillRoot, { projectRoot } = {}) {
  const entry = projectRoot
    ? buildMcpServerEntryForProject(projectRoot, skillRoot)
    : buildMcpServerEntry(skillRoot);
  const merged = mergeMcpConfig(readMcpConfig(configPath), entry);
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return { configPath, entry, merged };
}

export function removeMcpServerEntry(configPath, serverName = SERVER_NAME) {
  const config = readMcpConfig(configPath);
  if (!config?.mcpServers?.[serverName]) {
    return { removed: false, configPath };
  }

  const { [serverName]: _removed, ...restServers } = config.mcpServers;
  const merged = { ...config, mcpServers: restServers };
  writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return { removed: true, configPath, merged };
}

export function ensureProjectMcpConfig(projectRoot, skillRoot) {
  const resolvedProject = resolve(projectRoot);
  if (!existsSync(join(resolvedProject, "docs", "goals"))) {
    return { ok: false, reason: "missing docs/goals/", projectRoot: resolvedProject };
  }

  const result = writeMergedMcpConfig(join(resolvedProject, ".cursor", "mcp.json"), skillRoot, {
    projectRoot: resolvedProject,
  });
  return { ok: true, projectRoot: resolvedProject, ...result };
}

export function installMcpConfig({ skillRoot, projectRoots = [], cursorHome, repoRoot }) {
  const installed = [];
  const removed = [];
  const errors = [];
  const roots = [...new Set(projectRoots.map((root) => resolve(root)).filter(Boolean))];
  const resolvedRepoRoot = repoRoot || resolveInstallRepoRoot(skillRoot, roots);

  if (resolvedRepoRoot) {
    const portResult = writePortConfig(skillRoot, resolvedRepoRoot);
    if (!portResult.ok) {
      errors.push(portResult.error);
    }
  } else {
    errors.push("Could not locate GoalBuddy-Cursor-Port clone with npm install (run npm install, then reinstall)");
  }

  for (const projectRoot of roots) {
    try {
      const result = writeMergedMcpConfig(join(projectRoot, ".cursor", "mcp.json"), skillRoot, {
        projectRoot,
      });
      installed.push(result);
    } catch (error) {
      errors.push(`${projectRoot}: ${error.message}`);
    }
  }

  for (const projectRoot of roots) {
    registerKnownWorkspace(projectRoot);
  }

  // User-level config uses the launcher so MCP deps resolve from the cloned repo.
  if (cursorHome) {
    const userConfigPath = join(resolve(cursorHome), "mcp.json");
    try {
      const result = writeMergedMcpConfig(userConfigPath, skillRoot);
      installed.push(result);
    } catch (error) {
      errors.push(`cursorHome: ${error.message}`);
    }
  }

  return { installed, removed, errors, server_name: SERVER_NAME, repoRoot: resolvedRepoRoot };
}

export function checkMcpConfig(configPath, skillRoot) {
  const config = readMcpConfig(configPath);
  if (!config?.mcpServers?.[SERVER_NAME]) {
    return {
      ok: false,
      name: `mcp:${SERVER_NAME}`,
      detail: `missing ${SERVER_NAME} entry in ${configPath}`,
    };
  }

  const entry = config.mcpServers[SERVER_NAME];
  const expectedServer = resolveServerPath(skillRoot);
  const projectRoot = projectRootFromMcpConfigPath(configPath);
  const args = Array.isArray(entry.args) ? entry.args : [];
  const resolvedArgs = args.map((arg) => resolve(projectRoot, String(arg)));
  const launcherSkillRoot = skillRootFromLauncherArg(resolvedArgs) || resolve(skillRoot);
  const launcherPath = resolveMcpLauncherPath(launcherSkillRoot);
  const pointsAtLauncher = resolvedArgs.some((arg) => resolve(arg) === resolve(launcherPath))
    || args.some((arg) => String(arg).includes(MCP_LAUNCHER_NAME));
  const pointsAtSkill = resolvedArgs.some((arg) => resolve(arg) === resolve(expectedServer));
  const pointsAtVendored = resolvedArgs.some((arg) => resolve(arg) === resolve(projectRoot, ...VENDORED_SERVER_REL.split("/")));
  const repoRoot = readPortConfig(launcherSkillRoot)?.repoRoot || resolveInstallRepoRoot(launcherSkillRoot, [projectRoot]);
  const serverExists = existsSync(expectedServer)
    || existsSync(resolve(projectRoot, ...VENDORED_SERVER_REL.split("/")))
    || (pointsAtLauncher && existsSync(launcherPath) && Boolean(repoRoot) && hasMcpDeps(repoRoot));

  return {
    ok: serverExists && (pointsAtLauncher || pointsAtSkill || pointsAtVendored || args.some((arg) => String(arg).includes(VENDORED_SERVER_REL))),
    name: `mcp:${SERVER_NAME}`,
    detail: pointsAtLauncher
      ? `${launcherPath} -> ${repoRoot || "missing repoRoot"}`
      : pointsAtSkill || pointsAtVendored
        ? expectedServer
        : args.join(" "),
    config_path: configPath,
    server_path: pointsAtLauncher && repoRoot
      ? join(resolve(repoRoot), ...VENDORED_SERVER_REL.split("/"))
      : existsSync(resolve(projectRoot, ...VENDORED_SERVER_REL.split("/")))
        ? resolve(projectRoot, ...VENDORED_SERVER_REL.split("/"))
        : expectedServer,
  };
}

export function defaultProjectRootsFromSkill(skillRoot) {
  const repoRoot = resolve(skillRoot, "..");
  const roots = [];
  if (existsSync(join(repoRoot, "docs", "goals"))) roots.push(repoRoot);
  if (existsSync(join(process.cwd(), "docs", "goals"))) roots.push(process.cwd());
  return roots;
}

export function repoMcpConfigPathFromSkill(skillRoot) {
  return join(resolve(skillRoot, ".."), ".cursor", "mcp.json");
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const { homedir } = await import("node:os");
  const projectRoots = defaultProjectRootsFromSkill(skillRoot);
  const result = installMcpConfig({
    skillRoot,
    projectRoots,
    cursorHome: join(homedir(), ".cursor"),
    repoRoot: resolveInstallRepoRoot(skillRoot, projectRoots),
  });
  console.log(JSON.stringify(result, null, 2));
}
