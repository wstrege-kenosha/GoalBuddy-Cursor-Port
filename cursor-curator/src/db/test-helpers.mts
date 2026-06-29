import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { StateV3 } from "../schema/state-v3.js";
import { closeDatabase, resetDatabaseCache } from "./connection.mjs";
import { saveStateV3, importObjectiveFixture } from "./state-repository.mjs";

export function seedObjectiveInDb(
  workspaceRoot: string,
  state: StateV3,
  options: { slug?: string } = {},
): void {
  resetDatabaseCache();
  const slug = options.slug ?? state.objective.slug;
  const objectiveDir = join(workspaceRoot, "docs", "objectives", slug);
  mkdirSync(objectiveDir, { recursive: true });
  mkdirSync(join(objectiveDir, "notes"), { recursive: true });
  writeFileSync(join(objectiveDir, "objective.md"), `# ${state.objective.title}\n`, "utf8");
  saveStateV3(workspaceRoot, { ...state, objective: { ...state.objective, slug } }, {
    dirPath: objectiveDir,
  });
}

export function seedSmokeObjective(workspaceRoot: string): void {
  resetDatabaseCache();
  importObjectiveFixture(workspaceRoot, "sample-cursor-smoke");
}

export function teardownWorkspaceDb(workspaceRoot?: string): void {
  if (workspaceRoot) {
    closeDatabase(workspaceRoot);
    return;
  }
  resetDatabaseCache();
}

export function removeWorkspaceDir(root: string): void {
  teardownWorkspaceDb(root);
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EBUSY" && code !== "EPERM") {
      throw error;
    }
  }
}
