let currentBoard = null;
let eventSource = null;
let currentSettings = null;

const boardEl = document.getElementById("board");
const relayTrailEl = document.getElementById("relay-trail");
const liveStateEl = document.getElementById("live-state");
const liveDotEl = document.getElementById("live-dot");
const boardSwitcherEl = document.getElementById("board-switcher");
const settingsButtonEl = document.getElementById("settings-button");
const settingsPopoverEl = document.getElementById("settings-popover");
const githubStarsEl = document.getElementById("github-stars");
const modalEl = document.getElementById("task-modal");
const modalTitleEl = document.getElementById("modal-title");
const modalKickerEl = document.getElementById("modal-kicker");
const modalBodyEl = document.getElementById("modal-body");
const objectiveEyebrowEl = document.getElementById("objective-eyebrow");
const successCriteriaEyebrowEl = document.getElementById("success-criteria-eyebrow");
const sessionEyebrowEl = document.getElementById("session-eyebrow");
const nowEyebrowEl = document.getElementById("now-eyebrow");
const intakeEyebrowEl = document.getElementById("intake-eyebrow");
const validationEyebrowEl = document.getElementById("validation-eyebrow");
const sessionPinEyebrowEl = document.getElementById("session-pin-eyebrow");
const settingsStorageKey = "cursor-curator.localBoardSettings.v1";
const skinStorageKey = "cursor-curator.boardSkin.v1";
const skinCopy = {"control-room":{"label":"Control Room","objectiveEyebrow":"Objective","successCriteriaEyebrow":"Signal","nowEyebrow":"Now","intakeEyebrow":"Intake","progressEyebrow":"Progress","validationEyebrow":"Validation","misfireWarning":"Likely misfire needs concrete wording","sessionEyebrow":"Session log","modalKicker":"Record","emptyColumn":"Empty","receiptEmpty":"No receipt yet — run Worker and validate before marking done","liveOffline":"Offline — showing last snapshot","sections":{"objective":"Objective","inputs":"Inputs","constraints":"Constraints","expectedOutput":"Expected output","allowedFiles":"Allowed files","verify":"Verify","stopIf":"Stop if","decision":"Decision","changedFiles":"Changed files","commands":"Commands","subgoal":"Subobjective board","rollupReceipt":"Roll-up receipt"}},"field-notes":{"label":"Field Notes","objectiveEyebrow":"Expedition","successCriteriaEyebrow":"North star","nowEyebrow":"Right now","intakeEyebrow":"Brief","progressEyebrow":"Trail progress","validationEyebrow":"Checks","misfireWarning":"Intent drift — clarify before marching on","sessionEyebrow":"Today's log","modalKicker":"Task note","emptyColumn":"Nothing here yet","receiptEmpty":"No receipt filed yet","liveOffline":"Notebook offline — last snapshot shown","sections":{"objective":"Objective","inputs":"Pack list","constraints":"Constraints","expectedOutput":"Expected output","allowedFiles":"Allowed files","verify":"How to know it worked","stopIf":"Stop and ask if","decision":"Decision","changedFiles":"Changed files","commands":"Commands","subgoal":"Sub-objective sketch (read-only)","rollupReceipt":"Roll-up note"}},"proof-ledger":{"label":"Proof Ledger","objectiveEyebrow":"Ledger entry","successCriteriaEyebrow":"Acceptance criteria","nowEyebrow":"Active claim","intakeEyebrow":"Source request","progressEyebrow":"Ledger progress","validationEyebrow":"Validation","misfireWarning":"Weak misfire note — audit before next Worker","sessionEyebrow":"Session record","modalKicker":"Record","emptyColumn":"No claims","receiptEmpty":"No evidence on file","liveOffline":"Ledger offline — last snapshot shown","sections":{"objective":"Claim","inputs":"Inputs","constraints":"Constraints","expectedOutput":"Expected output","allowedFiles":"Allowed files","verify":"Verification steps","stopIf":"Stop if","decision":"Decision","changedFiles":"Changed files","commands":"Commands","subgoal":"Nested ledger","rollupReceipt":"Roll-up receipt"}},"relay-map":{"label":"Relay Map","objectiveEyebrow":"Expedition","successCriteriaEyebrow":"Summit","nowEyebrow":"Current leg","intakeEyebrow":"Trail brief","progressEyebrow":"Distance","validationEyebrow":"Trail checks","misfireWarning":"Route drift — confirm bearing","sessionEyebrow":"Trail log","modalKicker":"Waypoint brief","emptyColumn":"Clear trail","receiptEmpty":"No proof at this waypoint","liveOffline":"Base camp offline — showing last snapshot","sections":{"objective":"What you'll find here","inputs":"Pack list","constraints":"Constraints","expectedOutput":"Expected output","allowedFiles":"Allowed files","verify":"Summit check","stopIf":"Stop if","decision":"Decision","changedFiles":"Changed files","commands":"Commands","subgoal":"Sub-route map","rollupReceipt":"Roll-up proof"}}};
const settingsDefaults = {
  skin: "control-room",
  theme: "system",
  density: "comfortable",
  completedVisibility: "show",
  boardOpenBehavior: "last",
  motion: "system",
  lastBoardPath: "",
};
const settingsOptions = {
  skin: new Set(["control-room","field-notes","proof-ledger","relay-map"]),
  theme: new Set(["system", "light", "dark"]),
  density: new Set(["comfortable", "compact"]),
  completedVisibility: new Set(["show", "collapse"]),
  boardOpenBehavior: new Set(["last", "newest"]),
  motion: new Set(["system", "reduce", "allow"]),
};

try {
  const bootstrapSkin = window.localStorage?.getItem(skinStorageKey);
  if (bootstrapSkin && settingsOptions.skin.has(bootstrapSkin)) {
    document.documentElement.dataset.skin = bootstrapSkin;
  }
  const bootstrapRaw = window.localStorage?.getItem(settingsStorageKey);
  if (bootstrapRaw) {
    const bootstrap = JSON.parse(bootstrapRaw);
    if (!bootstrapSkin && settingsOptions.skin.has(bootstrap.skin)) {
      document.documentElement.dataset.skin = bootstrap.skin;
    }
    if (settingsOptions.theme.has(bootstrap.theme)) document.documentElement.dataset.theme = bootstrap.theme;
    if (settingsOptions.density.has(bootstrap.density)) document.documentElement.dataset.density = bootstrap.density;
    if (settingsOptions.completedVisibility.has(bootstrap.completedVisibility)) {
      document.documentElement.dataset.completedVisibility = bootstrap.completedVisibility;
    }
    if (settingsOptions.motion.has(bootstrap.motion)) document.documentElement.dataset.motion = bootstrap.motion;
  }
} catch {
  // Ignore malformed bootstrap settings and fall back to defaults.
}

document.addEventListener("click", (event) => {
  const card = event.target.closest("[data-task-id]");
  if (card) openTask(card.dataset.taskId);
  if (event.target.matches("[data-close-modal]")) closeModal();
  if (settingsPopoverEl.hidden) return;
  if (!event.target.closest(".settings-wrap")) closeSettings();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal();
    closeSettings();
  }
});

boardSwitcherEl.addEventListener("change", () => {
  if (boardSwitcherEl.value && boardSwitcherEl.value !== window.location.href) {
    window.location.href = boardSwitcherEl.value;
  }
});

settingsButtonEl.addEventListener("click", () => {
  if (settingsPopoverEl.hidden) {
    openSettings();
  } else {
    closeSettings();
  }
});

settingsPopoverEl.addEventListener("change", (event) => {
  const control = event.target.closest("[data-setting]");
  if (!control) return;
  if (control.dataset.setting === "skin") {
    writeStoredSkin(control.value);
  }
  saveSettings({ ...(currentSettings || settingsDefaults), [control.dataset.setting]: control.value });
});

async function loadBoardSnapshot() {
  const embedded = document.getElementById("board-snapshot");
  if (embedded?.textContent) {
    try {
      return JSON.parse(embedded.textContent);
    } catch {
      return null;
    }
  }
  try {
    const response = await fetch("./board-snapshot.json", { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function boardOfflineMessage() {
  return "Start the local board server, then open http://127.0.0.1:41737/<goal-slug>/ (or refresh this page after running: node ~/.cursor/skills/cursor-curator/scripts/curator.mjs board docs/objectives/<slug>).";
}

async function loadBoard() {
  try {
    const response = await fetch("./api/board", { cache: "no-store" });
    if (!response.ok) throw new Error("Board request failed");
    renderBoard(await response.json());
    return true;
  } catch {
    const snapshot = await loadBoardSnapshot();
    if (!snapshot) throw new Error(boardOfflineMessage());
    renderBoard(snapshot);
    return false;
  }
}

async function loadBoardSwitcher() {
  const response = await fetch("../api/boards", { cache: "no-store" });
  if (!response.ok) return;
  const payload = await response.json();
  renderBoardSwitcher(payload.boards || []);
}

async function loadSettings() {
  const stored = readStoredSettings();
  try {
    const response = await fetch("../api/settings", { cache: "no-store" });
    if (!response.ok) throw new Error("Settings request failed");
    const payload = await response.json();
    const rawRemote = payload.settings || {};
    currentSettings = mergeLoadedSettings(stored, rawRemote);
    writeStoredSkin(currentSettings.skin);
    window.localStorage?.setItem(settingsStorageKey, JSON.stringify(currentSettings));
    if (!Object.prototype.hasOwnProperty.call(rawRemote, "skin")) {
      syncSettingsToServer(currentSettings).catch(() => {});
    }
  } catch {
    currentSettings = mergeLoadedSettings(stored, {});
    writeStoredSkin(currentSettings.skin);
  }
  applySettings(currentSettings);
}

async function syncSettingsToServer(settings) {
  const response = await fetch("../api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings: normalizeSettings(settings) }),
  });
  if (!response.ok) throw new Error("Settings sync failed");
  return normalizeSettings((await response.json()).settings);
}

async function saveSettings(nextSettings) {
  const local = normalizeSettings({ ...(currentSettings || settingsDefaults), ...nextSettings });
  writeStoredSkin(local.skin);
  currentSettings = local;
  window.localStorage?.setItem(settingsStorageKey, JSON.stringify(currentSettings));
  applySettings(currentSettings);
  try {
    const remote = await syncSettingsToServer(currentSettings);
    currentSettings = mergeLoadedSettings(currentSettings, remote);
    writeStoredSkin(currentSettings.skin);
    window.localStorage?.setItem(settingsStorageKey, JSON.stringify(currentSettings));
    applySettings(currentSettings);
  } catch {
    // Keep the localStorage fallback active when the local settings API is unavailable.
  }
  return currentSettings;
}

function readStoredSkin(fallback = settingsDefaults.skin) {
  try {
    const dedicated = window.localStorage?.getItem(skinStorageKey);
    if (dedicated && settingsOptions.skin.has(dedicated)) return dedicated;
    const legacy = JSON.parse(window.localStorage?.getItem(settingsStorageKey) || "{}");
    if (legacy.skin && settingsOptions.skin.has(legacy.skin)) {
      window.localStorage?.setItem(skinStorageKey, legacy.skin);
      return legacy.skin;
    }
  } catch {
    // Ignore malformed skin storage.
  }
  return fallback;
}

function writeStoredSkin(skin) {
  if (!settingsOptions.skin.has(skin)) return;
  window.localStorage?.setItem(skinStorageKey, skin);
}

function readStoredSettings() {
  try {
    return normalizeSettings(JSON.parse(window.localStorage?.getItem(settingsStorageKey) || "{}"));
  } catch {
    return { ...settingsDefaults };
  }
}

function mergeLoadedSettings(stored, remote) {
  const normalizedStored = normalizeSettings(stored);
  const normalizedRemote = normalizeSettings(remote);
  return normalizeSettings({
    ...normalizedRemote,
    skin: readStoredSkin(normalizedStored.skin),
    theme: normalizedStored.theme,
    density: normalizedStored.density,
    completedVisibility: normalizedStored.completedVisibility,
    motion: normalizedStored.motion,
    lastBoardPath: normalizedRemote.lastBoardPath || normalizedStored.lastBoardPath,
    boardOpenBehavior: normalizedRemote.boardOpenBehavior || normalizedStored.boardOpenBehavior,
  });
}

function normalizeSettings(settings) {
  const normalized = { ...settingsDefaults };
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return normalized;
  for (const [key, allowed] of Object.entries(settingsOptions)) {
    if (allowed.has(settings[key])) normalized[key] = settings[key];
  }
  if (typeof settings.lastBoardPath === "string" && /^\/[a-z0-9][a-z0-9-]*\/$/.test(settings.lastBoardPath)) {
    normalized.lastBoardPath = settings.lastBoardPath;
  }
  return normalized;
}

function applySettings(settings) {
  const normalized = normalizeSettings({
    ...settings,
    skin: readStoredSkin(normalizeSettings(settings).skin),
  });
  writeStoredSkin(normalized.skin);
  currentSettings = normalized;
  document.documentElement.dataset.skin = normalized.skin;
  document.documentElement.dataset.theme = normalized.theme;
  document.documentElement.dataset.density = normalized.density;
  document.documentElement.dataset.completedVisibility = normalized.completedVisibility;
  document.documentElement.dataset.boardOpenBehavior = normalized.boardOpenBehavior;
  document.documentElement.dataset.motion = normalized.motion;
  applySkinCopy(normalized.skin);
  updateRelayTrailVisibility(normalized.skin);
  for (const control of settingsPopoverEl.querySelectorAll("[data-setting]")) {
    control.value = normalized[control.dataset.setting] || settingsDefaults[control.dataset.setting];
  }
  if (currentBoard) renderBoard(currentBoard);
}

function currentSkin() {
  return normalizeSettings(currentSettings || settingsDefaults).skin;
}

function skinLabels(skin) {
  return skinCopy[skin] || skinCopy["control-room"];
}

function applySkinCopy(skin) {
  const labels = skinLabels(skin);
  if (objectiveEyebrowEl) objectiveEyebrowEl.textContent = labels.objectiveEyebrow;
  if (successCriteriaEyebrowEl) successCriteriaEyebrowEl.textContent = labels.successCriteriaEyebrow;
  if (sessionEyebrowEl) sessionEyebrowEl.textContent = labels.sessionEyebrow;
  if (nowEyebrowEl) nowEyebrowEl.textContent = labels.nowEyebrow || "Now";
  if (intakeEyebrowEl) intakeEyebrowEl.textContent = labels.intakeEyebrow || "Intake";
  if (validationEyebrowEl) validationEyebrowEl.textContent = labels.validationEyebrow || "Validation";
  if (sessionPinEyebrowEl) sessionPinEyebrowEl.textContent = labels.sessionEyebrow;
}

function updateRelayTrailVisibility(skin) {
  if (!relayTrailEl) return;
  relayTrailEl.hidden = skin !== "relay-map";
}

function columnLabels(column) {
  const labels = {
    todo: { title: "Todo", description: "Queued work ready to pull" },
    "in-progress": { title: "In Progress", description: "The active task" },
    blocked: { title: "Blocked", description: "Needs unblock or a smaller slice" },
    completed: { title: "Completed", description: "Receipted work" },
  };
  const skin = currentSkin();
  const skinColumns = {
    "control-room": {
      todo: { title: "Queued", description: "Work ready to pull" },
      "in-progress": { title: "Running", description: "No agent running — pull next task from Queued" },
      blocked: { title: "Blocked", description: "Waiting on you or a dependency" },
      completed: { title: "Shipped", description: "Receipted work" },
    },
    "field-notes": {
      todo: { title: "Backlog", description: "Queued for later" },
      "in-progress": { title: "Today", description: "Where attention goes now" },
      blocked: { title: "Stuck", description: "Needs unblock before continuing" },
      completed: { title: "Logged", description: "Receipted and filed" },
    },
    "proof-ledger": {
      todo: { title: "Unverified claims", description: "Queued work awaiting evidence" },
      "in-progress": { title: "Under review", description: "The active task" },
      blocked: { title: "Disputed", description: "Blocked until resolved" },
      completed: { title: "Verified", description: "Receipt on file" },
    },
    "relay-map": {
      todo: { title: "Queued", description: "Waypoints ahead" },
      "in-progress": { title: "Running", description: "Current waypoint" },
      blocked: { title: "Blocked", description: "Trail closed — resolve block to continue" },
      completed: { title: "Done", description: "Summit checkpoints cleared" },
    },
  };
  return skinColumns[skin]?.[column.id] || labels[column.id] || { title: column.title, description: column.description };
}

function emptyColumnMessage() {
  return skinLabels(currentSkin()).emptyColumn;
}

function receiptGutterSymbol(task) {
  if (task.status === "done") return task.receipt?.present ? "✓" : "✓";
  if (task.status === "blocked") return "✗";
  if (task.receipt?.present) return "✓";
  return "—";
}

function rememberCurrentBoard() {
  const boardPath = normalizePath(window.location.pathname);
  if (!/^\/[a-z0-9][a-z0-9-]*\/$/.test(boardPath)) return;
  const nextSettings = normalizeSettings({ ...currentSettings, lastBoardPath: boardPath });
  currentSettings = nextSettings;
  window.localStorage?.setItem(settingsStorageKey, JSON.stringify(nextSettings));
  fetch("../api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings: nextSettings }),
  }).catch(() => {});
}

function openSettings() {
  settingsPopoverEl.hidden = false;
  settingsButtonEl.setAttribute("aria-expanded", "true");
  settingsPopoverEl.querySelector("[data-setting]")?.focus();
}

function closeSettings() {
  settingsPopoverEl.hidden = true;
  settingsButtonEl.setAttribute("aria-expanded", "false");
}

function formatStars(count) {
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`;
  return String(count);
}

async function loadGithubStars() {
  if (!githubStarsEl) return;
  try {
    const response = await fetch("https://api.github.com/repos/wstrege-kenosha/Cursor-Curator", {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error("GitHub API unavailable");
    const repo = await response.json();
    githubStarsEl.textContent = `${formatStars(repo.stargazers_count)} stars`;
  } catch {
    githubStarsEl.textContent = "wstrege-kenosha/Cursor-Curator";
  }
}

function connectEvents() {
  eventSource = new EventSource("./events");
  eventSource.addEventListener("board", (event) => {
    setLiveState("Live", true);
    renderBoard(JSON.parse(event.data));
  });
  eventSource.addEventListener("error", () => {
    setLiveState("Reconnecting", false);
  });
}

function renderBoard(board) {
  const previousPositions = measureCards();
  const previousColumns = new Map();
  for (const column of currentBoard?.columns || []) {
    for (const task of column.tasks) previousColumns.set(task.id, column.id);
  }
  const movingTaskIds = tasksChangingColumns(board, previousColumns);
  if (movingTaskIds.size) highlightMovingCards(movingTaskIds);
  currentBoard = board;
  document.getElementById("goal-title").textContent = board.objective.title;
  document.title = board.objective.title ? board.objective.title + " - Cursor Curator Board" : "Cursor Curator Board";
  document.getElementById("goal-tranche").textContent = board.objective.tranche || "";
  document.getElementById("goal-status").textContent = board.objective.status;
  document.getElementById("goal-active").textContent = board.objective.activeTask || "None";
  document.getElementById("goal-updated").textContent = new Date(board.generatedAt).toLocaleTimeString();
  renderSuccessCriteriaStrip(board);
  renderValidationBanner(board);
  renderNowHero(board);
  renderIntakeStrip(board);
  renderProgressRail(board);
  renderSessionPin(board);
  renderSessionStrip(board);

  if (board.error) {
    boardEl.replaceChildren(renderBoardError(board.error));
    return;
  }

  const delay = movingTaskIds.size ? 260 : 0;
  window.setTimeout(() => {
    boardEl.replaceChildren(...board.columns.map(renderColumn));
    animateCardMoves(previousPositions, movingTaskIds);
    focusActiveTaskCard(board.objective.activeTask);
  }, delay);
}

function focusActiveTaskCard(taskId) {
  if (!taskId) return;
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    || document.documentElement.dataset.motion === "reduce";
  const card = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "nearest", inline: "nearest" });
  card.classList.add("task-card-focus");
  window.setTimeout(() => card.classList.remove("task-card-focus"), prefersReduced ? 0 : 1200);
}

function renderValidationBanner(board) {
  const banner = document.getElementById("validation-banner");
  const list = document.getElementById("validation-list");
  if (!banner || !list) return;
  const issues = [
    ...(board.validation?.errors || []).map((entry) => ({ level: "error", text: entry })),
    ...(board.validation?.warnings || []).map((entry) => ({ level: "warn", text: entry })),
    ...(board.completion?.blockers || []).filter((entry) => !(board.validation?.errors || []).includes(entry))
      .map((entry) => ({ level: "blocker", text: entry })),
  ];
  if (!issues.length) {
    banner.hidden = true;
    list.replaceChildren();
    return;
  }
  banner.hidden = false;
  banner.dataset.level = issues.some((entry) => entry.level === "error") ? "error" : "warn";
  list.replaceChildren(...issues.slice(0, 6).map((entry) => {
    const item = el("li", `validation-item validation-${entry.level}`, entry.text);
    return item;
  }));
}

function renderNowHero(board) {
  const interpreted = document.getElementById("now-interpreted");
  const activeObjective = document.getElementById("now-active-objective");
  if (!interpreted || !activeObjective) return;
  const intakeOutcome = board.objective?.intake?.interpreted_outcome || "";
  const taskObjective = board.activeTaskDetail?.objective || "";
  interpreted.textContent = intakeOutcome || "No interpreted outcome recorded yet.";
  activeObjective.textContent = taskObjective
    ? `Active ${board.activeTaskDetail.id}: ${taskObjective}`
    : "No active task objective.";
}

function renderIntakeStrip(board) {
  const original = document.getElementById("intake-original");
  const completionProof = document.getElementById("intake-completion-proof");
  const misfire = document.getElementById("intake-misfire");
  if (!original || !completionProof || !misfire) return;
  const intake = board.objective?.intake || {};
  original.textContent = intake.original_request || "—";
  completionProof.textContent = intake.completion_proof || "—";
  misfire.textContent = intake.likely_misfire || "—";
  if (isWeakOracle(intake.likely_misfire)) misfire.classList.add("intake-weak");
  else misfire.classList.remove("intake-weak");
}

function renderProgressRail(board) {
  const counts = document.getElementById("progress-counts");
  const verification = document.getElementById("progress-verification");
  const criteria = document.getElementById("progress-criteria");
  if (!counts || !verification || !criteria) return;
  const progress = board.progress || {};
  counts.textContent = `${progress.done || 0}/${progress.total || 0} done · ${progress.active || 0} active · ${progress.blocked || 0} blocked · ${progress.queued || 0} queued`;
  const last = board.lastVerification?.result;
  verification.textContent = last ? `Last verification: ${last}` : "Last verification: none";
  criteria.textContent = board.completion?.success_criteria_ready ? "Success criteria ready" : "Success criteria weak";
  criteria.className = board.completion?.success_criteria_ready ? "progress-criteria ready" : "progress-criteria weak";
}

function renderSessionPin(board) {
  const pin = document.getElementById("session-pin");
  const text = document.getElementById("session-pin-text");
  if (!pin || !text) return;
  if (!board.sessionPreview) {
    pin.hidden = true;
    return;
  }
  pin.hidden = false;
  text.textContent = board.sessionPreview;
}

function renderBoardError(message) {
  const node = el("section", "board-error");
  node.append(
    el("h2", "", "Cursor Curator could not parse this board"),
    el("p", "", message),
  );
  return node;
}

function renderSuccessCriteriaStrip(board) {
  const signalEl = document.getElementById("success-criteria-signal");
  const finalProofEl = document.getElementById("success-criteria-final-proof");
  const healthEl = document.getElementById("success-criteria-health");
  const auditEl = document.getElementById("success-criteria-audit");
  if (!signalEl || !healthEl) return;

  const signal = board.objective?.success_criteria?.signal || "";
  const finalProof = board.objective?.success_criteria?.final_proof || "";
  signalEl.textContent = signal || "No success criteria signal recorded.";
  finalProofEl.textContent = finalProof ? `Final proof: ${finalProof}` : "";
  const weak = isWeakOracle(signal) || isWeakOracle(finalProof);
  healthEl.textContent = weak ? "weak success criteria" : "success criteria ready";
  healthEl.className = `badge ${weak ? "status-blocked" : "status-done"}`;
  const doneWorkers = (board.tasks || []).filter((task) => task.type === "worker" && task.status === "done").length;
  auditEl.textContent = `${doneWorkers} worker receipt(s); final audit maps proof to success criteria.`;
}

function renderSessionStrip(board) {
  const strip = document.getElementById("session-strip");
  const log = document.getElementById("session-log");
  if (!strip || !log) return;
  if (!board.sessionLog) {
    strip.hidden = true;
    return;
  }
  strip.hidden = false;
  log.textContent = board.sessionLog;
}

function isWeakOracle(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "tbd" || normalized === "unknown" || normalized === "todo" || /^<.*>$/.test(normalized);
}

function renderBoardSwitcher(boards) {
  boardSwitcherEl.closest(".board-switcher").classList.toggle("is-empty", boards.length <= 1);
  const currentPath = normalizePath(window.location.pathname);
  const options = boards.map((board) => {
    const option = document.createElement("option");
    option.value = board.url;
    option.textContent = boardOptionLabel(board);
    const boardPath = normalizePath(new URL(board.url, window.location.href).pathname);
    if (boardPath === currentPath) option.selected = true;
    return option;
  });
  boardSwitcherEl.replaceChildren(...options);
}

function renderColumn(column) {
  const labels = columnLabels(column);
  const section = el("section", "column");
  section.dataset.columnId = column.id;
  const header = el("header", "column-header");
  const titleWrap = el("div");
  titleWrap.append(el("h2", "", labels.title), el("p", "", labels.description));
  header.append(titleWrap, el("span", "column-count", String(column.tasks.length)));

  const list = el("div", "card-list");
  if (column.tasks.length === 0) {
    list.append(el("p", "empty", emptyColumnMessage()));
  } else {
    for (const task of column.tasks) list.append(renderCard(task));
  }

  section.append(header, list);
  return section;
}

function renderCard(task) {
  const skin = currentSkin();
  const button = el("button", `task-card ${task.active ? "is-active" : ""}${skin === "field-notes" && task.status === "blocked" ? " is-stuck" : ""}`);
  button.type = "button";
  button.dataset.taskId = task.id;
  button.dataset.status = task.status;

  if (skin === "proof-ledger") {
    button.append(
      el("span", "task-id-inline", task.id),
      el("h3", "task-title", task.title),
      el("span", `receipt-gutter ${task.status === "blocked" ? "is-disputed" : task.receipt?.present || task.status === "done" ? "" : "is-pending"}`, receiptGutterSymbol(task)),
    );
    return button;
  }

  const topline = el("div", "card-topline");
  topline.append(el("span", "task-id", task.id), statusBadge(task.status));

  const footer = el("div", "card-footer");
  footer.append(el("span", "badge role", task.assignee || task.type || "PM"));
  if (task.subgoal) footer.append(subgoalBadge(task.subgoal));
  if (task.receipt?.present) footer.append(el("span", "badge status-done", "Receipt"));

  if (skin === "control-room" && task.active) {
    button.append(el("span", "scan-line"));
  }

  button.append(topline, el("h3", "task-title", task.title), footer);
  return button;
}

function measureCards() {
  const positions = new Map();
  for (const card of boardEl.querySelectorAll("[data-task-id]")) {
    const rect = card.getBoundingClientRect();
    positions.set(card.dataset.taskId, {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      columnId: card.closest("[data-column-id]")?.dataset.columnId || "",
    });
  }
  return positions;
}

function tasksChangingColumns(board, previousColumns) {
  const moving = new Set();
  for (const column of board.columns) {
    for (const task of column.tasks) {
      const previousColumn = previousColumns.get(task.id);
      if (previousColumn && previousColumn !== column.id) moving.add(task.id);
    }
  }
  return moving;
}

function highlightMovingCards(taskIds) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const card of boardEl.querySelectorAll("[data-task-id]")) {
    if (!taskIds.has(card.dataset.taskId)) continue;
    card.classList.add("is-moving");
    card.animate([
      { transform: "scale(1)", borderColor: "#e2e8f0" },
      { transform: "scale(1.02)", borderColor: "#2563eb" },
      { transform: "scale(1)", borderColor: "#93c5fd" },
    ], {
      duration: 240,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    });
  }
}

function animateCardMoves(previousPositions, movingTaskIds = new Set()) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  for (const card of boardEl.querySelectorAll("[data-task-id]")) {
    const previous = previousPositions.get(card.dataset.taskId);
    const current = card.getBoundingClientRect();
    const columnId = card.closest("[data-column-id]")?.dataset.columnId || "";

    if (!previous) {
      card.animate([
        { opacity: 0, transform: "translateY(10px) scale(0.98)" },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ], {
        duration: 260,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      });
      continue;
    }

    const dx = previous.left - current.left;
    const dy = previous.top - current.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

    const changedColumn = previous.columnId !== columnId;
    const wasSelected = movingTaskIds.has(card.dataset.taskId);
    card.animate([
      {
        transform: `translate(${dx}px, ${dy}px) scale(${changedColumn ? "1.015" : "1"})`,
        opacity: changedColumn ? 0.9 : 1,
        borderColor: wasSelected ? "#2563eb" : "#e2e8f0",
      },
      {
        transform: "translate(0, 0) scale(1)",
        opacity: 1,
        borderColor: "#e2e8f0",
      },
    ], {
      duration: changedColumn ? 980 : 520,
      easing: "cubic-bezier(0.19, 1, 0.22, 1)",
    });
  }
}

function openTask(taskId) {
  const task = currentBoard?.tasks.find((candidate) => candidate.id === taskId);
  if (!task) return;

  const labels = skinLabels(currentSkin());
  modalKickerEl.textContent = `${labels.modalKicker} · ${task.id} · ${task.status}`;
  modalTitleEl.textContent = task.title;
  modalBodyEl.replaceChildren(renderTaskDetail(task));
  modalEl.hidden = false;
}

function closeModal() {
  modalEl.hidden = true;
}

function renderTaskDetail(task) {
  const labels = skinLabels(currentSkin()).sections;
  const skin = currentSkin();
  const root = el("div");
  const grid = el("dl", "detail-grid");
  for (const [label, value] of [
    ["Status", task.status],
    ["Assignee", task.assignee || "Unassigned"],
    ["Type", task.type],
    ["Receipt", task.receipt?.summary || (skin === "control-room" ? skinLabels(currentSkin()).receiptEmpty : "None")],
  ]) {
    const item = el("div", "detail-item");
    item.append(el("dt", "", label), el("dd", "", value));
    grid.append(item);
  }
  root.append(grid);
  if (task.subgoal) root.append(renderSubgoal(task.subgoal));
  root.append(detailText(labels.objective, task.objective));
  root.append(detailList(labels.inputs, task.inputs));
  root.append(detailList(labels.constraints, task.constraints));
  root.append(detailList(labels.expectedOutput, task.expectedOutput));
  root.append(detailList(labels.allowedFiles, task.allowedFiles));
  root.append(detailList(labels.verify, task.verify));
  root.append(detailList(labels.stopIf, task.stopIf));
  if (task.receipt?.decision) root.append(detailText(labels.decision, task.receipt.decision));
  if (task.receipt?.changedFiles?.length) root.append(detailList(labels.changedFiles, task.receipt.changedFiles));
  if (task.receipt?.commands?.length) {
    const section = el("section", "detail-section");
    section.append(el("h3", "", labels.commands));
    const list = el("ul", "command-list");
    for (const command of task.receipt.commands) {
      const item = el("li", "command-item");
      const status = command.status ? el("span", `badge ${command.status === "pass" ? "status-done" : "status-blocked"}`, command.status) : null;
      const label = el("span", "", command.cmd || String(command));
      item.append(status || el("span", "badge", "cmd"), label);
      list.append(item);
    }
    section.append(list);
    root.append(section);
  }
  if (skin === "control-room") {
    const transcript = [
      task.receipt?.summary ? `summary: ${task.receipt.summary}` : skinLabels(currentSkin()).receiptEmpty,
      task.receipt?.result ? `result: ${task.receipt.result}` : "",
      task.receipt?.decision ? `decision: ${task.receipt.decision}` : "",
    ].filter(Boolean).join("\n");
    const section = el("section", "detail-section");
    section.append(el("h3", "", "Evidence"), el("pre", "receipt-transcript", transcript));
    root.append(section);
  }
  if (task.note?.content) {
    const section = el("section", "detail-section");
    section.append(el("h3", "", task.note.title || task.note.path), el("pre", "note", task.note.content));
    root.append(section);
  }
  return root;
}

function renderSubgoal(subgoal) {
  const labels = skinLabels(currentSkin()).sections;
  const section = el("section", "detail-section subgoal-section");
  const header = el("div", "subgoal-header");
  const titleWrap = el("div");
  const board = subgoal.board;
  titleWrap.append(
    el("h3", "subgoal-title", board?.objective?.title || "Sub-objective"),
    el("p", "subgoal-meta", [
      subgoal.path,
      subgoal.owner ? `owner: ${subgoal.owner}` : "",
      subgoal.depth ? `depth: ${subgoal.depth}` : "",
    ].filter(Boolean).join(" · ")),
  );
  header.append(titleWrap, subgoalBadge(subgoal));
  section.append(header);

  if (!board?.columns?.length) {
    section.append(el("p", "", "No child board payload."));
    return section;
  }

  const boardEl = el("div", "subgoal-board");
  for (const column of board.columns) {
    const columnLabelsForSkin = columnLabels(column);
    const columnEl = el("section", "subgoal-column");
    const columnHeader = el("header", "subgoal-column-header");
    columnHeader.append(el("h4", "", columnLabelsForSkin.title), el("span", "column-count", String(column.tasks.length)));
    const list = el("div", "subgoal-card-list");
    if (column.tasks.length === 0) {
      list.append(el("p", "empty", emptyColumnMessage()));
    } else {
      for (const task of column.tasks) list.append(renderSubgoalTask(task));
    }
    columnEl.append(columnHeader, list);
    boardEl.append(columnEl);
  }
  section.append(el("p", "eyebrow", labels.subgoal));
  section.append(boardEl);

  if (subgoal.rollupReceipt) {
    section.append(detailText(labels.rollupReceipt, subgoal.rollupReceipt));
  }

  return section;
}

function renderSubgoalTask(task) {
  const card = el("article", `subgoal-task-card ${task.active ? "is-active" : ""}`);
  const topline = el("div", "card-topline");
  topline.append(el("span", "task-id", task.id), statusBadge(task.status));
  const footer = el("div", "card-footer");
  footer.append(el("span", "badge role", task.assignee || task.type || "PM"));
  if (task.receipt?.present) footer.append(el("span", "badge status-done", "Receipt"));
  card.append(topline, el("h4", "subgoal-task-title", task.title), footer);
  return card;
}

function detailText(title, value) {
  const section = el("section", "detail-section");
  section.append(el("h3", "", title), el("p", "", value || "None"));
  return section;
}

function detailList(title, values) {
  const section = el("section", "detail-section");
  section.append(el("h3", "", title));
  if (!values?.length) {
    section.append(el("p", "", "None"));
    return section;
  }
  const list = el("ul");
  for (const value of values) list.append(el("li", "", value));
  section.append(list);
  return section;
}

function statusBadge(status) {
  const label = status === "done" ? "Completed" : status === "active" ? "Active" : status === "blocked" ? "Blocked" : "Queued";
  return el("span", `badge status-${status}`, label);
}

function subgoalBadge(subgoal) {
  return el("span", `badge subgoal status-${subgoal.status}`, `Sub-objective ${subgoal.status || "linked"}`);
}

function setLiveState(text, live) {
  liveStateEl.textContent = text;
  liveDotEl.classList.toggle("offline", !live);
  settingsButtonEl.setAttribute("aria-label", `Settings. Board status: ${text}`);
  settingsButtonEl.title = `Settings · ${text}`;
}

function normalizePath(pathname) {
  return pathname.endsWith("/") ? pathname : pathname + "/";
}

function boardOptionLabel(board) {
  const title = board.title || board.slug || board.objectiveDir || "Cursor Curator board";
  return /[/\\]subgoals[/\\]/.test(board.objectiveDir || "") ? `Child: ${title}` : title;
}

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}

loadSettings()
  .then(loadBoard)
  .then((live) => {
    if (live) {
      setLiveState("Live", true);
      rememberCurrentBoard();
      loadBoardSwitcher();
      window.setInterval(loadBoardSwitcher, 5000);
      connectEvents();
    } else {
      setLiveState("Snapshot", false);
    }
    loadGithubStars();
  })
  .catch((error) => {
    setLiveState("Offline", false);
    boardEl.replaceChildren(renderBoardError(error.message));
  });

