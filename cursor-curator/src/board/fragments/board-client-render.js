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
  renderGoalMeta(board);
  renderSuccessCriteriaStrip(board);
  renderValidationBanner(board);
  renderUsageWarning(board);
  renderNowHero(board);
  renderIntakeStrip(board);
  renderProgressRail(board);
  renderSessionDrawer(board);

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

function renderGoalMeta(board) {
  document.getElementById("goal-status").textContent = board.objective.status;
  document.getElementById("goal-active").textContent = board.objective.activeTask || "None";
  document.getElementById("goal-updated").textContent = new Date(board.generatedAt).toLocaleTimeString();

  const agentTimeEl = document.getElementById("goal-agent-time");
  const tokensEl = document.getElementById("goal-tokens");
  const usageView = board.usage;

  if (agentTimeEl) {
    agentTimeEl.textContent = usageView?.visible ? usageView.agent_time : "—";
  }

  if (tokensEl) {
    if (usageView?.visible) {
      tokensEl.textContent = usageView.tokens;
      tokensEl.title = usageView.tokens_title || "";
    } else {
      tokensEl.textContent = "—";
      tokensEl.title = "";
    }
  }
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

function renderUsageWarning(board) {
  const banner = document.getElementById("usage-warning");
  if (!banner) return;
  const message = board.usage?.usage_warning || "";
  if (!message) {
    banner.hidden = true;
    banner.textContent = "";
    return;
  }
  banner.hidden = false;
  banner.textContent = message;
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
  const usage = document.getElementById("progress-usage");
  const verification = document.getElementById("progress-verification");
  const criteria = document.getElementById("progress-criteria");
  if (!counts || !verification || !criteria) return;
  const progress = board.progress || {};
  counts.textContent = `${progress.done || 0}/${progress.total || 0} done · ${progress.active || 0} active · ${progress.blocked || 0} blocked · ${progress.queued || 0} queued`;
  if (usage) {
    usage.textContent = board.usage?.visible ? board.usage.summary : "";
    usage.hidden = !board.usage?.visible;
  }
  const last = board.lastVerification?.result;
  verification.textContent = last ? `Last verification: ${last}` : "Last verification: none";
  criteria.textContent = board.completion?.success_criteria_ready ? "Success criteria ready" : "Success criteria weak";
  criteria.className = board.completion?.success_criteria_ready ? "progress-criteria ready" : "progress-criteria weak";
}

function renderSessionDrawer(board) {
  if (!sessionDrawerTriggerEl || !sessionLogEl) return;
  const hasLog = Boolean(board.sessionLog);
  const hasPreview = Boolean(board.sessionPreview);
  if (!hasLog && !hasPreview) {
    sessionDrawerTriggerEl.hidden = true;
    return;
  }
  sessionDrawerTriggerEl.hidden = false;
  sessionLogEl.textContent = board.sessionLog || "No session entries yet.";
  if (sessionDrawerPreviewEl && sessionPinTextEl) {
    if (hasPreview) {
      sessionDrawerPreviewEl.hidden = false;
      sessionPinTextEl.textContent = board.sessionPreview;
    } else {
      sessionDrawerPreviewEl.hidden = true;
      sessionPinTextEl.textContent = "";
    }
  }
}

function openSessionDrawer() {
  if (!sessionDrawerEl || !sessionDrawerTriggerEl) return;
  sessionDrawerEl.hidden = false;
  sessionDrawerTriggerEl.setAttribute("aria-expanded", "true");
}

function closeSessionDrawer() {
  if (!sessionDrawerEl || !sessionDrawerTriggerEl) return;
  sessionDrawerEl.hidden = true;
  sessionDrawerTriggerEl.setAttribute("aria-expanded", "false");
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
  const button = el("button", `task-card ${task.active ? "is-active" : ""}`);
  button.type = "button";
  button.dataset.taskId = task.id;
  button.dataset.status = task.status;

  const topline = el("div", "card-topline");
  topline.append(el("span", "task-id", task.id), statusBadge(task.status));

  const footer = el("div", "card-footer");
  footer.append(el("span", "badge role", task.assignee || task.type || "PM"));
  if (task.subobjective) footer.append(subobjectiveBadge(task.subobjective));
  if (task.receipt?.present) footer.append(el("span", "badge status-done", "Receipt"));
  if (task.metrics_badge) footer.append(el("span", "badge usage-badge", task.metrics_badge));

  if (task.active) {
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

  const labels = boardLabels();
  modalKickerEl.textContent = `${labels.modalKicker} · ${task.id} · ${task.status}`;
  modalTitleEl.textContent = task.title;
  modalBodyEl.replaceChildren(renderTaskDetail(task));
  modalEl.hidden = false;
}

function closeModal() {
  modalEl.hidden = true;
}

function renderTaskDetail(task) {
  const labels = boardLabels().sections;
  const copy = boardLabels();
  const root = el("div", "detail-layout");

  const meta = el("div", "detail-meta-bar");
  meta.append(
    statusBadge(task.status),
    el("span", "badge role", task.assignee || "Unassigned"),
    el("span", "badge type", task.type),
  );
  root.append(meta);

  if (task.receipt?.summary) {
    const receipt = el("div", "detail-receipt");
    receipt.append(el("span", "detail-receipt-label", "Receipt"), el("p", "", task.receipt.summary));
    root.append(receipt);
  }

  if (task.metrics_detail) {
    const metrics = el("div", "detail-metrics-inline");
    const metricsRows = [
      ["Sessions", task.metrics_detail.sessions],
      ["Agent time", task.metrics_detail.agent_time],
      ...(task.metrics_detail.parent_agent_time ? [["Parent agent time", task.metrics_detail.parent_agent_time]] : []),
      ...(task.metrics_detail.child_agent_time ? [["Child agent time", task.metrics_detail.child_agent_time]] : []),
      ["Input", task.metrics_detail.input],
      ["Output", task.metrics_detail.output],
      ["Models", task.metrics_detail.models],
    ];
    for (const [label, value] of metricsRows) {
      const item = document.createElement("span");
      item.textContent = `${label}: `;
      const strong = document.createElement("strong");
      strong.textContent = value;
      item.append(strong);
      metrics.append(item);
    }
    root.append(metrics);
  }

  if (task.subobjective) root.append(renderSubobjective(task.subobjective));

  const panels = el("div", "detail-panels");
  panels.append(
    detailPanelText(labels.objective, task.objective, { open: true }),
    detailPanelList(labels.inputs, task.inputs),
    detailPanelList(labels.constraints, task.constraints),
    detailPanelList(labels.expectedOutput, task.expectedOutput),
    detailPanelList(labels.allowedFiles, task.allowedFiles),
    detailPanelList(labels.verify, task.verify),
    detailPanelList(labels.stopIf, task.stopIf),
  );
  if (task.receipt?.decision) panels.append(detailPanelText(labels.decision, task.receipt.decision));
  if (task.receipt?.changedFiles?.length) panels.append(detailPanelList(labels.changedFiles, task.receipt.changedFiles));
  root.append(panels);

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

  const transcript = [
    task.receipt?.summary ? `summary: ${task.receipt.summary}` : copy.receiptEmpty,
    task.receipt?.result ? `result: ${task.receipt.result}` : "",
    task.receipt?.decision ? `decision: ${task.receipt.decision}` : "",
  ].filter(Boolean).join("\\n");
  if (transcript) {
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

function renderSubobjective(subobjective) {
  const labels = boardLabels().sections;
  const section = el("section", "detail-section subobjective-section");
  const header = el("div", "subobjective-header");
  const titleWrap = el("div");
  const board = subobjective.board;
  titleWrap.append(
    el("h3", "subobjective-title", board?.objective?.title || "Sub-objective"),
    el("p", "subobjective-meta", [
      subobjective.path,
      subobjective.owner ? `owner: ${subobjective.owner}` : "",
      subobjective.depth ? `depth: ${subobjective.depth}` : "",
    ].filter(Boolean).join(" · ")),
  );
  header.append(titleWrap, subobjectiveBadge(subobjective));
  section.append(header);

  if (board?.usage?.visible && board.usage.summary) {
    section.append(el("p", "subobjective-usage", board.usage.summary));
  }

  if (!board?.columns?.length) {
    section.append(el("p", "", "No child board payload."));
    return section;
  }

  const boardEl = el("div", "subobjective-board");
  for (const column of board.columns) {
    const columnLabelsForSkin = columnLabels(column);
    const columnEl = el("section", "subobjective-column");
    const columnHeader = el("header", "subobjective-column-header");
    columnHeader.append(el("h4", "", columnLabelsForSkin.title), el("span", "column-count", String(column.tasks.length)));
    const list = el("div", "subobjective-card-list");
    if (column.tasks.length === 0) {
      list.append(el("p", "empty", emptyColumnMessage()));
    } else {
      for (const task of column.tasks) list.append(renderSubobjectiveTask(task));
    }
    columnEl.append(columnHeader, list);
    boardEl.append(columnEl);
  }
  section.append(el("p", "eyebrow", labels.subobjective));
  section.append(boardEl);

  if (subobjective.rollupReceipt) {
    section.append(detailPanelText(labels.rollupReceipt, subobjective.rollupReceipt, { wide: true }));
  }

  return section;
}

function renderSubobjectiveTask(task) {
  const card = el("article", `subobjective-task-card ${task.active ? "is-active" : ""}`);
  const topline = el("div", "card-topline");
  topline.append(el("span", "task-id", task.id), statusBadge(task.status));
  const footer = el("div", "card-footer");
  footer.append(el("span", "badge role", task.assignee || task.type || "PM"));
  if (task.receipt?.present) footer.append(el("span", "badge status-done", "Receipt"));
  if (task.metrics_badge) footer.append(el("span", "badge usage-badge", task.metrics_badge));
  card.append(topline, el("h4", "subobjective-task-title", task.title), footer);
  return card;
}

function detailPanel(title, bodyNode, options = {}) {
  const panel = el("details", `detail-panel${options.wide ? " is-wide" : ""}`);
  if (options.open) panel.open = true;
  panel.append(el("summary", "", title));
  const body = el("div", "detail-panel-body");
  body.append(bodyNode);
  panel.append(body);
  return panel;
}

function detailPanelText(title, value, options = {}) {
  return detailPanel(title, el("p", "", value || "None"), options);
}

function detailPanelList(title, values, options = {}) {
  if (!values?.length) return detailPanel(title, el("p", "", "None"), options);
  const list = el("ul");
  for (const value of values) list.append(el("li", "", value));
  return detailPanel(title, list, options);
}

function statusBadge(status) {
  const label = status === "done" ? "Completed" : status === "active" ? "Active" : status === "blocked" ? "Blocked" : "Queued";
  return el("span", `badge status-${status}`, label);
}

function subobjectiveBadge(subobjective) {
  return el("span", `badge subobjective status-${subobjective.status}`, `Sub-objective ${subobjective.status || "linked"}`);
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
  return /[/\\\\]subobjectives[/\\\\]/.test(board.objectiveDir || "") ? `Child: ${title}` : title;
}

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}
