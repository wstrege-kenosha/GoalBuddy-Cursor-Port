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
const settingsStorageKey = "goalbuddy.localBoardSettings.v1";
const settingsDefaults = {
  theme: "system",
  density: "comfortable",
  completedVisibility: "show",
  boardOpenBehavior: "last",
  motion: "system",
  lastBoardPath: "",
};
const settingsOptions = {
  theme: new Set(["system", "light", "dark"]),
  density: new Set(["comfortable", "compact"]),
  completedVisibility: new Set(["show", "collapse"]),
  boardOpenBehavior: new Set(["last", "newest"]),
  motion: new Set(["system", "reduce", "allow"]),
};

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
  saveSettings({ ...currentSettings, [control.dataset.setting]: control.value });
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
  return "Start the local board server, then open http://127.0.0.1:41737/<goal-slug>/ (or refresh this page after running: node ~/.cursor/skills/goalbuddy/scripts/goalbuddy.mjs board docs/goals/<slug>).";
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
  try {
    const response = await fetch("../api/settings", { cache: "no-store" });
    if (!response.ok) throw new Error("Settings request failed");
    const payload = await response.json();
    currentSettings = normalizeSettings(payload.settings);
    window.localStorage?.setItem(settingsStorageKey, JSON.stringify(currentSettings));
  } catch {
    currentSettings = readStoredSettings();
  }
  applySettings(currentSettings);
}

async function saveSettings(nextSettings) {
  currentSettings = normalizeSettings(nextSettings);
  window.localStorage?.setItem(settingsStorageKey, JSON.stringify(currentSettings));
  applySettings(currentSettings);
  try {
    const response = await fetch("../api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: currentSettings }),
    });
    if (!response.ok) throw new Error("Settings save failed");
    const payload = await response.json();
    currentSettings = normalizeSettings(payload.settings);
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
  document.documentElement.dataset.theme = normalized.theme;
  document.documentElement.dataset.density = normalized.density;
  document.documentElement.dataset.completedVisibility = normalized.completedVisibility;
  document.documentElement.dataset.boardOpenBehavior = normalized.boardOpenBehavior;
  document.documentElement.dataset.motion = normalized.motion;
  for (const control of settingsPopoverEl.querySelectorAll("[data-setting]")) {
    control.value = normalized[control.dataset.setting] || settingsDefaults[control.dataset.setting];
  }
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
    const response = await fetch("https://api.github.com/repos/wstrege-kenosha/GoalBuddy-Cursor-Port", {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error("GitHub API unavailable");
    const repo = await response.json();
    githubStarsEl.textContent = `${formatStars(repo.stargazers_count)} stars`;
  } catch {
    githubStarsEl.textContent = "wstrege-kenosha/GoalBuddy-Cursor-Port";
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
  document.getElementById("goal-title").textContent = board.goal.title;
  document.title = board.goal.title ? board.goal.title + " - GoalBuddy Board" : "GoalBuddy Board";
  document.getElementById("goal-tranche").textContent = board.goal.tranche || "";
  document.getElementById("goal-status").textContent = board.goal.status;
  document.getElementById("goal-active").textContent = board.goal.activeTask || "None";
  document.getElementById("goal-updated").textContent = new Date(board.generatedAt).toLocaleTimeString();
  renderOracleStrip(board);
  renderSessionStrip(board);

  if (board.error) {
    boardEl.replaceChildren(renderBoardError(board.error));
    return;
  }

  const delay = movingTaskIds.size ? 260 : 0;
  window.setTimeout(() => {
    boardEl.replaceChildren(...board.columns.map(renderColumn));
    animateCardMoves(previousPositions, movingTaskIds);
  }, delay);
}

function renderBoardError(message) {
  const node = el("section", "board-error");
  node.append(
    el("h2", "", "GoalBuddy could not parse this board"),
    el("p", "", message),
  );
  return node;
}

function renderOracleStrip(board) {
  const signalEl = document.getElementById("oracle-signal");
  const finalProofEl = document.getElementById("oracle-final-proof");
  const healthEl = document.getElementById("oracle-health");
  const auditEl = document.getElementById("oracle-audit");
  if (!signalEl || !healthEl) return;

  const signal = board.goal?.oracle?.signal || "";
  const finalProof = board.goal?.oracle?.final_proof || "";
  signalEl.textContent = signal || "No oracle signal recorded.";
  finalProofEl.textContent = finalProof ? `Final proof: ${finalProof}` : "";
  const weak = isWeakOracle(signal) || isWeakOracle(finalProof);
  healthEl.textContent = weak ? "weak oracle" : "oracle ready";
  healthEl.className = `badge ${weak ? "status-blocked" : "status-done"}`;
  const doneWorkers = (board.tasks || []).filter((task) => task.type === "worker" && task.status === "done").length;
  auditEl.textContent = `${doneWorkers} worker receipt(s); final audit maps proof to oracle.`;
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
  const section = el("section", "column");
  section.dataset.columnId = column.id;
  const header = el("header", "column-header");
  const titleWrap = el("div");
  titleWrap.append(el("h2", "", column.title), el("p", "", column.description));
  header.append(titleWrap, el("span", "column-count", String(column.tasks.length)));

  const list = el("div", "card-list");
  if (column.tasks.length === 0) {
    list.append(el("p", "empty", "No cards"));
  } else {
    for (const task of column.tasks) list.append(renderCard(task));
  }

  section.append(header, list);
  return section;
}

function renderCard(task) {
  const button = el("button", `task-card ${task.active ? "is-active" : ""}`);
  button.type = "button";
  button.dataset.taskId = task.id;
  button.dataset.status = task.status;

  const topline = el("div", "card-topline");
  topline.append(el("span", "task-id", task.id), statusBadge(task.status));

  const footer = el("div", "card-footer");
  footer.append(el("span", "badge role", task.assignee || task.type || "PM"));
  if (task.subgoal) footer.append(subgoalBadge(task.subgoal));
  if (task.receipt?.present) footer.append(el("span", "badge status-done", "Receipt"));

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

  modalKickerEl.textContent = `${task.id} · ${task.status}`;
  modalTitleEl.textContent = task.title;
  modalBodyEl.replaceChildren(renderTaskDetail(task));
  modalEl.hidden = false;
}

function closeModal() {
  modalEl.hidden = true;
}

function renderTaskDetail(task) {
  const root = el("div");
  const grid = el("dl", "detail-grid");
  for (const [label, value] of [
    ["Status", task.status],
    ["Assignee", task.assignee || "Unassigned"],
    ["Type", task.type],
    ["Receipt", task.receipt?.summary || "None"],
  ]) {
    const item = el("div", "detail-item");
    item.append(el("dt", "", label), el("dd", "", value));
    grid.append(item);
  }
  root.append(grid);
  if (task.subgoal) root.append(renderSubgoal(task.subgoal));
  root.append(detailText("Objective", task.objective));
  root.append(detailList("Inputs", task.inputs));
  root.append(detailList("Constraints", task.constraints));
  root.append(detailList("Expected Output", task.expectedOutput));
  root.append(detailList("Allowed Files", task.allowedFiles));
  root.append(detailList("Verify", task.verify));
  root.append(detailList("Stop If", task.stopIf));
  if (task.receipt?.decision) root.append(detailText("Decision", task.receipt.decision));
  if (task.receipt?.changedFiles?.length) root.append(detailList("Changed Files", task.receipt.changedFiles));
  if (task.receipt?.commands?.length) {
    const section = el("section", "detail-section");
    section.append(el("h3", "", "Commands"));
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
  if (task.note?.content) {
    const section = el("section", "detail-section");
    section.append(el("h3", "", task.note.title || task.note.path), el("pre", "note", task.note.content));
    root.append(section);
  }
  return root;
}

function renderSubgoal(subgoal) {
  const section = el("section", "detail-section subgoal-section");
  const header = el("div", "subgoal-header");
  const titleWrap = el("div");
  const board = subgoal.board;
  titleWrap.append(
    el("h3", "subgoal-title", board?.goal?.title || "Sub-goal"),
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
    const columnEl = el("section", "subgoal-column");
    const columnHeader = el("header", "subgoal-column-header");
    columnHeader.append(el("h4", "", column.title), el("span", "column-count", String(column.tasks.length)));
    const list = el("div", "subgoal-card-list");
    if (column.tasks.length === 0) {
      list.append(el("p", "empty", "No cards"));
    } else {
      for (const task of column.tasks) list.append(renderSubgoalTask(task));
    }
    columnEl.append(columnHeader, list);
    boardEl.append(columnEl);
  }
  section.append(boardEl);

  if (subgoal.rollupReceipt) {
    section.append(detailText("Roll-up Receipt", subgoal.rollupReceipt));
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
  return el("span", `badge subgoal status-${subgoal.status}`, `Sub-goal ${subgoal.status || "linked"}`);
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
  const title = board.title || board.slug || board.goalDir || "GoalBuddy board";
  return /[/\\]subgoals[/\\]/.test(board.goalDir || "") ? `Child: ${title}` : title;
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

