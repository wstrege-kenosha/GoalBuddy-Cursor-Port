import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { isWeakProof, loadState, validateObjectiveState } from "../state/objective-state.mjs";
import { discoverObjectiveStatePaths, resolveObjectiveStatePath } from "../stale/objective-stale.mjs";
import {
  hubPageCss,
  themeFontLinksHtml,
  themeSurfaceCss,
  themeTokensCss,
} from "../board/board-theme.mjs";
import { readBoardRepoLinks } from "../board/port-metadata.mjs";
import { readLastVerificationFromState } from "../verify/objective-verify.mjs";

export function discoverObjectiveDirs(roots: string[] = [process.cwd()]): string[] {
  return discoverObjectiveStatePaths(roots).map((statePath) => resolve(statePath, ".."));
}

export function buildHubEntry(objectiveDir: string, baseUrl = "") {
  const root = resolve(objectiveDir);
  const statePath = resolveObjectiveStatePath(root);
  if (!statePath) {
    const slug = basename(root);
    return {
      slug,
      title: slug,
      objective_dir: root,
      state_path: join(root, "state.json"),
      url: baseUrl ? `${baseUrl}/${slug}/` : `/${slug}/`,
      board_path: `/${slug}/`,
      status: null,
      active_task: null,
      active_task_type: null,
      success_criteria_health: "weak",
      success_criteria_signal: null,
      validation_ok: false,
      error_count: 1,
      warning_count: 0,
      blockers: [`No state.json found under ${root}`],
      last_verification: null,
      stale_ms: null,
      updated_at: null,
    };
  }
  const validation = validateObjectiveState(statePath);
  const stateStat = existsSync(statePath) ? statSync(statePath) : null;
  const slug = basename(root);
  const boardPath = `/${slug}/`;
  const successCriteriaSignal = readSuccessCriteriaSignal(statePath);
  const activeTask = findActiveTaskType(statePath, validation.active_task);

  return {
    slug,
    title: readObjectiveTitle(statePath) || slug,
    objective_dir: root,
    state_path: statePath,
    url: baseUrl ? `${baseUrl}${boardPath}` : boardPath,
    board_path: boardPath,
    status: validation.objective_status,
    active_task: validation.active_task,
    active_task_type: activeTask?.type || null,
    success_criteria_health: isWeakProof(successCriteriaSignal) ? "weak" : "strong",
    success_criteria_signal: successCriteriaSignal,
    validation_ok: validation.ok,
    error_count: validation.errors.length,
    warning_count: validation.warnings.length,
    blockers: validation.errors.slice(0, 3),
    last_verification: readLastVerification(statePath),
    stale_ms: stateStat ? Date.now() - stateStat.mtimeMs : null,
    updated_at: stateStat ? new Date(stateStat.mtimeMs).toISOString() : null,
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

export function hubPageHtml(payload: ReturnType<typeof buildHubPayload>) {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  const repo = payload.repo || {};
  const portVersion = repo.cursorPortVersion ? ` · Cursor port ${repo.cursorPortVersion}` : "";
  const upstreamVersion = repo.upstreamVersion ? ` (${repo.upstreamVersion})` : "";
  const provenance = repo.portUrl && repo.upstreamUrl
    ? `<p class="hub-provenance">Hub UI from <a href="${repo.portUrl}" target="_blank" rel="noreferrer">${repo.portLabel || "Cursor Curator"}</a>${portVersion} · ported from upstream <a href="${repo.upstreamUrl}" target="_blank" rel="noreferrer">${repo.upstreamLabel || "tolibear/goalbuddy"}</a>${upstreamVersion}</p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cursor Curator Hub</title>
  ${themeFontLinksHtml()}
  <style>
${themeTokensCss()}
${themeSurfaceCss()}
${hubPageCss()}
  </style>
</head>
<body class="theme-hub">
  <div class="hub-wrap">
    <header class="hub-hero">
      <p class="eyebrow">Workspace</p>
      <h1>Cursor Curator Hub</h1>
      <p class="meta" id="hub-meta">Loading objectives…</p>
    </header>
    ${provenance}
    <div id="hub-root"></div>
  </div>
  <script id="hub-payload" type="application/json">${json}</script>
  <script>
    const payload = JSON.parse(document.getElementById("hub-payload").textContent);
    const root = document.getElementById("hub-root");
    const meta = document.getElementById("hub-meta");
    meta.textContent = payload.objective_count + " objective(s) · updated " + new Date(payload.generated_at).toLocaleString();
    if (!payload.objectives.length) {
      root.innerHTML = '<div class="hub-empty">No objectives found under docs/objectives/. Run /objective-prep to create one.</div>';
    } else {
      root.innerHTML = '<div class="hub-grid">' + payload.objectives.map((objective, index) => \`
        <article class="hub-card" style="--i:\${index}">
          <div class="hub-card-head">
            <a href="\${objective.url}">\${objective.title}</a>
            <div class="hub-slug">\${objective.slug}</div>
          </div>
          <div class="hub-card-badges">
            <span class="badge \${objective.status}">\${objective.status}</span>
            <span class="badge \${objective.success_criteria_health}">\${objective.success_criteria_health}</span>
          </div>
          <dl>
            <div>
              <dt>Active</dt>
              <dd>\${objective.active_task || "—"}\${objective.active_task_type ? " · " + objective.active_task_type : ""}</dd>
            </div>
            <div>
              <dt>Validation</dt>
              <dd>\${objective.warning_count} warn · \${objective.error_count} err</dd>
            </div>
            <div>
              <dt>Oracle</dt>
              <dd><span class="hub-success-criteria">\${objective.success_criteria_signal || "—"}</span></dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>\${objective.updated_at ? new Date(objective.updated_at).toLocaleString() : "—"}</dd>
            </div>
          </dl>
        </article>\`).join("") + '</div>';
    }
  </script>
</body>
</html>`;
}

function readObjectiveTitle(statePath: string): string | null {
  try {
    return loadState(statePath).state.objective.title || null;
  } catch {
    return null;
  }
}

function readSuccessCriteriaSignal(statePath: string): string | null {
  try {
    const signal = loadState(statePath).state.objective.success_criteria?.signal;
    return typeof signal === "string" ? signal : null;
  } catch {
    return null;
  }
}

function readLastVerification(statePath: string): string | null {
  if (!existsSync(statePath)) return null;
  const parsed = readLastVerificationFromState(readFileSync(statePath, "utf8"));
  if (!parsed) return null;
  return parsed.result;
}

export function readLastVerificationDetails(statePath: string) {
  if (!existsSync(statePath)) return null;
  return readLastVerificationFromState(readFileSync(statePath, "utf8"));
}

function findActiveTaskType(statePath: string, activeTaskId: string | null): { type: string } | null {
  if (!activeTaskId) return null;
  try {
    const task = loadState(statePath).state.tasks.find((entry) => entry.id === activeTaskId);
    return task ? { type: task.type } : null;
  } catch {
    return null;
  }
}
