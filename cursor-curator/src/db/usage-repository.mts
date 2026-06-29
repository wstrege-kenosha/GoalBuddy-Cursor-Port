import type { Database } from "bun:sqlite";
import { resolve } from "node:path";
import {
  ensureWorkspace,
  logicalBoardPath,
  openDatabase,
  withTransaction,
} from "./connection.mjs";
import { invalidateHubPayloadCache } from "../hub/objective-hub.mjs";
import type {
  UsageCounters,
  UsageFile,
  UsageSession,
} from "../usage/objective-usage.mjs";

const MAX_SESSIONS = 50;

type ObjectiveRow = {
  id: number;
  slug: string;
};

export function logicalUsagePath(slug: string): string {
  return `${logicalBoardPath(slug)}#usage`;
}

function emptyCounters(): UsageCounters {
  return {
    duration_ms: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    session_count: 0,
  };
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function addCounters(target: UsageCounters, source: Partial<UsageCounters>): void {
  target.duration_ms += num(source.duration_ms);
  target.input_tokens += num(source.input_tokens);
  target.output_tokens += num(source.output_tokens);
  target.cache_read_tokens += num(source.cache_read_tokens);
  target.cache_write_tokens += num(source.cache_write_tokens);
  target.session_count += num(source.session_count);
}

function objectiveRowBySlug(db: Database, workspaceId: number, slug: string): ObjectiveRow | null {
  return (
    db
      .query<ObjectiveRow, [number, string]>(
        "SELECT id, slug FROM objectives WHERE workspace_id = ? AND slug = ?",
      )
      .get(workspaceId, slug) ?? null
  );
}

function normalizeStoredDirPath(dirPath: string): string {
  return resolve(dirPath).replace(/\\/g, "/").toLowerCase();
}

function objectiveRowByDirPath(
  db: Database,
  workspaceId: number,
  dirPath: string,
): ObjectiveRow | null {
  const normalized = normalizeStoredDirPath(dirPath);
  const rows = db
    .query<{ id: number; slug: string; dir_path: string }, [number]>(
      "SELECT id, slug, dir_path FROM objectives WHERE workspace_id = ?",
    )
    .all(workspaceId);
  return rows.find((row) => normalizeStoredDirPath(row.dir_path) === normalized) ?? null;
}

export function resolveObjectiveUsageTarget(
  workspaceRoot: string,
  ref: { slug?: string | null; objectiveDir?: string | null },
): { slug: string; objectiveId: number } | null {
  const root = resolve(workspaceRoot);
  const db = openDatabase(root);
  const workspaceId = ensureWorkspace(db, root);

  if (ref.slug) {
    const row = objectiveRowBySlug(db, workspaceId, ref.slug);
    return row ? { slug: row.slug, objectiveId: row.id } : null;
  }

  if (ref.objectiveDir) {
    const row = objectiveRowByDirPath(db, workspaceId, ref.objectiveDir);
    return row ? { slug: row.slug, objectiveId: row.id } : null;
  }

  return null;
}

type UsageSessionRow = {
  id: number;
  objective_id: number;
  task_id: string;
  at: string;
  hook: string | null;
  model: string | null;
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  status: string | null;
};

function rowToSession(row: UsageSessionRow): UsageSession {
  return {
    at: row.at,
    task_id: row.task_id,
    hook: row.hook ?? "stop",
    model: row.model,
    duration_ms: num(row.duration_ms),
    input_tokens: num(row.input_tokens),
    output_tokens: num(row.output_tokens),
    cache_read_tokens: num(row.cache_read_tokens),
    cache_write_tokens: num(row.cache_write_tokens),
    status: row.status,
  };
}

function sessionCounters(session: UsageSession): UsageCounters {
  return {
    duration_ms: session.duration_ms,
    input_tokens: session.input_tokens,
    output_tokens: session.output_tokens,
    cache_read_tokens: session.cache_read_tokens,
    cache_write_tokens: session.cache_write_tokens,
    session_count: 1,
  };
}

export function buildUsageFileFromSessions(sessions: UsageSession[]): UsageFile {
  const data: UsageFile = {
    version: 1,
    rollup: emptyCounters(),
    tasks: {},
    unattributed: emptyCounters(),
    sessions: [...sessions],
  };

  for (const session of sessions) {
    const counters = sessionCounters(session);
    addCounters(data.rollup, counters);

    if (session.task_id === "unattributed") {
      addCounters(data.unattributed, counters);
      continue;
    }

    const existing = data.tasks[session.task_id] ?? { ...emptyCounters() };
    addCounters(existing, counters);
    existing.last_session_at = session.at;
    if (session.model) {
      const models = new Set(existing.models ?? []);
      models.add(session.model);
      existing.models = [...models];
    }
    data.tasks[session.task_id] = existing;
  }

  return data;
}

function loadSessionRows(db: Database, objectiveId: number): UsageSessionRow[] {
  return db
    .query<UsageSessionRow, [number]>(
      `SELECT id, objective_id, task_id, at, hook, model, duration_ms, input_tokens,
              output_tokens, cache_read_tokens, cache_write_tokens, status
       FROM usage_sessions
       WHERE objective_id = ?
       ORDER BY at ASC, id ASC`,
    )
    .all(objectiveId);
}

export function loadUsageFileFromDb(
  workspaceRoot: string,
  slug: string,
): UsageFile | null {
  const target = resolveObjectiveUsageTarget(workspaceRoot, { slug });
  if (!target) {
    return null;
  }

  const db = openDatabase(workspaceRoot);
  const rows = loadSessionRows(db, target.objectiveId);
  if (!rows.length) {
    return null;
  }

  return buildUsageFileFromSessions(rows.map(rowToSession));
}

export function usageSessionCountInDb(workspaceRoot: string, slug: string): number {
  const target = resolveObjectiveUsageTarget(workspaceRoot, { slug });
  if (!target) {
    return 0;
  }
  const db = openDatabase(workspaceRoot);
  const row = db
    .query<{ count: number }, [number]>(
      "SELECT COUNT(*) AS count FROM usage_sessions WHERE objective_id = ?",
    )
    .get(target.objectiveId);
  return row?.count ?? 0;
}

function trimSessions(db: Database, objectiveId: number): void {
  const row = db
    .query<{ count: number }, [number]>(
      "SELECT COUNT(*) AS count FROM usage_sessions WHERE objective_id = ?",
    )
    .get(objectiveId);
  const count = row?.count ?? 0;
  if (count <= MAX_SESSIONS) {
    return;
  }
  const excess = count - MAX_SESSIONS;
  db.query(
    `DELETE FROM usage_sessions
     WHERE id IN (
       SELECT id FROM usage_sessions
       WHERE objective_id = ?
       ORDER BY at ASC, id ASC
       LIMIT ?
     )`,
  ).run(objectiveId, excess);
}

export function appendUsageSessionToDb(
  workspaceRoot: string,
  ref: { slug?: string | null; objectiveDir?: string | null },
  event: UsageSession,
): { usage_path: string; task_id: string; slug: string } | null {
  const target = resolveObjectiveUsageTarget(workspaceRoot, ref);
  if (!target) {
    return null;
  }

  const db = openDatabase(workspaceRoot);
  withTransaction(db, () => {
    db.query(
      `INSERT INTO usage_sessions (
         objective_id, task_id, at, hook, model, duration_ms, input_tokens, output_tokens,
         cache_read_tokens, cache_write_tokens, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      target.objectiveId,
      event.task_id,
      event.at,
      event.hook,
      event.model,
      event.duration_ms,
      event.input_tokens,
      event.output_tokens,
      event.cache_read_tokens,
      event.cache_write_tokens,
      event.status,
    );
    trimSessions(db, target.objectiveId);
  });

  invalidateHubPayloadCache();

  return {
    usage_path: logicalUsagePath(target.slug),
    task_id: event.task_id,
    slug: target.slug,
  };
}

export function importUsageFileToDb(
  workspaceRoot: string,
  slug: string,
  data: UsageFile,
): number {
  const target = resolveObjectiveUsageTarget(workspaceRoot, { slug });
  if (!target || !data.sessions.length) {
    return 0;
  }

  if (usageSessionCountInDb(workspaceRoot, slug) > 0) {
    return 0;
  }

  const db = openDatabase(workspaceRoot);
  withTransaction(db, () => {
    for (const session of data.sessions) {
      db.query(
        `INSERT INTO usage_sessions (
           objective_id, task_id, at, hook, model, duration_ms, input_tokens, output_tokens,
           cache_read_tokens, cache_write_tokens, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        target.objectiveId,
        session.task_id,
        session.at,
        session.hook,
        session.model,
        session.duration_ms,
        session.input_tokens,
        session.output_tokens,
        session.cache_read_tokens,
        session.cache_write_tokens,
        session.status,
      );
    }
    trimSessions(db, target.objectiveId);
  });

  invalidateHubPayloadCache();
  return data.sessions.length;
}
