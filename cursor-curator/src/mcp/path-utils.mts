import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { logicalBoardPath } from "../db/connection.mjs";
import { objectiveExistsInDb, findObjectiveSlugByDirPath } from "../db/state-repository.mjs";
import { resolveObjectiveDirectory, resolveObjectiveSlug } from "../state/objective-state.mjs";

const KNOWN_WORKSPACES_FILE = "known-workspaces.json";

const CURSOR_WORKSPACE_ENV_KEYS = [
  "WORKSPACE_FOLDER_PATHS",
  "CURSOR_WORKSPACE",
  "VSCODE_WORKSPACE",
  "VSCODE_CWD",
  "CLAUDE_CODE_WORKSPACE",
];

function hasObjectivesDir(root: string): boolean {
  return existsSync(join(resolve(root), "docs", "objectives"));
}

function isProbablyHome(path: string): boolean {
  try {
    return resolve(path).toLowerCase() === resolve(homedir()).toLowerCase();
  } catch {
    return false;
  }
}

function splitWorkspacePaths(value: unknown): string[] {
  const text = String(value || "").trim();
  if (!text) return [];

  return text
    .split(/[;\n]/)
    .flatMap((chunk) => chunk.split("|"))
    .map((part) => part.trim())
    .filter(Boolean);
}

function skillRootPath(): string {
  const cursorHome = resolve(process.env.CURSOR_HOME || join(homedir(), ".cursor"));
  return resolve(process.env.CURATOR_SKILL_ROOT || join(cursorHome, "skills", "cursor-curator"));
}

function knownWorkspacesPath(): string {
  return join(skillRootPath(), KNOWN_WORKSPACES_FILE);
}

function isForcedWorkspaceOverride(): boolean {
  const value = String(process.env.CURATOR_WORKSPACE_FORCE || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function normalizeCandidatePath(path: unknown): string {
  return resolve(String(path || "").trim());
}

function addCandidate(seen: Set<string>, candidates: string[], path: unknown): void {
  if (!path) return;
  const resolved = normalizeCandidatePath(path);
  const key = resolved.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  candidates.push(resolved);
}

export function readKnownWorkspaces(): string[] {
  const configPath = knownWorkspacesPath();
  if (!existsSync(configPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as {
      roots?: Array<string | { path?: string }>;
    };
    const roots = Array.isArray(parsed?.roots) ? parsed.roots : Array.isArray(parsed) ? parsed : [];
    return roots
      .map((entry) => (typeof entry === "string" ? entry : entry?.path))
      .filter((path): path is string => Boolean(path))
      .map((path) => resolve(path));
  } catch {
    return [];
  }
}

export function registerKnownWorkspace(workspaceRoot: string): {
  ok: boolean;
  path: string;
  reason?: string;
  configPath?: string;
} {
  const root = resolve(workspaceRoot);
  if (!hasObjectivesDir(root)) {
    return { ok: false, path: root, reason: "missing docs/objectives/" };
  }

  const existing = readKnownWorkspaces();
  const merged = [root, ...existing.filter((entry) => entry.toLowerCase() !== root.toLowerCase())];
  const configPath = knownWorkspacesPath();
  try {
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      `${JSON.stringify({ roots: merged.map((path) => ({ path, registered_at: new Date().toISOString() })) }, null, 2)}\n`,
      "utf8",
    );
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code !== "EPERM" && code !== "EACCES") {
      throw error;
    }
    return { ok: true, path: root, configPath, reason: "known_workspaces_not_writable" };
  }
  return { ok: true, path: root, configPath };
}

export function collectWorkspaceCandidates(): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];

  if (process.env.CURATOR_WORKSPACE) {
    addCandidate(seen, candidates, process.env.CURATOR_WORKSPACE);
  }

  for (const key of CURSOR_WORKSPACE_ENV_KEYS) {
    for (const candidate of splitWorkspacePaths(process.env[key])) {
      addCandidate(seen, candidates, candidate);
    }
  }

  for (const root of readKnownWorkspaces()) {
    addCandidate(seen, candidates, root);
  }

  addCandidate(seen, candidates, process.cwd());
  if (process.env.PWD) {
    addCandidate(seen, candidates, process.env.PWD);
  }

  return candidates;
}

function pickWorkspaceFromCursorEnv(): string | null {
  for (const key of CURSOR_WORKSPACE_ENV_KEYS) {
    for (const candidate of splitWorkspacePaths(process.env[key])) {
      const resolved = resolve(candidate);
      if (hasObjectivesDir(resolved)) {
        return resolved;
      }
    }
  }
  return null;
}

export function parseObjectiveRef(objectiveRef: string): { slug: string; workspaceRoot: string | null } {
  const ref = String(objectiveRef || "").trim().replace(/\\/g, "/");
  if (!ref) {
    return { slug: "", workspaceRoot: null };
  }

  const absoluteMatch = ref.match(
    /^([A-Za-z]:.*?)\/docs\/objectives\/([^/]+)(?:\/state\.json)?\/?$/,
  );
  if (absoluteMatch) {
    return {
      slug: absoluteMatch[2],
      workspaceRoot: resolve(absoluteMatch[1]),
    };
  }

  const relativeMatch = ref.match(/(?:^|\/)docs\/objectives\/([^/]+)(?:\/state\.json)?\/?$/);
  if (relativeMatch) {
    return { slug: relativeMatch[1], workspaceRoot: null };
  }

  const base = basename(ref);
  if (base === "state.json") {
    const slug = basename(dirname(ref));
    return { slug, workspaceRoot: null };
  }

  if (!ref.includes("/")) {
    return { slug: ref, workspaceRoot: null };
  }

  return { slug: basename(ref.replace(/\/$/, "")), workspaceRoot: null };
}

function objectiveStateExists(workspaceRoot: string, slug: string): boolean {
  return objectiveExistsInDb(workspaceRoot, slug);
}

function workspaceRootFromCuratorDb(startPath: string): string | null {
  let cursor = resolve(startPath);
  try {
    if (!statSync(cursor).isDirectory()) {
      cursor = dirname(cursor);
    }
  } catch {
    cursor = dirname(cursor);
  }
  const resolvedStart = resolve(startPath);
  let fallback: string | null = null;
  while (true) {
    if (existsSync(join(cursor, ".cursor-curator", "curator.db"))) {
      fallback = cursor;
      if (findObjectiveSlugByDirPath(cursor, resolvedStart)) {
        return cursor;
      }
      if (existsSync(join(cursor, "docs", "objectives"))) {
        return cursor;
      }
    }
    const parent = dirname(cursor);
    if (parent === cursor) {
      return fallback;
    }
    cursor = parent;
  }
}

export function resolveWorkspaceForObjective(
  objectiveRef: string,
  options: { workspaceRoot?: string } = {},
): string {
  if (options.workspaceRoot) {
    return resolve(options.workspaceRoot);
  }

  const fromDb = workspaceRootFromCuratorDb(objectiveRef);
  if (fromDb) {
    registerKnownWorkspace(fromDb);
    return fromDb;
  }

  const parsed = parseObjectiveRef(objectiveRef);
  if (!parsed.slug) {
    throw new Error("objective slug or path is required.");
  }

  if (parsed.workspaceRoot && objectiveStateExists(parsed.workspaceRoot, parsed.slug)) {
    registerKnownWorkspace(parsed.workspaceRoot);
    return parsed.workspaceRoot;
  }

  const resolvedRef = resolve(objectiveRef);
  for (const root of collectWorkspaceCandidates()) {
    const normalizedRoot = resolve(root);
    if (!resolvedRef.startsWith(`${normalizedRoot}${sep}`)) {
      continue;
    }
    const slugByDir = findObjectiveSlugByDirPath(normalizedRoot, resolvedRef);
    if (slugByDir) {
      registerKnownWorkspace(normalizedRoot);
      return normalizedRoot;
    }
  }

  for (const root of collectWorkspaceCandidates()) {
    if (objectiveStateExists(root, parsed.slug)) {
      registerKnownWorkspace(root);
      return root;
    }
  }

  return getWorkspaceRoot();
}

export function getWorkspaceRoot(): string {
  const explicit = process.env.CURATOR_WORKSPACE ? resolve(process.env.CURATOR_WORKSPACE) : null;

  if (explicit && isForcedWorkspaceOverride()) {
    return explicit;
  }

  const fromCursor = pickWorkspaceFromCursorEnv();
  if (fromCursor) {
    return fromCursor;
  }

  for (const root of collectWorkspaceCandidates()) {
    if (hasObjectivesDir(root)) {
      return root;
    }
  }

  if (explicit && hasObjectivesDir(explicit)) {
    return explicit;
  }

  if (explicit && !isProbablyHome(explicit)) {
    return explicit;
  }

  const cwd = resolve(process.cwd());
  if (!isProbablyHome(cwd)) {
    return cwd;
  }

  const nonHomeCandidate = collectWorkspaceCandidates().find((root) => !isProbablyHome(root));
  if (nonHomeCandidate) {
    return nonHomeCandidate;
  }

  return explicit || cwd;
}

export function resolveObjectiveStatePath(objectiveRef: string, workspaceRoot?: string): string {
  const root = resolve(
    workspaceRoot !== undefined && workspaceRoot !== null
      ? workspaceRoot
      : resolveWorkspaceForObjective(objectiveRef),
  );
  const slug = resolveObjectiveSlug(objectiveRef, root);
  if (!objectiveExistsInDb(root, slug)) {
    const searched = collectWorkspaceCandidates().slice(0, 6).join(", ") || root;
    throw new Error(
      `Objective not found in database: ${slug} (searched roots: ${searched}; run: bun cursor-curator/dist/cli/curator.mjs db import)`,
    );
  }
  return logicalBoardPath(slug);
}

export function resolveObjectiveDir(objectiveRef: string, workspaceRoot?: string): string {
  const root = resolve(
    workspaceRoot !== undefined && workspaceRoot !== null
      ? workspaceRoot
      : resolveWorkspaceForObjective(objectiveRef),
  );
  return resolveObjectiveDirectory(objectiveRef, root);
}
