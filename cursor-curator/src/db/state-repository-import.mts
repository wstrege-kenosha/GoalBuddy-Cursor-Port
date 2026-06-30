import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { StateV3Schema, type StateV3 } from "../schema/state-v3.js";
import { ensureWorkspace, withTransaction } from "./connection.mjs";
import { invalidateHubPayloadCache } from "../hub/objective-hub.mjs";
import { getDb, objectiveRowBySlug } from "./state-repository-read.mjs";
import {
  insertObjectiveGraph,
} from "./state-persist.mjs";
import { replaceSubobjectiveLinks } from "./state-subobjective-links.mjs";
import {
  fixtureStateJsonPath,
  fixturesRoot,
  loadObjectiveTemplate,
  loadStateV3,
  objectiveExistsInDb,
} from "./state-repository-read.mjs";
import type { LoadedObjective } from "./state-repository-types.mjs";

function importSubobjectives(
  workspaceRoot: string,
  subRoot: string,
  childPaths: (entryName: string) => { jsonPath: string; dirPath: string },
): void {
  if (!existsSync(subRoot)) {
    return;
  }
  for (const entry of readdirSync(subRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const { jsonPath, dirPath } = childPaths(entry.name);
    if (!existsSync(jsonPath)) {
      continue;
    }
    const childParsed = StateV3Schema.parse(JSON.parse(readFileSync(jsonPath, "utf8")) as unknown);
    const childSlug = childParsed.objective.slug;
    if (!objectiveExistsInDb(workspaceRoot, childSlug)) {
      importStateJsonFile(workspaceRoot, jsonPath, { dirPath });
    }
  }
}

function importSubobjectivesFromDir(workspaceRoot: string, objectiveDir: string): void {
  const subRoot = join(objectiveDir, "subobjectives");
  importSubobjectives(workspaceRoot, subRoot, (name) => {
    const childDir = join(subRoot, name);
    return { jsonPath: join(childDir, "state.json"), dirPath: childDir };
  });
}

function importSubobjectivesFromFixtureTree(
  workspaceRoot: string,
  fixtureDir: string,
  objectiveDir: string,
): void {
  const subRoot = join(fixtureDir, "subobjectives");
  importSubobjectives(workspaceRoot, subRoot, (name) => ({
    jsonPath: join(subRoot, name, "state.json"),
    dirPath: join(objectiveDir, "subobjectives", name),
  }));
}

export function importObjectiveFixture(
  workspaceRoot: string,
  fixturePath: string,
  options: { dirPath?: string } = {},
): LoadedObjective {
  const fixtureDir = join(fixturesRoot(), fixturePath);
  const jsonPath = fixtureStateJsonPath(fixturePath);
  if (!existsSync(jsonPath)) {
    throw new Error(`Fixture state.json not found: ${jsonPath}`);
  }
  const parsed = StateV3Schema.parse(JSON.parse(readFileSync(jsonPath, "utf8")) as unknown);
  const dirPath =
    options.dirPath
    ?? join(resolve(workspaceRoot), "docs", "objectives", parsed.objective.slug);
  importSubobjectivesFromFixtureTree(workspaceRoot, fixtureDir, dirPath);
  return importStateJsonFile(workspaceRoot, jsonPath, { dirPath });
}

export function saveStateV3(
  workspaceRoot: string,
  state: StateV3,
  options: { dirPath?: string } = {},
): LoadedObjective {
  const parsed = StateV3Schema.safeParse(state);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    );
  }
  const root = resolve(workspaceRoot);
  const dirPath =
    options.dirPath ?? join(root, "docs", "objectives", parsed.data.objective.slug);
  const db = getDb(root);

  const result = withTransaction(db, () => {
    const workspaceId = ensureWorkspace(db, root);
    const existing = objectiveRowBySlug(db, workspaceId, parsed.data.objective.slug);
    const objectiveId = insertObjectiveGraph(
      db,
      workspaceId,
      parsed.data,
      dirPath,
      existing?.parent_objective_id ?? null,
      existing?.parent_task_id ?? null,
      existing?.id,
    );

    replaceSubobjectiveLinks(db, workspaceId, root, objectiveId, parsed.data, dirPath);

    return loadStateV3(root, parsed.data.objective.slug);
  });
  invalidateHubPayloadCache();
  return result;
}

export function importStateJsonFile(
  workspaceRoot: string,
  stateJsonPath: string,
  options: { dirPath?: string } = {},
): LoadedObjective {
  const dirPath = options.dirPath ?? resolve(stateJsonPath, "..");
  importSubobjectivesFromDir(workspaceRoot, dirPath);
  const text = readFileSync(stateJsonPath, "utf8");
  const raw = JSON.parse(text) as unknown;
  const parsed = StateV3Schema.parse(raw);
  return saveStateV3(workspaceRoot, parsed, { dirPath });
}

export function importLegacyObjectives(
  workspaceRoot: string,
  options: { slug?: string } = {},
): { imported: string[]; skipped: string[]; errors: string[] } {
  const root = resolve(workspaceRoot);
  const objectivesRoot = join(root, "docs", "objectives");
  const imported: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  if (!existsSync(objectivesRoot)) {
    return { imported, skipped, errors };
  }

  for (const entry of readdirSync(objectivesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    if (options.slug && entry.name !== options.slug) continue;
    const slug = entry.name;
    if (objectiveExistsInDb(root, slug)) {
      skipped.push(slug);
      continue;
    }
    const jsonPath = join(objectivesRoot, slug, "state.json");
    if (!existsSync(jsonPath)) {
      skipped.push(slug);
      continue;
    }
    try {
      importStateJsonFile(root, jsonPath, { dirPath: join(objectivesRoot, slug) });
      imported.push(slug);
    } catch (error) {
      errors.push(`${slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { imported, skipped, errors };
}

export function registerObjective(
  workspaceRoot: string,
  slug: string,
  state?: StateV3,
): LoadedObjective {
  const root = resolve(workspaceRoot);
  const dirPath = join(root, "docs", "objectives", slug);
  if (!existsSync(dirPath)) {
    throw new Error(`Objective directory not found: ${dirPath}`);
  }
  const payload = state ?? loadObjectiveTemplate(slug);
  payload.objective.slug = slug;
  return saveStateV3(root, payload, { dirPath });
}
