import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadState } from "../state/objective-state.mjs";
import { resolveObjectiveStatePath } from "../stale/objective-stale.mjs";
import {
  discoverAllObjectiveDirsFromHook,
  resolveObjectiveDirsFromHook,
} from "../hook/objective-hook-resolve.mjs";
import {
  appendUsageSessionToDb,
  importUsageFileToDb,
  loadUsageFileFromDb,
} from "../db/usage-repository.mjs";
import { findObjectiveSlugByDirPath } from "../db/state-repository.mjs";
import { resolveWorkspaceForObjective } from "../mcp/path-utils.mjs";
import {
  normalizeSubobjectivePath,
  resolveChildObjectiveDir,
} from "../subobjective/subobjective-path.mjs";
import { usageRollupVisible } from "./usage-present.mjs";
import {
  emptyUsageCounters,
  emptyUsageFile,
  usageNum,
  type ParsedHookUsage,
  type ReadUsageSummaryForObjectiveOptions,
  type SubobjectiveTaskRef,
  type UsageCounters,
  type UsageFile,
  type UsageSession,
  type UsageSummary,
  type UsageSummaryWithChildren,
} from "./usage-types.mjs";

const USAGE_RELATIVE_PATH = join("notes", "usage.json");

function usageFilePath(objectiveDir: string): string {
  return join(resolve(objectiveDir), USAGE_RELATIVE_PATH);
}

export function readHookPayload(): Record<string, unknown> {
  const hookInput =
    process.env.CURATOR_HOOK_INPUT?.trim()
    || process.env.CURSOR_HOOK_INPUT?.trim();
  if (hookInput) {
    try {
      return JSON.parse(hookInput) as Record<string, unknown>;
    } catch {
    }
  }

  try {
    if (!process.stdin.isTTY) {
      const text = readFileSync(0, "utf8").trim();
      if (text) {
        return JSON.parse(text) as Record<string, unknown>;
      }
    }
  } catch {
  }

  return {};
}

export function parseHookUsagePayload(payload: Record<string, unknown>): ParsedHookUsage {
  return {
    model: typeof payload.model === "string" ? payload.model : null,
    duration_ms: usageNum(payload.duration_ms),
    input_tokens: usageNum(payload.input_tokens),
    output_tokens: usageNum(payload.output_tokens),
    cache_read_tokens: usageNum(payload.cache_read_tokens),
    cache_write_tokens: usageNum(payload.cache_write_tokens),
    status: typeof payload.status === "string" ? payload.status : null,
  };
}

export function workspaceRootFromObjectiveDir(objectiveDir: string): string {
  return resolveWorkspaceForObjective(objectiveDir);
}

export function readActiveTaskId(statePath: string, workspaceRoot?: string): string | null {
  try {
    return loadState(statePath, workspaceRoot).state.active_task;
  } catch {
    return null;
  }
}

export function attributeTaskId(
  payload: Record<string, unknown>,
  statePath: string,
  workspaceRoot?: string,
): string {
  if (typeof payload.task_id === "string" && /^T\d{3}$/.test(payload.task_id)) {
    return payload.task_id;
  }

  try {
    const state = loadState(statePath, workspaceRoot).state;
    const activeId = state.active_task;
    if (!activeId) {
      return "unattributed";
    }
    const task = state.tasks.find((entry) => entry.id === activeId);
    if (task?.status === "active") {
      return activeId;
    }
  } catch {
  }

  return "unattributed";
}

function addCounters(target: UsageCounters, source: Partial<UsageCounters>): void {
  target.duration_ms += usageNum(source.duration_ms);
  target.input_tokens += usageNum(source.input_tokens);
  target.output_tokens += usageNum(source.output_tokens);
  target.cache_read_tokens += usageNum(source.cache_read_tokens);
  target.cache_write_tokens += usageNum(source.cache_write_tokens);
  target.session_count += usageNum(source.session_count);
}

export function mergeUsageCounters(...sources: Partial<UsageCounters>[]): UsageCounters {
  const merged = emptyUsageCounters();
  for (const source of sources) {
    addCounters(merged, source);
  }
  return merged;
}

export function discoverChildUsageDirs(
  objectiveDir: string,
  tasks: SubobjectiveTaskRef[],
): Array<{ path: string; dir: string; usage_path: string }> {
  const resolvedObjectiveDir = resolve(objectiveDir);
  const seen = new Set<string>();
  const entries: Array<{ path: string; dir: string; usage_path: string }> = [];

  for (const task of tasks) {
    const childRelative = task.subobjective?.path;
    if (!childRelative) {
      continue;
    }

    const dir = resolveChildObjectiveDir(resolvedObjectiveDir, childRelative);
    if (!dir || seen.has(dir)) {
      continue;
    }
    seen.add(dir);

    entries.push({
      path: normalizeSubobjectivePath(childRelative),
      dir,
      usage_path: join(dir, USAGE_RELATIVE_PATH),
    });
  }

  return entries;
}

function readUsageFileFromJson(objectiveDir: string): UsageFile {
  const path = usageFilePath(objectiveDir);
  if (!existsSync(path)) {
    return emptyUsageFile();
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<UsageFile>;
    if (parsed.version !== 1) {
      return emptyUsageFile();
    }
    return {
      version: 1,
      rollup: { ...emptyUsageCounters(), ...(parsed.rollup || {}) },
      tasks: parsed.tasks && typeof parsed.tasks === "object" ? parsed.tasks : {},
      unattributed: { ...emptyUsageCounters(), ...(parsed.unattributed || {}) },
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    return emptyUsageFile();
  }
}

function importLegacyUsageOnce(
  workspaceRoot: string,
  slug: string,
  objectiveDir: string,
): void {
  if (loadUsageFileFromDb(workspaceRoot, slug)) {
    return;
  }
  const legacy = readUsageFileFromJson(objectiveDir);
  if (legacy.sessions.length > 0) {
    importUsageFileToDb(workspaceRoot, slug, legacy);
  }
}

function resolveUsageFile(objectiveDir: string): UsageFile {
  const resolvedDir = resolve(objectiveDir);
  const legacy = readUsageFileFromJson(resolvedDir);
  const workspaceRoot = workspaceRootFromObjectiveDir(resolvedDir);
  const slug = findObjectiveSlugByDirPath(workspaceRoot, resolvedDir);

  if (!slug) {
    return legacy;
  }

  importLegacyUsageOnce(workspaceRoot, slug, resolvedDir);

  const fromDb = loadUsageFileFromDb(workspaceRoot, slug);
  if (fromDb) {
    return fromDb;
  }

  if (legacy.rollup.session_count > 0 || legacy.sessions.length > 0) {
    return legacy;
  }

  return emptyUsageFile();
}

export function appendUsageEvent(
  objectiveDir: string,
  event: UsageSession,
): { path: string; task_id: string } {
  const resolvedDir = resolve(objectiveDir);
  const workspaceRoot = workspaceRootFromObjectiveDir(resolvedDir);
  const slug = findObjectiveSlugByDirPath(workspaceRoot, resolvedDir);
  if (slug) {
    importLegacyUsageOnce(workspaceRoot, slug, resolvedDir);
  }

  const dbResult = appendUsageSessionToDb(workspaceRoot, { objectiveDir: resolvedDir }, event);
  if (!dbResult) {
    throw new Error(
      `Cannot record usage: objective not found in database for ${resolvedDir} (run: bun cursor-curator/dist/cli/curator.mjs db import)`,
    );
  }

  return { path: dbResult.usage_path, task_id: dbResult.task_id };
}

export function readUsageSummary(objectiveDir: string): UsageSummary {
  const data = resolveUsageFile(objectiveDir);
  const hasData = data.rollup.session_count > 0 || data.sessions.length > 0;

  return {
    present: hasData,
    rollup: data.rollup,
    tasks: data.tasks,
    unattributed: data.unattributed,
    has_unattributed: data.unattributed.session_count > 0,
  };
}

export function readUsageSummaryForObjective(
  objectiveDir: string,
  options: ReadUsageSummaryForObjectiveOptions = {},
): UsageSummaryWithChildren {
  const includeSubobjectives = options.include_subobjectives !== false;
  const parentSummary = readUsageSummary(objectiveDir);
  const children: Record<string, UsageSummary> = {};

  if (!includeSubobjectives || !options.tasks?.length) {
    return {
      ...parentSummary,
      children,
      rollup_includes_subobjectives: false,
    };
  }

  const childDirs = discoverChildUsageDirs(objectiveDir, options.tasks);
  const childRollups: UsageCounters[] = [];

  for (const entry of childDirs) {
    const childSummary = readUsageSummary(entry.dir);
    children[entry.path] = childSummary;
    childRollups.push(childSummary.rollup);
  }

  const mergedRollup = mergeUsageCounters(parentSummary.rollup, ...childRollups);
  const hasChildData = childRollups.some((rollup) => usageRollupVisible(rollup));

  return {
    ...parentSummary,
    rollup: mergedRollup,
    present: parentSummary.present || hasChildData,
    children,
    rollup_includes_subobjectives: childDirs.length > 0,
  };
}

export function processHookUsage(payload: Record<string, unknown>): {
  ok: boolean;
  skipped?: string;
  appended: Array<{ objective_dir: string; usage_path: string; task_id: string }>;
  warnings: string[];
} {
  const parsed = parseHookUsagePayload(payload);
  const hookName = typeof payload.hook_event_name === "string" ? payload.hook_event_name : "stop";
  const allDirs = discoverAllObjectiveDirsFromHook(payload);
  const objectiveDirs = resolveObjectiveDirsFromHook(payload);
  const warnings: string[] = [];

  if (!objectiveDirs.length) {
    if (allDirs.length > 1 && typeof payload.objective_slug !== "string") {
      warnings.push(
        "Multiple objectives matched workspace roots; set objective_slug in the hook payload to record usage once.",
      );
      return { ok: true, skipped: "ambiguous objective; set objective_slug", appended: [], warnings };
    }
    return { ok: true, skipped: "no objectives under docs/objectives", appended: [], warnings };
  }

  const hasUsageSignal =
    parsed.duration_ms > 0
    || parsed.input_tokens > 0
    || parsed.output_tokens > 0
    || parsed.cache_read_tokens > 0
    || parsed.cache_write_tokens > 0;

  if (!hasUsageSignal) {
    warnings.push("Hook payload had no duration_ms or token fields; session recorded without usage counters.");
  }

  const appended: Array<{ objective_dir: string; usage_path: string; task_id: string }> = [];
  const at = new Date().toISOString();

  for (const objectiveDir of objectiveDirs) {
    const workspaceRoot = workspaceRootFromObjectiveDir(objectiveDir);
    const statePath = resolveObjectiveStatePath(objectiveDir);
    if (!statePath) {
      continue;
    }

    const taskId = attributeTaskId(payload, statePath, workspaceRoot);
    const result = appendUsageEvent(objectiveDir, {
      at,
      task_id: taskId,
      hook: hookName,
      model: parsed.model,
      duration_ms: parsed.duration_ms,
      input_tokens: parsed.input_tokens,
      output_tokens: parsed.output_tokens,
      cache_read_tokens: parsed.cache_read_tokens,
      cache_write_tokens: parsed.cache_write_tokens,
      status: parsed.status,
    });

    appended.push({
      objective_dir: objectiveDir,
      usage_path: result.path,
      task_id: result.task_id,
    });
  }

  return { ok: true, appended, warnings };
}
