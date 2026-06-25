import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { registerKnownWorkspace } from "../mcp/path-utils.mjs";
import { MCP_SERVER_NAME } from "../lib/brand.mjs";

const VENDORED_DIST_SERVER_REL = "cursor-curator/dist/mcp/server.mjs";
export const PORT_CONFIG_FILE = ".cursor-curator-port.json";

function toPosixPath(path: string): string {
  return path.replace(/\\/g, "/");
}

function resolveServerPath(skillRoot: string): string {
  return join(resolve(skillRoot), "dist", "mcp", "server.mjs");
}

function vendoredDistServerPath(projectRoot: string): string {
  return resolve(projectRoot, ...VENDORED_DIST_SERVER_REL.split("/"));
}

export function hasMcpDeps(repoRoot: string): boolean {
  const root = resolve(repoRoot);
  return (
    existsSync(join(root, "node_modules", "@modelcontextprotocol", "sdk"))
    && existsSync(join(root, "node_modules", "zod"))
  );
}

function listPortRepoCandidates(skillRoot: string): string[] {
  const candidates: string[] = [];
  const config = readPortConfig(skillRoot);
  if (config?.repoRoot) candidates.push(resolve(config.repoRoot));

  const parentRepo = resolve(skillRoot, "..");
  if (existsSync(join(parentRepo, "cursor-curator", "dist", "mcp", "server.mjs"))) {
    candidates.push(parentRepo);
  }

  if (process.env.CURATOR_REPO_ROOT) {
    candidates.push(resolve(process.env.CURATOR_REPO_ROOT));
  }

  return [...new Set(candidates)];
}

export function readPortConfig(skillRoot: string): { repoRoot?: string } | null {
  const configPath = join(resolve(skillRoot), PORT_CONFIG_FILE);
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, "utf8")) as { repoRoot?: string };
  } catch {
    return null;
  }
}

export function writePortConfig(skillRoot: string, repoRoot: string) {
  const resolvedRepoRoot = resolve(repoRoot);
  if (!hasMcpDeps(resolvedRepoRoot)) {
    return {
      ok: false as const,
      error: `missing node_modules/@modelcontextprotocol/sdk under ${resolvedRepoRoot}`,
    };
  }

  const portConfigPath = join(resolve(skillRoot), PORT_CONFIG_FILE);
  writeFileSync(
    portConfigPath,
    `${JSON.stringify({ repoRoot: resolvedRepoRoot }, null, 2)}\n`,
    "utf8",
  );
  return { ok: true as const, portConfigPath, repoRoot: resolvedRepoRoot };
}

export function resolveMcpRepoRoot(skillRoot: string): string {
  if (hasMcpDeps(skillRoot)) return resolve(skillRoot);

  for (const candidate of listPortRepoCandidates(skillRoot)) {
    if (hasMcpDeps(candidate)) return candidate;
  }

  console.error("cursor-curator MCP: missing npm dependencies.");
  console.error("From your Cursor-Curator clone run: npm install && npm run install:cursor");
  process.exit(1);
}

export function resolveInstallRepoRoot(skillRoot: string, projectRoots: string[] = []): string | null {
  if (process.env.CURATOR_REPO_ROOT && hasMcpDeps(process.env.CURATOR_REPO_ROOT)) {
    return resolve(process.env.CURATOR_REPO_ROOT);
  }

  for (const root of projectRoots) {
    const resolved = resolve(root);
    if (hasMcpDeps(resolved)) return resolved;
  }

  const parentRepo = resolve(skillRoot, "..");
  if (hasMcpDeps(parentRepo)) return parentRepo;

  return null;
}

export function buildMcpServerEntry(skillRoot: string) {
  return {
    command: "node",
    args: [toPosixPath(resolveServerPath(skillRoot))],
    cwd: ".",
  };
}

export function buildMcpServerEntryForProject(projectRoot: string, skillRoot: string) {
  const vendoredServer = vendoredDistServerPath(projectRoot);
  if (existsSync(vendoredServer)) {
    return {
      command: "node",
      args: [VENDORED_DIST_SERVER_REL],
      cwd: ".",
    };
  }

  return buildMcpServerEntry(skillRoot);
}

export function projectRootFromMcpConfigPath(configPath: string): string {
  return resolve(dirname(configPath), "..");
}

export function mergeMcpConfig(
  existing: Record<string, unknown> | null,
  entry: ReturnType<typeof buildMcpServerEntry>,
) {
  const base = existing && typeof existing === "object" ? existing : {};
  const servers = { ...((base.mcpServers as Record<string, unknown>) || {}) };
  servers[MCP_SERVER_NAME] = entry;
  return {
    ...base,
    mcpServers: servers,
  };
}

export function readMcpConfig(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function writeMergedMcpConfig(
  configPath: string,
  skillRoot: string,
  { projectRoot }: { projectRoot?: string } = {},
) {
  const entry = projectRoot
    ? buildMcpServerEntryForProject(projectRoot, skillRoot)
    : buildMcpServerEntry(skillRoot);
  const merged = mergeMcpConfig(readMcpConfig(configPath), entry);
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return { configPath, entry, merged };
}

export function removeMcpServerEntry(configPath: string, serverName = MCP_SERVER_NAME) {
  const config = readMcpConfig(configPath);
  const mcpServers = config?.mcpServers as Record<string, unknown> | undefined;
  if (!mcpServers?.[serverName]) {
    return { removed: false, configPath };
  }

  const { [serverName]: _removed, ...restServers } = mcpServers;
  const merged = { ...config, mcpServers: restServers };
  writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return { removed: true, configPath, merged };
}

export function ensureProjectMcpConfig(projectRoot: string, skillRoot: string) {
  const resolvedProject = resolve(projectRoot);
  if (!existsSync(join(resolvedProject, "docs", "objectives"))) {
    return { ok: false as const, reason: "missing docs/objectives/", projectRoot: resolvedProject };
  }

  const result = writeMergedMcpConfig(join(resolvedProject, ".cursor", "mcp.json"), skillRoot, {
    projectRoot: resolvedProject,
  });
  return { ok: true as const, projectRoot: resolvedProject, ...result };
}

export function installMcpConfig({
  skillRoot,
  projectRoots = [],
  cursorHome,
  repoRoot,
}: {
  skillRoot: string;
  projectRoots?: string[];
  cursorHome?: string;
  repoRoot?: string | null;
}) {
  const installed: Array<{ configPath: string; entry: unknown; merged: unknown }> = [];
  const removed: unknown[] = [];
  const errors: string[] = [];
  const roots = [...new Set(projectRoots.map((root) => resolve(root)).filter(Boolean))];
  const resolvedRepoRoot = repoRoot || resolveInstallRepoRoot(skillRoot, roots);

  if (resolvedRepoRoot) {
    const portResult = writePortConfig(skillRoot, resolvedRepoRoot);
    if (!portResult.ok) {
      errors.push(portResult.error);
    }
  } else {
    errors.push("Could not locate Cursor-Curator clone with npm install (run npm install, then reinstall)");
  }

  for (const projectRoot of roots) {
    try {
      const result = writeMergedMcpConfig(join(projectRoot, ".cursor", "mcp.json"), skillRoot, {
        projectRoot,
      });
      installed.push(result);
    } catch (error) {
      errors.push(`${projectRoot}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const projectRoot of roots) {
    registerKnownWorkspace(projectRoot);
  }

  if (cursorHome) {
    const userConfigPath = join(resolve(cursorHome), "mcp.json");
    try {
      const result = writeMergedMcpConfig(userConfigPath, skillRoot);
      installed.push(result);
    } catch (error) {
      errors.push(`cursorHome: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { installed, removed, errors, server_name: MCP_SERVER_NAME, repoRoot: resolvedRepoRoot };
}

export function checkMcpConfig(configPath: string, skillRoot: string) {
  const config = readMcpConfig(configPath);
  const mcpServers = config?.mcpServers as Record<string, { args?: unknown[] }> | undefined;
  if (!mcpServers?.[MCP_SERVER_NAME]) {
    return {
      ok: false,
      name: `mcp:${MCP_SERVER_NAME}`,
      detail: `missing ${MCP_SERVER_NAME} entry in ${configPath}`,
    };
  }

  const entry = mcpServers[MCP_SERVER_NAME];
  const expectedServer = resolveServerPath(skillRoot);
  const projectRoot = projectRootFromMcpConfigPath(configPath);
  const args = Array.isArray(entry.args) ? entry.args : [];
  const resolvedArgs = args.map((arg) => resolve(projectRoot, String(arg)));
  const pointsAtSkill = resolvedArgs.some((arg) => resolve(arg) === resolve(expectedServer));
  const vendoredPath = vendoredDistServerPath(projectRoot);
  const pointsAtVendored = resolvedArgs.some((arg) => resolve(arg) === resolve(vendoredPath))
    || args.some((arg) => String(arg).includes(VENDORED_DIST_SERVER_REL));
  const serverExists = existsSync(expectedServer) || existsSync(vendoredPath);

  return {
    ok: serverExists && (pointsAtSkill || pointsAtVendored),
    name: `mcp:${MCP_SERVER_NAME}`,
    detail: pointsAtVendored ? vendoredPath : expectedServer,
    config_path: configPath,
    server_path: pointsAtVendored && existsSync(vendoredPath) ? vendoredPath : expectedServer,
  };
}

export function defaultProjectRootsFromSkill(skillRoot: string): string[] {
  const repoRoot = resolve(skillRoot, "..");
  const roots: string[] = [];
  if (existsSync(join(repoRoot, "docs", "objectives"))) roots.push(repoRoot);
  if (existsSync(join(process.cwd(), "docs", "objectives"))) roots.push(process.cwd());
  return roots;
}

export function repoMcpConfigPathFromSkill(skillRoot: string): string {
  return join(resolve(skillRoot, ".."), ".cursor", "mcp.json");
}
