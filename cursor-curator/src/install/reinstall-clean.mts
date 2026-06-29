import { cpSync, existsSync, mkdirSync, rmSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  ENV_REPO_ROOT,
  MCP_SERVER_NAME,
  PREP_SKILL_NAME,
  SKILL_NAME,
} from "../lib/brand.mjs";
import { installCursorSurfaces, resetCursorSurfaces } from "./install-agents.mjs";
import {
  defaultProjectRootsFromSkill,
  hasMcpDeps,
  installMcpConfig,
  readPortConfig,
  removeMcpServerEntry,
} from "./install-mcp.mjs";
import { installCliBin } from "./install-cli-bin.mjs";
import { ensureCliOnPath } from "./install-cli-path.mjs";

const LEGACY_SKILL_NAMES = ["curator-prep", "goalbuddy"] as const;
const LEGACY_MCP_SERVER_NAMES = ["curator", "goalbuddy"] as const;
const LEGACY_CLI_NAMES = ["goalbuddy"] as const;

export interface ReinstallCleanOptions {
  skillRoot: string;
  cursorHome: string;
  json?: boolean;
  quiet?: boolean;
  addToPath?: boolean;
}

export interface ReinstallCleanResult {
  ok: boolean;
  repoRoot: string | null;
  removed: string[];
  copied: string[];
  errors: string[];
  install?: {
    agents: number;
    commands: number;
    mcpConfigs: string[];
    cliPath: string | null;
  };
}

function log(message: string, quiet: boolean | undefined): void {
  if (!quiet) console.log(message);
}

function runBun(args: string[], cwd: string): number {
  const result = spawnSync(process.execPath, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status ?? 1;
}

function installedSkillsDir(cursorHome: string): string {
  return join(resolve(cursorHome), "skills");
}

function installedSkillRoot(cursorHome: string): string {
  return join(installedSkillsDir(cursorHome), SKILL_NAME);
}

export function resolveReinstallRepoRoot(
  skillRoot: string,
  cursorHome: string,
): string | null {
  if (process.env[ENV_REPO_ROOT] && hasMcpDeps(process.env[ENV_REPO_ROOT])) {
    return resolve(process.env[ENV_REPO_ROOT]);
  }

  for (const root of [installedSkillRoot(cursorHome), resolve(skillRoot)]) {
    const portRepo = readPortConfig(root)?.repoRoot;
    if (portRepo && hasMcpDeps(portRepo)) {
      return resolve(portRepo);
    }
  }

  const parentRepo = resolve(skillRoot, "..");
  if (
    existsSync(join(parentRepo, SKILL_NAME, "dist", "cli", "curator.mjs"))
    && existsSync(join(parentRepo, "package.json"))
  ) {
    return parentRepo;
  }

  const cwd = resolve(process.cwd());
  if (
    existsSync(join(cwd, SKILL_NAME, "dist", "cli", "curator.mjs"))
    && existsSync(join(cwd, "package.json"))
  ) {
    return cwd;
  }

  return null;
}

function removePath(path: string, removed: string[], quiet?: boolean): void {
  if (!existsSync(path)) return;
  rmSync(path, { recursive: true, force: true });
  removed.push(path);
  log(`removed ${path}`, quiet);
}

function removeFile(path: string, removed: string[], quiet?: boolean): void {
  if (!existsSync(path)) return;
  unlinkSync(path);
  removed.push(path);
  log(`removed ${path}`, quiet);
}

export function cleanCursorCuratorInstall({
  cursorHome,
  quiet,
}: {
  cursorHome: string;
  quiet?: boolean;
}): string[] {
  const removed: string[] = [];
  const skillsDir = installedSkillsDir(cursorHome);
  const installedRoot = join(skillsDir, SKILL_NAME);

  const { removed: resetRemoved } = resetCursorSurfaces({
    quiet: !!quiet,
    manifestRoot: installedRoot,
  });
  removed.push(...resetRemoved);

  const userMcpPath = join(cursorHome, "mcp.json");
  for (const serverName of [MCP_SERVER_NAME, ...LEGACY_MCP_SERVER_NAMES]) {
    const result = removeMcpServerEntry(userMcpPath, serverName);
    if (result.removed) {
      removed.push(`${userMcpPath}#${serverName}`);
      log(`removed mcpServers.${serverName} from ${userMcpPath}`, quiet);
    }
  }

  for (const name of [SKILL_NAME, PREP_SKILL_NAME, ...LEGACY_SKILL_NAMES]) {
    removePath(join(skillsDir, name), removed, quiet);
  }

  const binDir = join(cursorHome, "bin");
  for (const name of LEGACY_CLI_NAMES) {
    removeFile(join(binDir, name), removed, quiet);
    removeFile(join(binDir, `${name}.cmd`), removed, quiet);
  }

  return removed;
}

export function copySkillTreesFromRepo(repoRoot: string, cursorHome: string, quiet?: boolean): string[] {
  const skillsDir = installedSkillsDir(cursorHome);
  mkdirSync(skillsDir, { recursive: true });
  const copied: string[] = [];

  for (const name of [SKILL_NAME, PREP_SKILL_NAME]) {
    const src = join(repoRoot, name);
    const dest = join(skillsDir, name);
    if (!existsSync(src)) {
      throw new Error(`Missing vendored tree: ${src}`);
    }
    cpSync(src, dest, { recursive: true, force: true });
    copied.push(dest);
    log(`copied ${name} -> ${dest}`, quiet);
  }

  return copied;
}

function ensureRepoReady(repoRoot: string, quiet?: boolean): string[] {
  const errors: string[] = [];
  const sdkPath = join(repoRoot, "node_modules", "@modelcontextprotocol", "sdk");
  const zodPath = join(repoRoot, "node_modules", "zod");
  if (!existsSync(sdkPath) || !existsSync(zodPath)) {
    log("Installing repo dependencies (bun install)...", quiet);
    if (runBun(["install"], repoRoot) !== 0) {
      errors.push("bun install failed in Cursor-Curator clone");
      return errors;
    }
  }

  const distCli = join(repoRoot, SKILL_NAME, "dist", "cli", "curator.mjs");
  if (!existsSync(distCli)) {
    log("Building TypeScript dist (bun run build)...", quiet);
    if (runBun(["run", "build"], repoRoot) !== 0) {
      errors.push("bun run build failed in Cursor-Curator clone");
    }
  }

  return errors;
}

function ensureSkillDeps(skillRoot: string, quiet?: boolean): string | null {
  const skillPackageJson = join(skillRoot, "package.json");
  if (!existsSync(skillPackageJson)) return null;
  log("Installing skill-only dependencies...", quiet);
  if (runBun(["install", "--production"], skillRoot) !== 0) {
    return "Skill dependency install failed. Ensure bun is on PATH.";
  }
  return null;
}

export function runReinstallClean(options: ReinstallCleanOptions): ReinstallCleanResult {
  const { skillRoot, cursorHome, json = false, quiet = false } = options;
  const repoRoot = resolveReinstallRepoRoot(skillRoot, cursorHome);
  const removed = cleanCursorCuratorInstall({ cursorHome, quiet });
  const errors: string[] = [];
  const copied: string[] = [];

  if (!repoRoot) {
    errors.push(
      "Could not locate Cursor-Curator clone. Run from the repo root or set CURATOR_REPO_ROOT, then retry.",
    );
    const result: ReinstallCleanResult = { ok: false, repoRoot: null, removed, copied, errors };
    emitResult(result, json);
    return result;
  }

  const buildErrors = ensureRepoReady(repoRoot, quiet);
  errors.push(...buildErrors);
  if (buildErrors.length > 0) {
    const result: ReinstallCleanResult = { ok: false, repoRoot, removed, copied, errors };
    emitResult(result, json);
    return result;
  }

  try {
    copied.push(...copySkillTreesFromRepo(repoRoot, cursorHome, quiet));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    const result: ReinstallCleanResult = { ok: false, repoRoot, removed, copied, errors };
    emitResult(result, json);
    return result;
  }

  const newSkillRoot = installedSkillRoot(cursorHome);
  const skillDepError = ensureSkillDeps(newSkillRoot, quiet);
  if (skillDepError) {
    errors.push(skillDepError);
    const result: ReinstallCleanResult = { ok: false, repoRoot, removed, copied, errors };
    emitResult(result, json);
    return result;
  }

  const surfaces = installCursorSurfaces({ force: true, quiet: !!quiet });
  errors.push(...surfaces.errors);

  const projectRoots = defaultProjectRootsFromSkill(newSkillRoot);
  const mcpResult = installMcpConfig({
    skillRoot: newSkillRoot,
    projectRoots,
    cursorHome,
    repoRoot,
  });
  errors.push(...mcpResult.errors);

  const cliResult = installCliBin({ cursorHome, skillRoot: newSkillRoot });
  if (!cliResult.ok) {
    errors.push(cliResult.error);
  } else {
    const pathResult = ensureCliOnPath(cliResult.binDir, { enabled: options.addToPath !== false });
    if (!pathResult.ok && !quiet) {
      log(`PATH: ${pathResult.message}`, quiet);
    } else if (pathResult.persisted && !quiet) {
      log(`PATH: ${pathResult.message}`, quiet);
      log("PATH: open a new terminal for the global curator command.", quiet);
    } else if (pathResult.skipped && !quiet) {
      log(pathResult.message, quiet);
    }
  }

  const result: ReinstallCleanResult = {
    ok: errors.length === 0,
    repoRoot,
    removed,
    copied,
    errors,
    install: {
      agents: surfaces.agents.length,
      commands: surfaces.commands.length,
      mcpConfigs: mcpResult.installed.map((entry) => entry.configPath),
      cliPath: cliResult.ok ? cliResult.cmdPath : null,
    },
  };

  emitResult(result, json);
  return result;
}

function emitResult(result: ReinstallCleanResult, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
    return;
  }

  if (!result.ok) {
    console.error(result.errors.join("\n"));
    process.exit(1);
  }

  console.log("Cursor Curator clean reinstall complete.");
  console.log(`Repo: ${result.repoRoot}`);
  if (result.copied.length) console.log(`Skills: ${result.copied.join(", ")}`);
  if (result.install?.cliPath) console.log(`CLI: ${result.install.cliPath}`);
  if (result.install?.mcpConfigs.length) {
    for (const configPath of result.install.mcpConfigs) {
      console.log(`MCP: ${configPath}`);
    }
  }
  console.log("Next: restart Cursor, enable cursor-curator in Settings → MCP, then run: curator doctor --objective-ready");
}
