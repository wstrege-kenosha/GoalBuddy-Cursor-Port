import type { Database } from "bun:sqlite";
import { basename, resolve } from "node:path";
import { ensureWorkspace } from "../db/connection.mjs";
import { objectiveRowByDirPath } from "../db/objective-lookup.mjs";
import { getDb, objectiveRowBySlug } from "../db/state-repository-read.mjs";
import {
  childDirSegmentOrSlug,
  normalizeSubobjectivePath,
  resolveChildObjectiveDir,
} from "./subobjective-path.mjs";

export interface ResolvedChildObjective {
  slug: string;
  dirPath: string;
  normalizedPath: string;
  segment: string;
}

export function resolveChildObjectiveFromPath(
  parentDirPath: string,
  subPath: string,
): { dirPath: string; segment: string; normalizedPath: string } | null {
  const segment = childDirSegmentOrSlug(subPath);
  if (!segment) {
    return null;
  }
  const dirPath = resolveChildObjectiveDir(parentDirPath, subPath);
  if (!dirPath) {
    return null;
  }
  return {
    dirPath,
    segment,
    normalizedPath: normalizeSubobjectivePath(subPath),
  };
}

export function resolveChildObjectiveSlug(
  workspaceRoot: string,
  parentDirPath: string,
  subPath: string,
): string | null {
  return resolveChildObjectiveInWorkspace(workspaceRoot, parentDirPath, subPath)?.slug ?? null;
}

export function resolveChildObjectiveInWorkspace(
  workspaceRoot: string,
  parentDirPath: string,
  subPath: string,
): ResolvedChildObjective | null {
  const fromPath = resolveChildObjectiveFromPath(parentDirPath, subPath);
  if (!fromPath) {
    return null;
  }

  const root = resolve(workspaceRoot);
  const db = getDb(root);
  const workspaceId = ensureWorkspace(db, root);
  const byDir = objectiveRowByDirPath(db, workspaceId, fromPath.dirPath);
  if (byDir) {
    return {
      slug: byDir.slug,
      dirPath: fromPath.dirPath,
      normalizedPath: fromPath.normalizedPath,
      segment: fromPath.segment,
    };
  }

  const fallbackSlug = basename(fromPath.dirPath);
  const bySlug = objectiveRowBySlug(db, workspaceId, fallbackSlug);
  if (!bySlug) {
    return null;
  }

  return {
    slug: bySlug.slug,
    dirPath: fromPath.dirPath,
    normalizedPath: fromPath.normalizedPath,
    segment: fromPath.segment,
  };
}
