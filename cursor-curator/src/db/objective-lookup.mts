import type { Database } from "bun:sqlite";
import { resolve } from "node:path";

export function normalizeStoredDirPath(dirPath: string): string {
  return resolve(dirPath).replace(/\\/g, "/").toLowerCase();
}

export interface ObjectiveIdSlugRow {
  id: number;
  slug: string;
  dir_path: string;
}

export function objectiveRowByDirPath(
  db: Database,
  workspaceId: number,
  dirPath: string,
): ObjectiveIdSlugRow | null {
  const normalized = normalizeStoredDirPath(dirPath);
  const rows = db
    .query<ObjectiveIdSlugRow, [number]>(
      "SELECT id, slug, dir_path FROM objectives WHERE workspace_id = ?",
    )
    .all(workspaceId);
  return rows.find((row) => normalizeStoredDirPath(row.dir_path) === normalized) ?? null;
}
