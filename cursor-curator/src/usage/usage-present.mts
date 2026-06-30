import type {
  TaskUsage,
  UsageBoardView,
  UsageCounters,
  UsageSummary,
  UsageSummaryWithChildren,
} from "./objective-usage.mjs";
import { normalizeSubobjectivePath } from "../subobjective/subobjective-path.mjs";

export interface TaskMetricsDetail {
  sessions: string;
  agent_time: string;
  input: string;
  output: string;
  models: string;
  parent_agent_time?: string;
  child_agent_time?: string;
}

export interface TaskMetricsView {
  raw: TaskUsage | null;
  badge: string;
  detail: TaskMetricsDetail | null;
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function usageRollupVisible(rollup: UsageCounters): boolean {
  return rollup.session_count > 0
    || rollup.duration_ms > 0
    || rollup.input_tokens > 0
    || rollup.output_tokens > 0;
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

export function buildUsageBoardView(summary: UsageSummary): UsageBoardView {
  const visible = summary.present && usageRollupVisible(summary.rollup);
  const tokenTotal = summary.rollup.input_tokens + summary.rollup.output_tokens;
  const usageWarning = summary.has_unattributed
    ? `${summary.unattributed.session_count} agent session(s) could not be attributed to a task (see unattributed usage in curator.db usage_sessions).`
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

export function buildTaskMetricsWithRollup(
  taskId: string,
  summary: UsageSummaryWithChildren,
  childPath?: string,
): TaskMetricsView {
  const taskUsage = summary.tasks[taskId] ?? null;
  const baseView = buildTaskMetricsView(taskUsage);
  const normalizedChildPath = childPath ? normalizeSubobjectivePath(childPath) : undefined;
  const childSummary = normalizedChildPath ? summary.children[normalizedChildPath] : undefined;

  if (!normalizedChildPath || !childSummary) {
    return baseView;
  }

  const parentDuration = taskUsage?.duration_ms ?? 0;
  const childDuration = childSummary.rollup.duration_ms;
  const parentSessions = taskUsage?.session_count ?? 0;
  const childSessions = childSummary.rollup.session_count;

  if (parentSessions === 0 && childSessions === 0) {
    return baseView;
  }

  const combinedDuration = parentDuration + childDuration;
  const combinedInput = (taskUsage?.input_tokens ?? 0) + childSummary.rollup.input_tokens;
  const combinedOutput = (taskUsage?.output_tokens ?? 0) + childSummary.rollup.output_tokens;
  const parentModels = taskUsage?.models ?? [];
  const childModels = Object.values(childSummary.tasks)
    .flatMap((entry) => entry.models || []);
  const models = [...new Set([...parentModels, ...childModels])];

  const detail: TaskMetricsDetail = {
    sessions: String(parentSessions + childSessions),
    agent_time: combinedDuration > 0 ? formatDuration(combinedDuration) : "—",
    input: combinedInput > 0 ? formatTokenCount(combinedInput) : "—",
    output: combinedOutput > 0 ? formatTokenCount(combinedOutput) : "—",
    models: models.join(", ") || "—",
  };

  if (parentDuration > 0) {
    detail.parent_agent_time = formatDuration(parentDuration);
  }
  if (childDuration > 0) {
    detail.child_agent_time = formatDuration(childDuration);
  }

  const badgeSource: TaskUsage = {
    duration_ms: combinedDuration,
    input_tokens: combinedInput,
    output_tokens: combinedOutput,
    cache_read_tokens: (taskUsage?.cache_read_tokens ?? 0) + childSummary.rollup.cache_read_tokens,
    cache_write_tokens: (taskUsage?.cache_write_tokens ?? 0) + childSummary.rollup.cache_write_tokens,
    session_count: parentSessions + childSessions,
    models,
  };

  return {
    raw: taskUsage,
    badge: formatTaskMetricsBadge(badgeSource),
    detail,
  };
}
