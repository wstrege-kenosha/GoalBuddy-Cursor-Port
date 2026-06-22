import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";

const KNOWN_WORKSPACES_FILE = "known-workspaces.json";

const CURSOR_WORKSPACE_ENV_KEYS = [
  "WORKSPACE_FOLDER_PATHS",
  "CURSOR_WORKSPACE",
  "VSCODE_WORKSPACE",
  "VSCODE_CWD",
  "CLAUDE_CODE_WORKSPACE",
];

function hasObjectivesDir(root) {
  return existsSync(join(resolve(root), "docs", "objectives"));
}

function isProbablyHome(path) {
  try {
    return resolve(path).toLowerCase() === resolve(homedir()).toLowerCase();
  } catch {
    return false;
  }
}

function splitWorkspacePaths(value) {
  const text = String(value || "").trim();
  if (!text) return [];

  return text
    .split(/[;\n]/)
    .flatMap((chunk) => chunk.split("|"))
    .map((part) => part.trim())
    .filter(Boolean);
}

function skillRootPath() {
  const cursorHome = resolve(process.env.CURSOR_HOME || join(homedir(), ".cursor"));
  return resolve(process.env.CURATOR_SKILL_ROOT || join(cursorHome, "skills", "cursor-curator"));
}

function knownWorkspacesPath() {
  return join(skillRootPath(), KNOWN_WORKSPACES_FILE);
}

function isForcedWorkspaceOverride() {
  const value = String(process.env.CURATOR_WORKSPACE_FORCE || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function normalizeCandidatePath(path) {
  return resolve(String(path || "").trim());
}

function addCandidate(seen, candidates, path) {
  if (!path) return;
  const resolved = normalizeCandidatePath(path);
  const key = resolved.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  candidates.push(resolved);
}

export function readKnownWorkspaces() {
  const configPath = knownWorkspacesPath();
  if (!existsSync(configPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    const roots = Array.isArray(parsed?.roots) ? parsed.roots : Array.isArray(parsed) ? parsed : [];
    return roots
      .map((entry) => (typeof entry === "string" ? entry : entry?.path))
      .filter(Boolean)
      .map((path) => resolve(path));
  } catch {
    return [];
  }
}

export function registerKnownWorkspace(workspaceRoot) {
  const root = resolve(workspaceRoot);
  if (!hasObjectivesDir(root)) {
    return { ok: false, path: root, reason: "missing docs/objectives/" };
  }

  const existing = readKnownWorkspaces();
  const merged = [root, ...existing.filter((entry) => entry.toLowerCase() !== root.toLowerCase())];
  const configPath = knownWorkspacesPath();
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(
    configPath,
    `${JSON.stringify({ roots: merged.map((path) => ({ path, registered_at: new Date().toISOString() })) }, null, 2)}\n`,
    "utf8",
  );
  return { ok: true, path: root, configPath };
}

export function collectWorkspaceCandidates() {
  const seen = new Set();
  const candidates = [];

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

function pickWorkspaceFromCursorEnv() {
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

export function parseGoalRef(goalRef) {
  const ref = String(goalRef || "").trim().replace(/\\/g, "/");
  if (!ref) {
    return { slug: "", workspaceRoot: null };
  }

  const absoluteMatch = ref.match(/^([A-Za-z]:.*?)\/docs\/objectives\/([^/]+)(?:\/state\.yaml)?\/?$/);
  if (absoluteMatch) {
    return {
      slug: absoluteMatch[2],
      workspaceRoot: resolve(absoluteMatch[1]),
    };
  }

  const relativeMatch = ref.match(/(?:^|\/)docs\/objectives\/([^/]+)(?:\/state\.yaml)?\/?$/);
  if (relativeMatch) {
    return { slug: relativeMatch[1], workspaceRoot: null };
  }

  if (basename(ref) === "state.yaml") {
    const slug = basename(dirname(ref));
    return { slug, workspaceRoot: null };
  }

  if (!ref.includes("/")) {
    return { slug: ref, workspaceRoot: null };
  }

  return { slug: basename(ref.replace(/\/$/, "")), workspaceRoot: null };
}

export function resolveWorkspaceForObjective(goalRef, options = {}) {
  if (options.workspaceRoot) {
    return resolve(options.workspaceRoot);
  }

  const parsed = parseGoalRef(goalRef);
  if (!parsed.slug) {
    throw new Error("objective slug or path is required.");
  }

  if (parsed.workspaceRoot) {
    const statePath = join(parsed.workspaceRoot, "docs", "objectives", parsed.slug, "state.yaml");
    if (existsSync(statePath)) {
      registerKnownWorkspace(parsed.workspaceRoot);
      return parsed.workspaceRoot;
    }
  }

  for (const root of collectWorkspaceCandidates()) {
    const statePath = join(root, "docs", "objectives", parsed.slug, "state.yaml");
    if (existsSync(statePath)) {
      registerKnownWorkspace(root);
      return root;
    }
  }

  return getWorkspaceRoot();
}

export function getWorkspaceRoot() {
  const explicit = process.env.CURATOR_WORKSPACE
    ? resolve(process.env.CURATOR_WORKSPACE)
    : null;

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

export function resolveObjectiveStatePath(goalRef, workspaceRoot) {
  const root = resolve(
    workspaceRoot !== undefined && workspaceRoot !== null
      ? workspaceRoot
      : resolveWorkspaceForObjective(goalRef),
  );
  const ref = String(goalRef || "").trim().replace(/\\/g, "/");
  if (!ref) {
    throw new Error("objective slug or path is required.");
  }

  const parsed = parseGoalRef(ref);
  let candidate;
  if (parsed.slug && (!ref.includes("/") || ref.includes("docs/objectives/") || ref.endsWith("state.yaml"))) {
    candidate = join(root, "docs", "objectives", parsed.slug, "state.yaml");
  } else if (basename(ref) === "state.yaml") {
    candidate = join(root, ref);
  } else {
    candidate = join(root, ref, "state.yaml");
  }

  const normalized = resolve(candidate);
  assertUnderDocsObjectives(normalized, root);
  if (!existsSync(normalized)) {
    const searched = collectWorkspaceCandidates().slice(0, 6).join(", ") || root;
    throw new Error(`state.yaml not found: ${normalized} (searched roots: ${searched})`);
  }
  return normalized;
}

export function resolveObjectiveDir(goalRef, workspaceRoot) {
  return resolve(resolveObjectiveStatePath(goalRef, workspaceRoot), "..");
}

function assertUnderDocsObjectives(statePath, workspaceRoot) {
  const objectivesRoot = resolve(workspaceRoot, "docs", "objectives");
  const prefix = objectivesRoot.endsWith(sep) ? objectivesRoot : `${objectivesRoot}${sep}`;
  const normalized = resolve(statePath);
  if (!normalized.toLowerCase().startsWith(prefix.toLowerCase())) {
    throw new Error(`Objective path must stay under docs/objectives/: ${statePath}`);
  }
}

