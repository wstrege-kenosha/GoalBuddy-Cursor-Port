import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { isWeakProof, validateGoalState } from "./goal-state.mjs";
import { discoverGoalStatePaths } from "./goal-stale.mjs";

export function discoverGoalDirs(roots = [process.cwd()]) {
  return discoverGoalStatePaths(roots).map((statePath) => resolve(statePath, ".."));
}

export function buildHubEntry(goalDir, baseUrl = "") {
  const root = resolve(goalDir);
  const statePath = join(root, "state.yaml");
  const validation = validateGoalState(statePath);
  const stateStat = existsSync(statePath) ? statSync(statePath) : null;
  const slug = basename(root);
  const boardPath = `/${slug}/`;
  const oracleSignal = readOracleSignal(statePath);
  const activeTask = findActiveTaskType(statePath, validation.active_task);

  return {
    slug,
    title: readGoalTitle(statePath) || slug,
    goal_dir: root,
    state_path: statePath,
    url: baseUrl ? `${baseUrl}${boardPath}` : boardPath,
    board_path: boardPath,
    status: validation.goal_status,
    active_task: validation.active_task,
    active_task_type: activeTask?.type || null,
    oracle_health: isWeakProof(oracleSignal) ? "weak" : "strong",
    oracle_signal: oracleSignal,
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
  const goals = discoverGoalDirs(roots).map((goalDir) => buildHubEntry(goalDir, baseUrl));
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
    goal_count: goals.length,
    goals,
  };
}

export function buildHubPayloadForServer(registeredGoalDirs, options = {}) {
  const baseUrl = options.baseUrl || "";
  const byDir = new Map();
  for (const goal of buildHubPayload(options).goals) {
    byDir.set(goal.goal_dir, goal);
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
    goal_count: goals.length,
    goals,
  };
}

export function hubPageHtml(payload) {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GoalBuddy Hub</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #f6f6f8; color: #111; }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 1.6rem; }
    .meta { color: #555; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #ddd; border-radius: 12px; overflow: hidden; }
    th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid #ececec; vertical-align: top; }
    th { background: #fafafa; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; }
    tr:last-child td { border-bottom: 0; }
    a { color: #4f46e5; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
    .badge.active { background: #e0e7ff; color: #312e81; }
    .badge.blocked { background: #fee2e2; color: #991b1b; }
    .badge.done { background: #dcfce7; color: #166534; }
    .badge.weak { background: #fef3c7; color: #92400e; }
    .badge.strong { background: #dcfce7; color: #166534; }
    .empty { padding: 32px; text-align: center; color: #666; }
    @media (prefers-color-scheme: dark) {
      body { background: #111; color: #f5f5f5; }
      table { background: #1a1a1a; border-color: #333; }
      th { background: #202020; }
      th, td { border-color: #2d2d2d; }
      .meta { color: #aaa; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>GoalBuddy Hub</h1>
    <p class="meta" id="hub-meta">Loading goals…</p>
    <div id="hub-root"></div>
  </div>
  <script id="hub-payload" type="application/json">${json}</script>
  <script>
    const payload = JSON.parse(document.getElementById("hub-payload").textContent);
    const root = document.getElementById("hub-root");
    const meta = document.getElementById("hub-meta");
    meta.textContent = payload.goal_count + " goal(s) · updated " + new Date(payload.generated_at).toLocaleString();
    if (!payload.goals.length) {
      root.innerHTML = '<div class="empty">No goals found under docs/goals/. Run /goal-prep to create one.</div>';
    } else {
      const rows = payload.goals.map((goal) => \`
        <tr>
          <td><a href="\${goal.url}">\${goal.title}</a><div style="color:#666;font-size:0.85rem">\${goal.slug}</div></td>
          <td><span class="badge \${goal.status}">\${goal.status}</span></td>
          <td>\${goal.active_task || "—"}\${goal.active_task_type ? " · " + goal.active_task_type : ""}</td>
          <td><span class="badge \${goal.oracle_health}">\${goal.oracle_health}</span><div style="font-size:0.85rem;margin-top:4px">\${goal.oracle_signal || "—"}</div></td>
          <td>\${goal.warning_count} warn · \${goal.error_count} err</td>
          <td>\${goal.updated_at ? new Date(goal.updated_at).toLocaleString() : "—"}</td>
        </tr>\`).join("");
      root.innerHTML = '<table><thead><tr><th>Goal</th><th>Status</th><th>Active</th><th>Oracle</th><th>Validation</th><th>Updated</th></tr></thead><tbody>' + rows + '</tbody></table>';
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

function readOracleSignal(statePath) {
  if (!existsSync(statePath)) return null;
  const text = readFileSync(statePath, "utf8");
  const lines = text.split(/\r?\n/);
  let inOracle = false;
  for (const line of lines) {
    if (/^\s{2}oracle:\s*$/.test(line)) {
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
  const match = readFileSync(statePath, "utf8").match(/^\s{4}result:\s*(.+?)\s*$/m);
  return match ? match[1].replace(/^['"]|['"]$/g, "").trim() : null;
}

function findActiveTaskType(statePath, activeTaskId) {
  if (!existsSync(statePath) || !activeTaskId) return null;
  const text = readFileSync(statePath, "utf8");
  const chunk = text.split(new RegExp(`-\\s+id:\\s*${activeTaskId}\\s*$`, "m"))[1];
  if (!chunk) return null;
  const typeMatch = chunk.match(/^\s{4}type:\s*(.+?)\s*$/m);
  return typeMatch ? { type: typeMatch[1].trim() } : null;
}
