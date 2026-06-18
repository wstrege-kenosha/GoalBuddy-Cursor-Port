import { existsSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";

export function getWorkspaceRoot() {
  return resolve(process.env.GOALBUDDY_WORKSPACE || process.cwd());
}

export function resolveGoalStatePath(goalRef, workspaceRoot = getWorkspaceRoot()) {
  const root = resolve(workspaceRoot);
  const ref = String(goalRef || "").trim().replace(/\\/g, "/");
  if (!ref) {
    throw new Error("goal slug or path is required.");
  }

  let candidate;
  if (!ref.includes("/")) {
    candidate = join(root, "docs", "goals", ref, "state.yaml");
  } else if (basename(ref) === "state.yaml") {
    candidate = join(root, ref);
  } else {
    candidate = join(root, ref, "state.yaml");
  }

  const normalized = resolve(candidate);
  assertUnderDocsGoals(normalized, root);
  if (!existsSync(normalized)) {
    throw new Error(`state.yaml not found: ${normalized}`);
  }
  return normalized;
}

export function resolveGoalDir(goalRef, workspaceRoot = getWorkspaceRoot()) {
  return resolve(resolveGoalStatePath(goalRef, workspaceRoot), "..");
}

function assertUnderDocsGoals(statePath, workspaceRoot) {
  const goalsRoot = resolve(workspaceRoot, "docs", "goals");
  const prefix = goalsRoot.endsWith(sep) ? goalsRoot : `${goalsRoot}${sep}`;
  const normalized = resolve(statePath);
  if (!normalized.toLowerCase().startsWith(prefix.toLowerCase())) {
    throw new Error(`Goal path must stay under docs/goals/: ${statePath}`);
  }
}
