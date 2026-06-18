import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_NAME = "goalbuddy";

export function buildMcpServerEntry(skillRoot) {
  const serverPath = join(resolve(skillRoot), "mcp", "server.mjs");
  return {
    command: process.execPath,
    args: [serverPath],
  };
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

export function writeMergedMcpConfig(configPath, skillRoot) {
  const entry = buildMcpServerEntry(skillRoot);
  const merged = mergeMcpConfig(readMcpConfig(configPath), entry);
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return { configPath, entry, merged };
}

export function installMcpConfig({ skillRoot, projectRoots = [], cursorHome }) {
  const installed = [];
  const errors = [];
  const roots = [...new Set(projectRoots.map((root) => resolve(root)).filter(Boolean))];

  for (const projectRoot of roots) {
    try {
      const result = writeMergedMcpConfig(join(projectRoot, ".cursor", "mcp.json"), skillRoot);
      installed.push(result);
    } catch (error) {
      errors.push(`${projectRoot}: ${error.message}`);
    }
  }

  if (cursorHome) {
    try {
      const result = writeMergedMcpConfig(join(resolve(cursorHome), "mcp.json"), skillRoot);
      installed.push(result);
    } catch (error) {
      errors.push(`cursorHome: ${error.message}`);
    }
  }

  return { installed, errors, server_name: SERVER_NAME };
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
  const expectedServer = join(resolve(skillRoot), "mcp", "server.mjs");
  const args = Array.isArray(entry.args) ? entry.args : [];
  const pointsAtSkill = args.some((arg) => resolve(String(arg)) === expectedServer);

  return {
    ok: existsSync(expectedServer) && (pointsAtSkill || args.some((arg) => String(arg).includes("goalbuddy/mcp/server.mjs"))),
    name: `mcp:${SERVER_NAME}`,
    detail: pointsAtSkill ? expectedServer : args.join(" "),
    config_path: configPath,
    server_path: expectedServer,
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
  const result = installMcpConfig({
    skillRoot,
    projectRoots: defaultProjectRootsFromSkill(skillRoot),
  });
  console.log(JSON.stringify(result, null, 2));
}
