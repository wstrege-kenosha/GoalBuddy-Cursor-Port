import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { isWeakProof, loadState, type LoadStateResult } from "../state/objective-state.mjs";
import { listObjectives } from "../db/state-repository.mjs";
import { logicalBoardPath, normalizeWorkspaceRoot, resolveDbPath } from "../db/connection.mjs";
import {
  hubPageCss,
  themeFontLinksHtml,
  themeSurfaceCss,
  themeTokensCss,
} from "../board/board-theme.mjs";
import { readBoardRepoLinks } from "../board/port-metadata.mjs";
import { buildUsageBoardView, readUsageSummaryForObjective } from "../usage/objective-usage.mjs";
import { resolveWorkspaceForObjective } from "../mcp/path-utils.mjs";

export interface HubObjectiveEntry {
  slug: string;
  title: string;
  objective_dir: string;
  state_path: string;
  board_path: string;
  db_path: string;
  url: string;
  status: string | null;
  active_task: string | null;
  active_task_type: string | null;
  success_criteria_health: string;
  success_criteria_signal: string | null;
  validation_ok: boolean;
  error_count: number;
  warning_count: number;
  blockers: string[];
  last_verification: {
    result: string | null;
    task: string | null;
    commands: unknown[];
  } | null;
  stale_ms: number | null;
  updated_at: string | null;
  usage_rollup: unknown;
  usage_summary: unknown;
  usage_has_unattributed: boolean;
  usage_agent_time: string;
  usage_tokens: string;
  usage_visible: boolean;
}

export interface HubPayload {
  generated_at: string;
  base_url: string;
  repo: ReturnType<typeof readBoardRepoLinks>;
  objective_count: number;
  objectives: HubObjectiveEntry[];
}

interface HubPayloadCacheEntry {
  key: string;
  payload: HubPayload;
}

let hubPayloadCache: HubPayloadCacheEntry | null = null;

export function discoverObjectiveDirs(roots: string[] = [process.cwd()]): string[] {
  const dirs = new Set<string>();
  for (const root of roots) {
    const resolvedRoot = resolve(root);
    for (const entry of listObjectives(resolvedRoot)) {
      dirs.add(entry.dirPath);
    }
    const objectivesRoot = join(resolvedRoot, "docs", "objectives");
    if (!existsSync(objectivesRoot)) continue;
    for (const entry of readdirSyncSafe(objectivesRoot)) {
      if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
      dirs.add(join(objectivesRoot, entry.name));
    }
  }
  return [...dirs];
}

function readdirSyncSafe(path: string) {
  try {
    return readdirSync(path, { withFileTypes: true });
  } catch {
    return [];
  }
}

function loadObjectiveHubState(slug: string, workspaceRoot: string): LoadStateResult | null {
  try {
    return loadState(slug, workspaceRoot);
  } catch {
    return null;
  }
}

function readLastVerificationFromLoaded(loaded: LoadStateResult) {
  const lastVerification = loaded.state.checks?.last_verification;
  if (!lastVerification || typeof lastVerification !== "object") return null;
  const record = lastVerification as Record<string, unknown>;
  return {
    result: typeof record.result === "string" ? record.result : null,
    task: typeof record.task === "string" ? record.task : null,
    commands: Array.isArray(record.commands) ? record.commands : [],
  };
}

export function buildHubEntry(objectiveDir: string, baseUrl = ""): HubObjectiveEntry {
  const root = resolve(objectiveDir);
  const slug = basename(root);
  const workspaceRoot = resolveWorkspaceForObjective(root);
  const boardPath = logicalBoardPath(slug);
  const loaded = loadObjectiveHubState(slug, workspaceRoot);

  const validation = loaded?.validation ?? {
    ok: false,
    objective_status: null,
    active_task: null,
    errors: [`Objective not found in database: ${slug}`],
    warnings: [] as string[],
  };

  const state = loaded?.state;
  const successCriteriaSignal =
    typeof state?.objective.success_criteria?.signal === "string"
      ? state.objective.success_criteria.signal
      : null;
  const activeTaskType = validation.active_task
    ? state?.tasks.find((entry) => entry.id === validation.active_task)?.type ?? null
    : null;
  const usageSummary = readUsageSummaryForObjective(root, {
    include_subobjectives: true,
    tasks: state?.tasks ?? [],
  });
  const usage = buildUsageBoardView(usageSummary);
  const dbPath = resolveDbPath(workspaceRoot);
  const dbStat = existsSync(dbPath) ? statSync(dbPath) : null;

  return {
    slug,
    title: state?.objective.title || slug,
    objective_dir: root,
    state_path: boardPath,
    board_path: boardPath,
    db_path: dbPath,
    url: baseUrl ? `${baseUrl}/${slug}/` : `/${slug}/`,
    status: validation.objective_status,
    active_task: validation.active_task,
    active_task_type: activeTaskType,
    success_criteria_health: isWeakProof(successCriteriaSignal) ? "weak" : "strong",
    success_criteria_signal: successCriteriaSignal,
    validation_ok: validation.ok,
    error_count: validation.errors.length,
    warning_count: validation.warnings.length,
    blockers: validation.errors.slice(0, 3),
    last_verification: loaded ? readLastVerificationFromLoaded(loaded) : null,
    stale_ms: dbStat ? Date.now() - dbStat.mtimeMs : null,
    updated_at: dbStat ? new Date(dbStat.mtimeMs).toISOString() : null,
    usage_rollup: usage.visible ? usage.rollup : null,
    usage_summary: usage.visible ? usage.summary : null,
    usage_has_unattributed: usage.has_unattributed,
    usage_agent_time: usage.agent_time,
    usage_tokens: usage.tokens,
    usage_visible: usage.visible,
  };
}

function hubCacheKey(roots: string[]): string {
  const normalizedRoots = roots.map((root) => normalizeWorkspaceRoot(root));
  const dbStamp = normalizedRoots
    .map((root) => {
      const dbPath = resolveDbPath(root);
      if (!existsSync(dbPath)) return `${root}:missing`;
      const stat = statSync(dbPath);
      return `${root}:${stat.mtimeMs}`;
    })
    .join("|");
  const dirStamp = discoverObjectiveDirs(roots)
    .map((dir) => basename(dir))
    .sort()
    .join(",");
  return `${dbStamp}::${dirStamp}`;
}

export function invalidateHubPayloadCache(): void {
  hubPayloadCache = null;
}

function buildHubPayloadUncached(options: { roots?: string[]; baseUrl?: string } = {}): HubPayload {
  const roots = options.roots?.length ? options.roots : [process.cwd()];
  const baseUrl = options.baseUrl || "";
  const objectives = discoverObjectiveDirs(roots).map((objectiveDir) => buildHubEntry(objectiveDir, baseUrl));
  objectives.sort((left, right) => {
    if (left.status !== right.status) {
      const order: Record<string, number> = { active: 0, blocked: 1, done: 2 };
      return (order[left.status || ""] ?? 9) - (order[right.status || ""] ?? 9);
    }
    return String(left.title).localeCompare(String(right.title));
  });

  return {
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    repo: readBoardRepoLinks(),
    objective_count: objectives.length,
    objectives,
  };
}

export function buildHubPayload(options: { roots?: string[]; baseUrl?: string; fresh?: boolean } = {}): HubPayload {
  const roots = options.roots?.length ? options.roots : [process.cwd()];
  const key = hubCacheKey(roots);
  if (!options.fresh && hubPayloadCache?.key === key) {
    return hubPayloadCache.payload;
  }
  const payload = buildHubPayloadUncached(options);
  hubPayloadCache = { key, payload };
  return payload;
}

export function buildHubPayloadForServer(
  registeredObjectiveDirs: string[],
  options: { baseUrl?: string; roots?: string[] } = {},
) {
  const baseUrl = options.baseUrl || "";
  const byDir = new Map<string, HubObjectiveEntry>();
  for (const objective of buildHubPayload(options).objectives) {
    byDir.set(objective.objective_dir, objective);
  }
  for (const objectiveDir of registeredObjectiveDirs) {
    const root = resolve(objectiveDir);
    byDir.set(root, buildHubEntry(root, baseUrl));
  }

  const objectives = [...byDir.values()].sort((left, right) => {
    if (left.status !== right.status) {
      const order: Record<string, number> = { active: 0, blocked: 1, done: 2 };
      return (order[left.status || ""] ?? 9) - (order[right.status || ""] ?? 9);
    }
    return String(left.title).localeCompare(String(right.title));
  });

  return {
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    repo: readBoardRepoLinks(),
    objective_count: objectives.length,
    objectives,
  };
}

function hubProvenanceHtml(repo: HubPayload["repo"]): string {
  const portVersion = repo.cursorPortVersion ? ` · Cursor port ${repo.cursorPortVersion}` : "";
  const upstreamVersion = repo.upstreamVersion ? ` (${repo.upstreamVersion})` : "";
  return `<p class="hub-provenance">
    Hub UI from
    <a href="${escapeHtml(repo.portUrl)}" target="_blank" rel="noreferrer">${escapeHtml(repo.portLabel)}</a>${escapeHtml(portVersion)}
    · ported from upstream
    <a href="${escapeHtml(repo.upstreamUrl)}" target="_blank" rel="noreferrer">${escapeHtml(repo.upstreamLabel)}</a>${escapeHtml(upstreamVersion)}
  </p>`;
}

function buildHubCard(objective: HubObjectiveEntry, index: number): string {
  const status = objective.status || "unknown";
  const health = objective.success_criteria_health || "weak";
  const statusClass = ["active", "blocked", "done"].includes(status) ? status : "active";
  const validationLabel = objective.validation_ok
    ? "ok"
    : `${objective.error_count} error${objective.error_count === 1 ? "" : "s"}`;
  const unattributedBadge = objective.usage_has_unattributed
    ? `<span class="badge warning" title="${escapeHtml("Some agent sessions could not be attributed to a task")}">Unattributed usage</span>`
    : "";
  const usageRows = objective.usage_visible
    ? `<div><dt>Agent time</dt><dd>${escapeHtml(objective.usage_agent_time)}</dd></div>
        <div><dt>Tokens</dt><dd>${escapeHtml(objective.usage_tokens)}</dd></div>`
    : "";

  return `<article class="hub-card" style="--i: ${index}">
      <div>
        <a href="${escapeHtml(objective.url)}">
          <h2>${escapeHtml(objective.title)}</h2>
        </a>
        <p class="meta">${escapeHtml(objective.slug)}</p>
      </div>
      <div class="hub-card-badges">
        <span class="badge ${escapeHtml(statusClass)}">${escapeHtml(status)}</span>
        <span class="badge ${escapeHtml(health)}">${escapeHtml(health)}</span>
        <span class="badge ${objective.validation_ok ? "strong" : "blocked"}">${escapeHtml(validationLabel)}</span>
        ${unattributedBadge}
      </div>
      <dl>
        <div><dt>Active task</dt><dd>${escapeHtml(objective.active_task || "—")}</dd></div>
        ${usageRows}
      </dl>
    </article>`;
}

export function buildHubHtml(payload: HubPayload): string {
  const cards = payload.objectives.length
    ? `<div class="hub-grid">${payload.objectives.map((objective, index) => buildHubCard(objective, index)).join("\n")}</div>`
    : `<p class="hub-empty">No objectives registered yet.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cursor Curator Hub</title>
  ${themeFontLinksHtml()}
  <style>${themeTokensCss()}${themeSurfaceCss()}${hubPageCss()}</style>
</head>
<body class="theme-hub">
  <main class="hub-wrap">
    <header class="hub-hero">
      <p class="eyebrow">Cursor Curator</p>
      <h1>Objectives</h1>
      <p class="meta">${payload.objective_count} objective${payload.objective_count === 1 ? "" : "s"}</p>
    </header>
    ${hubProvenanceHtml(payload.repo)}
    ${cards}
  </main>
</body>
</html>`;
}

export function hubPageHtml(payload: ReturnType<typeof buildHubPayloadForServer>): string {
  const payloadJson = JSON.stringify(payload).replace(/</g, "\\u003c");
  return buildHubHtml(payload).replace(
    "</body>",
    `<script id="hub-payload" type="application/json">${payloadJson}</script>\n</body>`,
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
