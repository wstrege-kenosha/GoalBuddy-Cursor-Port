import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { isWeakProof, loadState, validateObjectiveState } from "../state/objective-state.mjs";
import { listObjectives } from "../db/state-repository.mjs";
import { logicalBoardPath, resolveDbPath } from "../db/connection.mjs";
import {
  hubPageCss,
  themeFontLinksHtml,
  themeSurfaceCss,
  themeTokensCss,
} from "../board/board-theme.mjs";
import { readBoardRepoLinks } from "../board/port-metadata.mjs";
import { buildUsageBoardView, readUsageSummary } from "../usage/objective-usage.mjs";
import { resolveWorkspaceForObjective } from "../mcp/path-utils.mjs";

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

export function buildHubEntry(objectiveDir: string, baseUrl = "") {
  const root = resolve(objectiveDir);
  const slug = basename(root);
  const workspaceRoot = resolveWorkspaceForObjective(root);
  const boardPath = logicalBoardPath(slug);

  let validation;
  try {
    validation = validateObjectiveState(slug, workspaceRoot);
  } catch {
    validation = {
      ok: false,
      objective_status: null,
      active_task: null,
      errors: [`Objective not found in database: ${slug}`],
      warnings: [],
    };
  }

  const successCriteriaSignal = readSuccessCriteriaSignal(slug, workspaceRoot);
  const activeTask = findActiveTaskType(slug, workspaceRoot, validation.active_task);
  const usage = buildUsageBoardView(readUsageSummary(root));
  const dbStat = existsSync(resolveDbPath(workspaceRoot)) ? statSync(resolveDbPath(workspaceRoot)) : null;

  return {
    slug,
    title: readObjectiveTitle(slug, workspaceRoot) || slug,
    objective_dir: root,
    state_path: boardPath,
    board_path: boardPath,
    db_path: resolveDbPath(workspaceRoot),
    url: baseUrl ? `${baseUrl}/${slug}/` : `/${slug}/`,
    status: validation.objective_status,
    active_task: validation.active_task,
    active_task_type: activeTask?.type || null,
    success_criteria_health: isWeakProof(successCriteriaSignal) ? "weak" : "strong",
    success_criteria_signal: successCriteriaSignal,
    validation_ok: validation.ok,
    error_count: validation.errors.length,
    warning_count: validation.warnings.length,
    blockers: validation.errors.slice(0, 3),
    last_verification: readLastVerification(slug, workspaceRoot),
    stale_ms: dbStat ? Date.now() - dbStat.mtimeMs : null,
    updated_at: dbStat ? new Date(dbStat.mtimeMs).toISOString() : null,
    usage_rollup: usage.visible ? usage.rollup : null,
    usage_summary: usage.visible ? usage.summary : null,
    usage_has_unattributed: usage.has_unattributed,
  };
}

export function buildHubPayload(options: { roots?: string[]; baseUrl?: string } = {}) {
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

export function buildHubPayloadForServer(registeredObjectiveDirs: string[], options: { baseUrl?: string; roots?: string[] } = {}) {
  const baseUrl = options.baseUrl || "";
  const byDir = new Map<string, ReturnType<typeof buildHubEntry>>();
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

function readObjectiveTitle(slug: string, workspaceRoot: string): string | null {
  try {
    return loadState(slug, workspaceRoot).state.objective.title || null;
  } catch {
    return null;
  }
}

function readSuccessCriteriaSignal(slug: string, workspaceRoot: string): string | null {
  try {
    const signal = loadState(slug, workspaceRoot).state.objective.success_criteria?.signal;
    return typeof signal === "string" ? signal : null;
  } catch {
    return null;
  }
}

function findActiveTaskType(
  slug: string,
  workspaceRoot: string,
  activeTaskId: string | null,
): { type: string | null } | null {
  if (!activeTaskId) return null;
  try {
    const task = loadState(slug, workspaceRoot).state.tasks.find((entry) => entry.id === activeTaskId);
    return task ? { type: task.type } : null;
  } catch {
    return null;
  }
}

function readLastVerification(slug: string, workspaceRoot: string) {
  try {
    const loaded = loadState(slug, workspaceRoot);
    const lastVerification = loaded.state.checks?.last_verification;
    if (!lastVerification || typeof lastVerification !== "object") return null;
    const record = lastVerification as Record<string, unknown>;
    return {
      result: typeof record.result === "string" ? record.result : null,
      task: typeof record.task === "string" ? record.task : null,
      commands: Array.isArray(record.commands) ? record.commands : [],
    };
  } catch {
    return null;
  }
}

export function buildHubHtml(payload: ReturnType<typeof buildHubPayload>): string {
  const rows = payload.objectives
    .map((objective) => {
      const status = objective.status || "unknown";
      const health = objective.success_criteria_health || "weak";
      return `<tr>
        <td><a href="${objective.url}">${escapeHtml(objective.title)}</a></td>
        <td>${escapeHtml(status)}</td>
        <td>${escapeHtml(objective.active_task || "—")}</td>
        <td>${escapeHtml(health)}</td>
        <td>${objective.validation_ok ? "ok" : "errors"}</td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Cursor Curator Hub</title>
  ${themeFontLinksHtml()}
  <style>${themeTokensCss()}${themeSurfaceCss()}${hubPageCss()}</style>
</head>
<body>
  <main class="hub-page">
    <header>
      <h1>Cursor Curator objectives</h1>
      <p>${payload.objective_count} objective(s)</p>
    </header>
    <table>
      <thead><tr><th>Objective</th><th>Status</th><th>Active task</th><th>Success criteria</th><th>Validation</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
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
