let currentBoard = null;
let eventSource = null;
let currentSettings = null;

const boardEl = document.getElementById("board");
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
const sessionDrawerEl = document.getElementById("session-drawer");
const sessionDrawerTriggerEl = document.getElementById("session-drawer-trigger");
const sessionDrawerTitleEl = document.getElementById("session-drawer-title");
const sessionDrawerPreviewEl = document.getElementById("session-drawer-preview");
const sessionPinTextEl = document.getElementById("session-pin-text");
const sessionLogEl = document.getElementById("session-log");
const objectiveEyebrowEl = document.getElementById("objective-eyebrow");
const successCriteriaEyebrowEl = document.getElementById("success-criteria-eyebrow");
const sessionEyebrowEl = document.getElementById("session-eyebrow");
const nowEyebrowEl = document.getElementById("now-eyebrow");
const intakeEyebrowEl = document.getElementById("intake-eyebrow");
const validationEyebrowEl = document.getElementById("validation-eyebrow");
const settingsStorageKey = "cursor-curator.localBoardSettings.v1";
const boardCopy = __BOARD_COPY_JSON__;
const settingsDefaults = {
  density: "comfortable",
  completedVisibility: "show",
  boardOpenBehavior: "last",
  motion: "system",
  lastBoardPath: "",
};
const settingsOptions = {
  density: new Set(["comfortable", "compact"]),
  completedVisibility: new Set(["show", "collapse"]),
  boardOpenBehavior: new Set(["last", "newest"]),
  motion: new Set(["system", "reduce", "allow"]),
};

try {
  const bootstrapRaw = window.localStorage?.getItem(settingsStorageKey);
  if (bootstrapRaw) {
    const bootstrap = JSON.parse(bootstrapRaw);
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
  if (event.target.matches("[data-close-session-drawer]")) closeSessionDrawer();
  if (event.target.matches("#session-drawer-trigger")) openSessionDrawer();
  if (settingsPopoverEl.hidden) return;
  if (!event.target.closest(".settings-wrap")) closeSettings();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal();
    closeSessionDrawer();
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
  return "Start the local board server, then open http://127.0.0.1:41737/<goal-slug>/ (or refresh this page after running: bun ~/.cursor/skills/cursor-curator/scripts/curator.mjs board docs/objectives/<slug>).";
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
    window.localStorage?.setItem(settingsStorageKey, JSON.stringify(currentSettings));
  } catch {
    currentSettings = mergeLoadedSettings(stored, {});
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
  currentSettings = local;
  window.localStorage?.setItem(settingsStorageKey, JSON.stringify(currentSettings));
  applySettings(currentSettings);
  try {
    const remote = await syncSettingsToServer(currentSettings);
    currentSettings = mergeLoadedSettings(currentSettings, remote);
    window.localStorage?.setItem(settingsStorageKey, JSON.stringify(currentSettings));
    applySettings(currentSettings);
  } catch {
    // Keep the localStorage fallback active when the local settings API is unavailable.
  }
  return currentSettings;
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
  const normalized = normalizeSettings(settings);
  currentSettings = normalized;
  document.documentElement.dataset.density = normalized.density;
  document.documentElement.dataset.completedVisibility = normalized.completedVisibility;
  document.documentElement.dataset.boardOpenBehavior = normalized.boardOpenBehavior;
  document.documentElement.dataset.motion = normalized.motion;
  applyBoardCopy();
  for (const control of settingsPopoverEl.querySelectorAll("[data-setting]")) {
    control.value = normalized[control.dataset.setting] || settingsDefaults[control.dataset.setting];
  }
  if (currentBoard) renderBoard(currentBoard);
}

function boardLabels() {
  return boardCopy;
}

function applyBoardCopy() {
  const labels = boardLabels();
  if (objectiveEyebrowEl) objectiveEyebrowEl.textContent = labels.objectiveEyebrow;
  if (successCriteriaEyebrowEl) successCriteriaEyebrowEl.textContent = labels.successCriteriaEyebrow;
  if (sessionEyebrowEl) sessionEyebrowEl.textContent = labels.sessionEyebrow;
  if (sessionDrawerTitleEl) sessionDrawerTitleEl.textContent = labels.sessionEyebrow;
  if (sessionDrawerTriggerEl) sessionDrawerTriggerEl.textContent = labels.sessionEyebrow;
  if (nowEyebrowEl) nowEyebrowEl.textContent = labels.nowEyebrow || "Now";
  if (intakeEyebrowEl) intakeEyebrowEl.textContent = labels.intakeEyebrow || "Intake";
  if (validationEyebrowEl) validationEyebrowEl.textContent = labels.validationEyebrow || "Validation";
}

function columnLabels(column) {
  return { title: column.title, description: column.description };
}

function emptyColumnMessage() {
  return boardLabels().emptyColumn;
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
    const response = await fetch(__PORT_REPO_API_URL__, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error("GitHub API unavailable");
    const repo = await response.json();
    githubStarsEl.textContent = `${formatStars(repo.stargazers_count)} stars`;
  } catch {
    githubStarsEl.textContent = __PORT_LABEL__;
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

