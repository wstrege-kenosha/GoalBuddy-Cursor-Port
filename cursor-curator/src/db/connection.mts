import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { INITIAL_MIGRATION_SQL } from "./migrations/001_initial.mjs";
import { USAGE_MIGRATION_SQL } from "./migrations/002_usage.mjs";

const MIGRATIONS = [
  { version: 1, sql: INITIAL_MIGRATION_SQL },
  { version: 2, sql: USAGE_MIGRATION_SQL },
] as const;
const MIGRATION_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

const dbCache = new Map<string, Database>();

export function normalizeWorkspaceRoot(workspaceRoot: string): string {
  const resolved = resolve(String(workspaceRoot || "").trim());
  if (process.platform === "win32" && /^[a-zA-Z]:/.test(resolved)) {
    return `${resolved[0].toUpperCase()}${resolved.slice(1)}`;
  }
  return resolved;
}

export function resolveDbPath(workspaceRoot: string): string {
  return join(normalizeWorkspaceRoot(workspaceRoot), ".cursor-curator", "curator.db");
}

export function logicalBoardPath(slug: string): string {
  return `db:${slug}`;
}

function applyPragmas(db: Database): void {
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 10000");
}

function currentMigrationVersion(db: Database): number {
  const table = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
    )
    .get();
  if (!table) return 0;
  const row = db
    .query<{ version: number | null }, []>("SELECT MAX(version) AS version FROM schema_migrations")
    .get();
  return row?.version ?? 0;
}

function runMigrations(db: Database): void {
  if (currentMigrationVersion(db) >= MIGRATION_VERSION) {
    return;
  }
  withTransaction(db, () => {
    for (const migration of MIGRATIONS) {
      if (currentMigrationVersion(db) >= migration.version) {
        continue;
      }
      db.exec(migration.sql);
      db.query("INSERT INTO schema_migrations (version) VALUES (?)").run(migration.version);
    }
  });
}

export function openDatabase(
  workspaceRoot: string,
  options: { memory?: boolean; fresh?: boolean } = {},
): Database {
  const key = options.memory ? ":memory:" : normalizeWorkspaceRoot(workspaceRoot);
  if (!options.fresh && dbCache.has(key)) {
    return dbCache.get(key)!;
  }

  const dbPath = options.memory ? ":memory:" : resolveDbPath(workspaceRoot);
  if (!options.memory) {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  applyPragmas(db);
  runMigrations(db);
  dbCache.set(key, db);
  return db;
}

export function closeDatabase(workspaceRoot: string): void {
  const key = normalizeWorkspaceRoot(workspaceRoot);
  const db = dbCache.get(key);
  if (db) {
    db.close();
    dbCache.delete(key);
  }
}

export function resetDatabaseCache(): void {
  for (const db of dbCache.values()) {
    db.close();
  }
  dbCache.clear();
}

export function withTransaction<T>(db: Database, fn: () => T): T {
  return db.transaction(fn)();
}

export function ensureWorkspace(db: Database, workspaceRoot: string): number {
  const rootPath = normalizeWorkspaceRoot(workspaceRoot);
  const existing = db
    .query<{ id: number }, [string]>("SELECT id FROM workspaces WHERE root_path = ?")
    .get(rootPath);
  if (existing) {
    db.query("UPDATE workspaces SET updated_at = datetime('now') WHERE id = ?").run(existing.id);
    return existing.id;
  }
  const result = db
    .query("INSERT INTO workspaces (root_path) VALUES (?)")
    .run(rootPath);
  return Number(result.lastInsertRowid);
}

export function workspaceHasDatabase(workspaceRoot: string): boolean {
  return existsSync(resolveDbPath(workspaceRoot));
}
