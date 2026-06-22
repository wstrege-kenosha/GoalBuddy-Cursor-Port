import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { isWeakProof, validateGoalState } from "./objective-state.mjs";
import { discoverObjectiveStatePaths } from "./objective-stale.mjs";
import { readBoardRepoLinks } from "../../surfaces/local-goal-board/scripts/lib/port-metadata.mjs";
import {
  hubPageCss,
  themeFontLinksHtml,
  themeSurfaceCss,
  themeTokensCss,
} from "../../surfaces/local-goal-board/scripts/lib/board-theme.mjs";
import { readLastVerificationFromState } from "./objective-verify.mjs";

export function discoverObjectiveDirs(roots = [process.cwd()]) {
  return discoverObjectiveStatePaths(roots).map((statePath) => resolve(statePath, ".."));
}

export function buildHubEntry(goalDir, baseUrl = "") {
  const root = resolve(goalDir);
  const statePath = join(root, "state.yaml");
  const validation = validateGoalState(statePath);
  const stateStat = existsSync(statePath) ? statSync(statePath) : null;
  const slug = basename(root);
  const boardPath = `/${slug}/`;
  const successCriteriaSignal = readSuccessCriteriaSignal(statePath);
  const activeTask = findActiveTaskType(statePath, validation.active_task);

  return {
    slug,
    title: readGoalTitle(statePath) || slug,
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

export function buildHubPayload(options = {}) {
  const roots = options.roots?.length ? options.roots : [process.cwd()];
  const baseUrl = options.baseUrl || "";
  const goals = discoverObjectiveDirs(roots).map((goalDir) => buildHubEntry(goalDir, baseUrl));
  goals.sort((left, right) => {
    if (left.status !== right.status) {
      const order = { active: 0, blocked: 1, done: 2 };
      return (order[left.status] ?? 9) - (order[right.status] ?? 9);
    }
    return String(left.title).localeCompare(String(right.title));
  });

  return {
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    repo: readBoardRepoLinks(),
    objective_count: goals.length,
    goals,
  };
}

export function buildHubPayloadForServer(registeredGoalDirs, options = {}) {
  const baseUrl = options.baseUrl || "";
  const byDir = new Map();
  for (const goal of buildHubPayload(options).goals) {
    byDir.set(goal.objective_dir, goal);
  }
  for (const goalDir of registeredGoalDirs) {
    const root = resolve(goalDir);
    byDir.set(root, buildHubEntry(root, baseUrl));
  }

  const goals = [...byDir.values()].sort((left, right) => {
    if (left.status !== right.status) {
      const order = { active: 0, blocked: 1, done: 2 };
      return (order[left.status] ?? 9) - (order[right.status] ?? 9);
    }
    return String(left.title).localeCompare(String(right.title));
  });

  return {
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    repo: readBoardRepoLinks(),
    objective_count: goals.length,
    goals,
  };
}

export function hubPageHtml(payload) {
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
    if (!payload.goals.length) {
      root.innerHTML = '<div class="hub-empty">No objectives found under docs/objectives/. Run /objective-prep to create one.</div>';
    } else {
      root.innerHTML = '<div class="hub-grid">' + payload.goals.map((goal, index) => \`
        <article class="hub-card" style="--i:\${index}">
          <div class="hub-card-head">
            <a href="\${goal.url}">\${goal.title}</a>
            <div class="hub-slug">\${goal.slug}</div>
          </div>
          <div class="hub-card-badges">
            <span class="badge \${goal.status}">\${goal.status}</span>
            <span class="badge \${goal.success_criteria_health}">\${goal.success_criteria_health}</span>
          </div>
          <dl>
            <div>
              <dt>Active</dt>
              <dd>\${goal.active_task || "—"}\${goal.active_task_type ? " · " + goal.active_task_type : ""}</dd>
            </div>
            <div>
              <dt>Validation</dt>
              <dd>\${goal.warning_count} warn · \${goal.error_count} err</dd>
            </div>
            <div>
              <dt>Oracle</dt>
              <dd><span class="hub-success-criteria">\${goal.success_criteria_signal || "—"}</span></dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>\${goal.updated_at ? new Date(goal.updated_at).toLocaleString() : "—"}</dd>
            </div>
          </dl>
        </article>\`).join("") + '</div>';
    }
  </script>
</body>
</html>`;
}

function readGoalTitle(statePath) {
  if (!existsSync(statePath)) return null;
  const match = readFileSync(statePath, "utf8").match(/^\s{2}title:\s*(.+?)\s*$/m);
  return match ? match[1].replace(/^['"]|['"]$/g, "").trim() : null;
}

function readSuccessCriteriaSignal(statePath) {
  if (!existsSync(statePath)) return null;
  const text = readFileSync(statePath, "utf8");
  const lines = text.split(/\r?\n/);
  let inOracle = false;
  for (const line of lines) {
    if (/^\s{2}success_criteria:\s*$/.test(line)) {
      inOracle = true;
      continue;
    }
    if (inOracle && /^\s{2}\S/.test(line)) break;
    if (inOracle) {
      const match = line.match(/^\s{4}signal:\s*(.+?)\s*$/);
      if (match) return match[1].replace(/^['"]|['"]$/g, "").trim();
    }
  }
  return null;
}

function readLastVerification(statePath) {
  if (!existsSync(statePath)) return null;
  const parsed = readLastVerificationFromState(readFileSync(statePath, "utf8"));
  if (!parsed) return null;
  return parsed.result;
}

export function readLastVerificationDetails(statePath) {
  if (!existsSync(statePath)) return null;
  return readLastVerificationFromState(readFileSync(statePath, "utf8"));
}

function findActiveTaskType(statePath, activeTaskId) {
  if (!existsSync(statePath) || !activeTaskId) return null;
  const text = readFileSync(statePath, "utf8");
  const chunk = text.split(new RegExp(`-\\s+id:\\s*${activeTaskId}\\s*$`, "m"))[1];
  if (!chunk) return null;
  const typeMatch = chunk.match(/^\s{4}type:\s*(.+?)\s*$/m);
  return typeMatch ? { type: typeMatch[1].trim() } : null;
}
