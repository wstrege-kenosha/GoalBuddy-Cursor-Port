import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { loadState } from "../state/objective-state.mjs";
import {
  resolveObjectiveStatePath,
} from "../stale/objective-stale.mjs";
import {
  discoverAllObjectiveDirsFromHook,
  resolveObjectiveDirsFromHook,
} from "../hook/objective-hook-resolve.mjs";

export interface UsageCounters {
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  session_count: number;
}

export interface TaskUsage extends UsageCounters {
  last_session_at?: string;
  models?: string[];
}

export interface UsageSession {
  at: string;
  task_id: string;
  hook: string;
  model: string | null;
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  status: string | null;
}

export interface UsageFile {
  version: 1;
  rollup: UsageCounters;
  tasks: Record<string, TaskUsage>;
  unattributed: UsageCounters;
  sessions: UsageSession[];
}

export interface UsageSummary {
  present: boolean;
  rollup: UsageCounters;
  tasks: Record<string, TaskUsage>;
  unattributed: UsageCounters;
  has_unattributed: boolean;
}

export interface UsageBoardView extends UsageSummary {
  visible: boolean;
  summary: string;
  agent_time: string;
  tokens: string;
  tokens_title: string;
  usage_warning: string;
}

export interface TaskMetricsDetail {
  sessions: string;
  agent_time: string;
  input: string;
  output: string;
  models: string;
}

export interface TaskMetricsView {
  raw: TaskUsage | null;
  badge: string;
  detail: TaskMetricsDetail | null;
}

export interface ParsedHookUsage {
  model: string | null;
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  status: string | null;
}

const MAX_SESSIONS = 50;
const USAGE_RELATIVE_PATH = join("notes", "usage.json");

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

function usageFilePath(objectiveDir: string): string {
  return join(resolve(objectiveDir), USAGE_RELATIVE_PATH);
}

export function emptyUsageFile(): UsageFile {
  return {
    version: 1,
    rollup: emptyCounters(),
    tasks: {},
    unattributed: emptyCounters(),
    sessions: [],
  };
}

export function readHookPayload(): Record<string, unknown> {
  if (process.env.CURSOR_HOOK_INPUT?.trim()) {
    try {
      return JSON.parse(process.env.CURSOR_HOOK_INPUT) as Record<string, unknown>;
    } catch {
      /* fall through */
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
    /* ignore malformed stdin */
  }

  return {};
}

export function parseHookUsagePayload(payload: Record<string, unknown>): ParsedHookUsage {
  return {
    model: typeof payload.model === "string" ? payload.model : null,
    duration_ms: num(payload.duration_ms),
    input_tokens: num(payload.input_tokens),
    output_tokens: num(payload.output_tokens),
    cache_read_tokens: num(payload.cache_read_tokens),
    cache_write_tokens: num(payload.cache_write_tokens),
    status: typeof payload.status === "string" ? payload.status : null,
  };
}

export { discoverAllObjectiveDirsFromHook, resolveObjectiveDirsFromHook } from "../hook/objective-hook-resolve.mjs";

export function workspaceRootFromObjectiveDir(objectiveDir: string): string {
  return resolve(objectiveDir, "..", "..", "..");
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
    /* ignore invalid state */
  }

  return "unattributed";
}

function addCounters(target: UsageCounters, source: Partial<UsageCounters>): void {
  target.duration_ms += num(source.duration_ms);
  target.input_tokens += num(source.input_tokens);
  target.output_tokens += num(source.output_tokens);
  target.cache_read_tokens += num(source.cache_read_tokens);
  target.cache_write_tokens += num(source.cache_write_tokens);
  target.session_count += num(source.session_count);
}

function countersFromSession(session: UsageSession): UsageCounters {
  return {
    duration_ms: session.duration_ms,
    input_tokens: session.input_tokens,
    output_tokens: session.output_tokens,
    cache_read_tokens: session.cache_read_tokens,
    cache_write_tokens: session.cache_write_tokens,
    session_count: 1,
  };
}

function readUsageFile(objectiveDir: string): UsageFile {
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
      rollup: { ...emptyCounters(), ...(parsed.rollup || {}) },
      tasks: parsed.tasks && typeof parsed.tasks === "object" ? parsed.tasks : {},
      unattributed: { ...emptyCounters(), ...(parsed.unattributed || {}) },
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    return emptyUsageFile();
  }
}

function writeUsageFile(objectiveDir: string, data: UsageFile): string {
  const notesDir = join(resolve(objectiveDir), "notes");
  mkdirSync(notesDir, { recursive: true });
  const path = usageFilePath(objectiveDir);
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  renameSync(tempPath, path);
  return path;
}

export function appendUsageEvent(
  objectiveDir: string,
  event: UsageSession,
): { path: string; task_id: string } {
  const data = readUsageFile(objectiveDir);
  const counters = countersFromSession(event);

  addCounters(data.rollup, counters);

  if (event.task_id === "unattributed") {
    addCounters(data.unattributed, counters);
  } else {
    const existing = data.tasks[event.task_id] || { ...emptyCounters() };
    addCounters(existing, counters);
    existing.last_session_at = event.at;
    if (event.model) {
      const models = new Set(existing.models || []);
      models.add(event.model);
      existing.models = [...models];
    }
    data.tasks[event.task_id] = existing;
  }

  data.sessions.push(event);
  if (data.sessions.length > MAX_SESSIONS) {
    data.sessions = data.sessions.slice(-MAX_SESSIONS);
  }

  const path = writeUsageFile(objectiveDir, data);
  return { path, task_id: event.task_id };
}

export function readUsageSummary(objectiveDir: string): UsageSummary {
  const data = readUsageFile(objectiveDir);
  const hasData = data.rollup.session_count > 0 || data.sessions.length > 0;

  return {
    present: hasData,
    rollup: data.rollup,
    tasks: data.tasks,
    unattributed: data.unattributed,
    has_unattributed: data.unattributed.session_count > 0,
  };
}

export function usageRollupVisible(rollup: UsageCounters): boolean {
  return rollup.session_count > 0
    || rollup.duration_ms > 0
    || rollup.input_tokens > 0
    || rollup.output_tokens > 0;
}

export function buildUsageBoardView(summary: UsageSummary): UsageBoardView {
  const visible = summary.present && usageRollupVisible(summary.rollup);
  const tokenTotal = summary.rollup.input_tokens + summary.rollup.output_tokens;
  const usageWarning = summary.has_unattributed
    ? `${summary.unattributed.session_count} agent session(s) could not be attributed to a task (see unattributed usage in notes/usage.json).`
    : "";

  return {
    ...summary,
    visible,
    summary: visible ? formatUsageShort(summary.rollup) : "",
    agent_time: visible && summary.rollup.duration_ms > 0
      ? formatDuration(summary.rollup.duration_ms)
      : "—",
    tokens: visible && tokenTotal > 0 ? formatTokenCount(tokenTotal) : "—",
    tokens_title: visible && tokenTotal > 0
      ? `${formatTokenCount(summary.rollup.input_tokens)} in / ${formatTokenCount(summary.rollup.output_tokens)} out`
      : "",
    usage_warning: usageWarning,
  };
}

export function formatTaskMetricsBadge(taskUsage: TaskUsage | null | undefined): string {
  if (!taskUsage || taskUsage.session_count === 0) {
    return "";
  }

  const parts: string[] = [];
  if (taskUsage.duration_ms > 0) {
    parts.push(formatDuration(taskUsage.duration_ms));
  }
  const tokenTotal = taskUsage.input_tokens + taskUsage.output_tokens;
  if (tokenTotal > 0) {
    parts.push(`${formatTokenCount(tokenTotal)} tok`);
  }
  return parts.join(" · ") || `${taskUsage.session_count} session(s)`;
}

export function buildTaskMetricsView(taskUsage: TaskUsage | null | undefined): TaskMetricsView {
  if (!taskUsage || taskUsage.session_count === 0) {
    return { raw: taskUsage ?? null, badge: "", detail: null };
  }

  return {
    raw: taskUsage,
    badge: formatTaskMetricsBadge(taskUsage),
    detail: {
      sessions: String(taskUsage.session_count),
      agent_time: taskUsage.duration_ms > 0 ? formatDuration(taskUsage.duration_ms) : "—",
      input: taskUsage.input_tokens > 0 ? formatTokenCount(taskUsage.input_tokens) : "—",
      output: taskUsage.output_tokens > 0 ? formatTokenCount(taskUsage.output_tokens) : "—",
      models: (taskUsage.models || []).join(", ") || "—",
    },
  };
}

export function formatTokenCount(value: number): string {
  const n = num(value);
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(n);
}

export function formatDuration(durationMs: number): string {
  const ms = num(durationMs);
  if (ms < 60_000) {
    return `${Math.max(1, Math.round(ms / 1000))}s`;
  }
  if (ms < 3_600_000) {
    return `${Math.round(ms / 60_000)}m`;
  }
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.round((ms % 3_600_000) / 60_000);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function formatUsageShort(counters: UsageCounters): string {
  const parts: string[] = [];
  if (counters.duration_ms > 0) {
    parts.push(`${formatDuration(counters.duration_ms)} agent time`);
  }
  const tokenTotal = counters.input_tokens + counters.output_tokens;
  if (tokenTotal > 0) {
    parts.push(
      `${formatTokenCount(tokenTotal)} tokens (${formatTokenCount(counters.input_tokens)} in / ${formatTokenCount(counters.output_tokens)} out)`,
    );
  }
  return parts.length ? parts.join(" · ") : "—";
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
