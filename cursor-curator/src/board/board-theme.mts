// @ts-nocheck
export const DEFAULT_BOARD_SKIN = "control-room";

export const BOARD_SKIN_IDS = [
  "control-room",
  "field-notes",
  "proof-ledger",
  "relay-map",
];

export const BOARD_SKIN_OPTIONS = new Set(BOARD_SKIN_IDS);

const SKIN_COLUMNS = {
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

export const BOARD_SKIN_COPY = {
  "control-room": {
    label: "Control Room",
    objectiveEyebrow: "Objective",
    successCriteriaEyebrow: "Signal",
    nowEyebrow: "Now",
    intakeEyebrow: "Intake",
    progressEyebrow: "Progress",
    validationEyebrow: "Validation",
    misfireWarning: "Likely misfire needs concrete wording",
    sessionEyebrow: "Session log",
    modalKicker: "Record",
    emptyColumn: "Empty",
    receiptEmpty: "No receipt yet — run Worker and validate before marking done",
    liveOffline: "Offline — showing last snapshot",
    sections: {
      objective: "Objective",
      inputs: "Inputs",
      constraints: "Constraints",
      expectedOutput: "Expected output",
      allowedFiles: "Allowed files",
      verify: "Verify",
      stopIf: "Stop if",
      decision: "Decision",
      changedFiles: "Changed files",
      commands: "Commands",
      subobjective: "Subobjective board",
      rollupReceipt: "Roll-up receipt",
    },
  },
  "field-notes": {
    label: "Field Notes",
    objectiveEyebrow: "Expedition",
    successCriteriaEyebrow: "North star",
    nowEyebrow: "Right now",
    intakeEyebrow: "Brief",
    progressEyebrow: "Trail progress",
    validationEyebrow: "Checks",
    misfireWarning: "Intent drift — clarify before marching on",
    sessionEyebrow: "Today's log",
    modalKicker: "Task note",
    emptyColumn: "Nothing here yet",
    receiptEmpty: "No receipt filed yet",
    liveOffline: "Notebook offline — last snapshot shown",
    sections: {
      objective: "Objective",
      inputs: "Pack list",
      constraints: "Constraints",
      expectedOutput: "Expected output",
      allowedFiles: "Allowed files",
      verify: "How to know it worked",
      stopIf: "Stop and ask if",
      decision: "Decision",
      changedFiles: "Changed files",
      commands: "Commands",
      subobjective: "Sub-objective sketch (read-only)",
      rollupReceipt: "Roll-up note",
    },
  },
  "proof-ledger": {
    label: "Proof Ledger",
    objectiveEyebrow: "Ledger entry",
    successCriteriaEyebrow: "Acceptance criteria",
    nowEyebrow: "Active claim",
    intakeEyebrow: "Source request",
    progressEyebrow: "Ledger progress",
    validationEyebrow: "Validation",
    misfireWarning: "Weak misfire note — audit before next Worker",
    sessionEyebrow: "Session record",
    modalKicker: "Record",
    emptyColumn: "No claims",
    receiptEmpty: "No evidence on file",
    liveOffline: "Ledger offline — last snapshot shown",
    sections: {
      objective: "Claim",
      inputs: "Inputs",
      constraints: "Constraints",
      expectedOutput: "Expected output",
      allowedFiles: "Allowed files",
      verify: "Verification steps",
      stopIf: "Stop if",
      decision: "Decision",
      changedFiles: "Changed files",
      commands: "Commands",
      subobjective: "Nested ledger",
      rollupReceipt: "Roll-up receipt",
    },
  },
  "relay-map": {
    label: "Relay Map",
    objectiveEyebrow: "Expedition",
    successCriteriaEyebrow: "Summit",
    nowEyebrow: "Current leg",
    intakeEyebrow: "Trail brief",
    progressEyebrow: "Distance",
    validationEyebrow: "Trail checks",
    misfireWarning: "Route drift — confirm bearing",
    sessionEyebrow: "Trail log",
    modalKicker: "Waypoint brief",
    emptyColumn: "Clear trail",
    receiptEmpty: "No proof at this waypoint",
    liveOffline: "Base camp offline — showing last snapshot",
    sections: {
      objective: "What you'll find here",
      inputs: "Pack list",
      constraints: "Constraints",
      expectedOutput: "Expected output",
      allowedFiles: "Allowed files",
      verify: "Summit check",
      stopIf: "Stop if",
      decision: "Decision",
      changedFiles: "Changed files",
      commands: "Commands",
      subobjective: "Sub-route map",
      rollupReceipt: "Roll-up proof",
    },
  },
};

export function normalizeBoardSkin(skin) {
  return BOARD_SKIN_OPTIONS.has(skin) ? skin : DEFAULT_BOARD_SKIN;
}

export function boardSkinColumnLabels(skin, columnId) {
  const columns = SKIN_COLUMNS[normalizeBoardSkin(skin)];
  return columns[columnId] || { title: columnId, description: "" };
}

export function boardSkinCopy(skin) {
  return BOARD_SKIN_COPY[normalizeBoardSkin(skin)];
}

export function themeFontLinksHtml() {
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Courier+Prime&family=Fraunces:opsz,wght@9..144,600;700&family=IBM+Plex+Mono:wght@450;500&family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;600&family=JetBrains+Mono:wght@450;500&family=Literata:opsz,wght@7..72,600&family=Nunito+Sans:wght@400;600;700&family=Outfit:wght@500;700&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet">`;
}

export function themeTokensCss() {
  return `:root {
  color-scheme: light;
  --font-display: "IBM Plex Sans", "Segoe UI", sans-serif;
  --font-body: "IBM Plex Sans", "Segoe UI", sans-serif;
  --font-mono: "IBM Plex Mono", "Cascadia Code", monospace;
  --canvas: #f4f6f9;
  --canvas-accent: #eef2f7;
  --surface: #ffffff;
  --surface-muted: #f8fafc;
  --surface-elevated: #ffffff;
  --modal-surface: #ffffff;
  --modal-ink: var(--ink);
  --modal-muted: var(--muted);
  --modal-header-bg: var(--surface-muted);
  --modal-header-ink: var(--ink);
  --modal-header-muted: var(--muted);
  --modal-meta-bg: var(--surface-muted);
  --modal-meta-ink: var(--ink-body, var(--ink));
  --modal-border: var(--line);
  --modal-icon-bg: var(--surface);
  --modal-icon-border: var(--line);
  --modal-icon-ink: var(--ink);
  --modal-transcript-bg: var(--canvas-accent);
  --modal-transcript-ink: var(--accent);
  --ink: #0f172a;
  --muted: #64748b;
  --line: #e2e8f0;
  --line-strong: #cbd5e1;
  --accent: #2563eb;
  --accent-soft: #dbeafe;
  --accent-text: #1d4ed8;
  --accent-secondary: #0891b2;
  --accent-secondary-soft: #cffafe;
  --accent-secondary-text: #0e7490;
  --blue-bg: #dbeafe;
  --blue-text: #1d4ed8;
  --green-bg: #dcfce7;
  --green-text: #15803d;
  --red-bg: #fee2e2;
  --red-text: #b91c1c;
  --red-border: #fecaca;
  --yellow-bg: #fef9c3;
  --yellow-text: #a16207;
  --active-surface: #f8fbff;
  --text: var(--ink);
  --ink-body: var(--ink);
  --strip-surface: var(--surface-muted);
  --banner-error-bg: var(--red-bg);
  --banner-error-border: var(--red-border);
  --banner-error-ink: var(--red-text);
  --banner-warn-bg: var(--yellow-bg);
  --banner-warn-border: #fde68a;
  --banner-warn-ink: var(--yellow-text);
  --topbar-bg: rgba(255, 255, 255, 0.94);
  --topbar-border: #e2e8f0;
  --control-bg: #ffffff;
  --control-border: #cbd5e1;
  --control-text: #334155;
  --brand-color: #0f172a;
  --accent-glow: rgba(37, 99, 235, 0.16);
  --live-online: #16a34a;
  --live-offline: #ca8a04;
  --shadow-soft: 0 1px 2px rgba(15, 23, 42, 0.06), 0 8px 24px rgba(15, 23, 42, 0.05);
  --shadow-lift: 0 2px 6px rgba(15, 23, 42, 0.08), 0 12px 32px rgba(15, 23, 42, 0.08);
  --radius-pill: 999px;
  --radius-shell: 12px;
  --radius-panel: 12px;
  --radius-control: 8px;
  --radius-card: 10px;
  --duration-fast: 160ms;
  --duration-reveal: 480ms;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --active-border-gradient: linear-gradient(110deg, #3b82f6, #06b6d4, #2563eb, #0891b2);
  --grid-line: rgba(15, 23, 42, 0.055);
  --trail: var(--accent-secondary);
  --summit: var(--accent);
  --receipt-gutter: var(--muted);
}

:root[data-skin="control-room"] {
  color-scheme: dark;
  --font-display: "JetBrains Mono", "IBM Plex Mono", monospace;
  --font-body: "IBM Plex Sans", "Segoe UI", sans-serif;
  --font-mono: "IBM Plex Mono", "Cascadia Code", monospace;
  --canvas: #141c26;
  --canvas-accent: #101722;
  --surface: #1a2433;
  --surface-muted: #151e2b;
  --surface-elevated: #1e293b;
  --modal-surface: #e8edf2;
  --modal-ink: #141c26;
  --modal-muted: #6b7f94;
  --modal-header-bg: #141c26;
  --modal-header-ink: #e2e8f0;
  --modal-header-muted: #94a3b8;
  --modal-meta-bg: #d4dde6;
  --modal-meta-ink: #141c26;
  --modal-border: #b8c5d4;
  --modal-icon-bg: #1a2433;
  --modal-icon-border: #3d4f66;
  --modal-icon-ink: #c8f7dc;
  --modal-transcript-bg: #0a120d;
  --modal-transcript-ink: #3ddc84;
  --ink: #c8f7dc;
  --ink-body: #e2e8f0;
  --muted: #6b7f94;
  --strip-surface: #151e2b;
  --banner-error-bg: #3f1515;
  --banner-error-border: #7f1d1d;
  --banner-error-ink: #fecaca;
  --banner-warn-bg: #3d2e14;
  --banner-warn-border: #854d0e;
  --banner-warn-ink: #fde68a;
  --line: #2a3647;
  --line-strong: #3d4f66;
  --accent: #3ddc84;
  --accent-soft: #1a3d2e;
  --accent-text: #86efac;
  --accent-secondary: #f0a020;
  --accent-secondary-soft: #3d2e14;
  --accent-secondary-text: #fcd34d;
  --blue-bg: #1e3a5f;
  --blue-text: #93c5fd;
  --green-bg: #14532d;
  --green-text: #86efac;
  --red-bg: #450a0a;
  --red-text: #fca5a5;
  --red-border: #7f1d1d;
  --yellow-bg: #422006;
  --yellow-text: #fde047;
  --active-surface: #1a2e24;
  --topbar-bg: rgba(20, 28, 38, 0.94);
  --topbar-border: #2a3647;
  --control-bg: #1a2433;
  --control-border: #3d4f66;
  --control-text: #c8f7dc;
  --brand-color: #c8f7dc;
  --accent-glow: rgba(61, 220, 132, 0.18);
  --live-online: #3ddc84;
  --live-offline: #f0a020;
  --shadow-soft: 0 1px 2px rgba(0, 0, 0, 0.32), 0 10px 28px rgba(0, 0, 0, 0.24);
  --shadow-lift: 0 2px 8px rgba(0, 0, 0, 0.36), 0 16px 40px rgba(0, 0, 0, 0.28);
  --radius-shell: 8px;
  --radius-panel: 8px;
  --radius-control: 6px;
  --radius-card: 6px;
  --active-border-gradient: linear-gradient(110deg, #3ddc84, #22c55e, #16a34a);
  --grid-line: rgba(107, 127, 148, 0.12);
  --receipt-gutter: #3ddc84;
}

:root[data-skin="control-room"][data-theme="light"] {
  color-scheme: light;
  --canvas: #f4f6f9;
  --canvas-accent: #eef2f7;
  --surface: #ffffff;
  --surface-muted: #f8fafc;
  --surface-elevated: #ffffff;
  --modal-surface: #ffffff;
  --modal-ink: #0f172a;
  --modal-muted: #64748b;
  --modal-header-bg: #0f172a;
  --modal-header-ink: #f8fafc;
  --modal-header-muted: #94a3b8;
  --modal-meta-bg: #f1f5f9;
  --modal-meta-ink: #0f172a;
  --modal-border: #e2e8f0;
  --modal-icon-bg: #ffffff;
  --modal-icon-border: #cbd5e1;
  --modal-icon-ink: #0f172a;
  --modal-transcript-bg: #0f172a;
  --modal-transcript-ink: #86efac;
  --ink: #0f172a;
  --ink-body: #0f172a;
  --muted: #64748b;
  --line: #e2e8f0;
  --line-strong: #cbd5e1;
  --strip-surface: #f8fafc;
  --banner-error-bg: #fef2f2;
  --banner-error-border: #fecaca;
  --banner-error-ink: #b91c1c;
  --banner-warn-bg: #fffbeb;
  --banner-warn-border: #fde68a;
  --banner-warn-ink: #92400e;
  --accent: #2563eb;
  --accent-soft: #dbeafe;
  --accent-text: #1d4ed8;
  --control-bg: #ffffff;
  --control-border: #cbd5e1;
  --control-text: #334155;
  --brand-color: #0f172a;
  --topbar-bg: rgba(255, 255, 255, 0.94);
  --topbar-border: #e2e8f0;
}

:root[data-skin="field-notes"] {
  --font-display: "Fraunces", "Georgia", serif;
  --font-body: "Source Sans 3", "Segoe UI", sans-serif;
  --font-mono: "Courier Prime", "Courier New", monospace;
  --canvas: #faf6ef;
  --canvas-accent: #f5f0e6;
  --surface: #fffdf8;
  --surface-muted: #faf6ef;
  --surface-elevated: #fffdf8;
  --modal-surface: #fffdf8;
  --modal-ink: var(--ink);
  --modal-muted: var(--muted);
  --modal-header-bg: #2c2416;
  --modal-header-ink: #fffdf8;
  --modal-header-muted: #c9bfb0;
  --modal-meta-bg: #f5f0e6;
  --modal-meta-ink: var(--ink);
  --modal-border: var(--line);
  --modal-icon-bg: var(--surface);
  --modal-icon-border: var(--line);
  --modal-icon-ink: var(--ink);
  --ink: #2c2416;
  --muted: #6b5f4f;
  --line: #c9bfb0;
  --line-strong: #a89888;
  --accent: #8b3a2a;
  --accent-soft: #f3e0dc;
  --accent-text: #8b3a2a;
  --accent-secondary: #c45c3e;
  --accent-secondary-soft: #fce8e4;
  --accent-secondary-text: #9a3412;
  --blue-bg: #e8eef5;
  --blue-text: #1e3a5f;
  --green-bg: #e4f0e4;
  --green-text: #2d5016;
  --red-bg: #fce8e4;
  --red-text: #9a3412;
  --red-border: #f5c4b8;
  --yellow-bg: #fff3b0;
  --yellow-text: #7c5e10;
  --active-surface: #fff3b0;
  --topbar-bg: rgba(255, 253, 248, 0.96);
  --topbar-border: #c9bfb0;
  --control-bg: #fffdf8;
  --control-border: #c9bfb0;
  --control-text: #2c2416;
  --brand-color: #2c2416;
  --accent-glow: rgba(139, 58, 42, 0.12);
  --grid-line: rgba(44, 36, 22, 0.06);
  --radius-shell: 4px;
  --radius-panel: 4px;
  --radius-card: 4px;
  --active-border-gradient: linear-gradient(110deg, #8b3a2a, #c45c3e);
  --receipt-gutter: #2d5016;
}

:root[data-skin="proof-ledger"] {
  --font-display: "Literata", "Georgia", serif;
  --font-body: "Inter", "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", "Cascadia Code", monospace;
  --canvas: #f4f2ee;
  --canvas-accent: #eceae4;
  --surface: #faf9f6;
  --surface-muted: #f4f2ee;
  --surface-elevated: #faf9f6;
  --modal-surface: #faf9f6;
  --modal-ink: var(--ink);
  --modal-muted: var(--muted);
  --modal-header-bg: #1a1a1a;
  --modal-header-ink: #faf9f6;
  --modal-header-muted: #757575;
  --modal-meta-bg: #f4f2ee;
  --modal-meta-ink: var(--ink);
  --modal-border: var(--line);
  --modal-icon-bg: var(--surface);
  --modal-icon-border: var(--line);
  --modal-icon-ink: var(--ink);
  --ink: #1a1a1a;
  --muted: #757575;
  --line: #1a1a1a;
  --line-strong: #1a1a1a;
  --accent: #003d7a;
  --accent-soft: #dbeafe;
  --accent-text: #003d7a;
  --accent-secondary: #1b5e20;
  --accent-secondary-soft: #dcfce7;
  --accent-secondary-text: #1b5e20;
  --blue-bg: #dbeafe;
  --blue-text: #003d7a;
  --green-bg: #dcfce7;
  --green-text: #1b5e20;
  --red-bg: #fee2e2;
  --red-text: #b71c1c;
  --red-border: #fecaca;
  --yellow-bg: #fef9c3;
  --yellow-text: #854d0e;
  --active-surface: #eef4fb;
  --topbar-bg: rgba(250, 249, 246, 0.96);
  --topbar-border: #1a1a1a;
  --control-bg: #faf9f6;
  --control-border: #1a1a1a;
  --control-text: #1a1a1a;
  --brand-color: #1a1a1a;
  --accent-glow: rgba(0, 61, 122, 0.1);
  --grid-line: transparent;
  --radius-shell: 0;
  --radius-panel: 0;
  --radius-control: 0;
  --radius-card: 0;
  --shadow-soft: none;
  --shadow-lift: none;
  --active-border-gradient: linear-gradient(180deg, #003d7a, #003d7a);
  --receipt-gutter: #1b5e20;
}

:root[data-skin="relay-map"] {
  color-scheme: dark;
  --font-display: "Outfit", "Segoe UI", sans-serif;
  --font-body: "Nunito Sans", "Segoe UI", sans-serif;
  --font-mono: "Outfit", "Segoe UI", sans-serif;
  --canvas: #0f1a2e;
  --canvas-accent: #0a1220;
  --surface: #162236;
  --surface-muted: #121c30;
  --surface-elevated: #1a2740;
  --modal-surface: #f0ebe3;
  --modal-ink: #0f1a2e;
  --modal-muted: #64748b;
  --modal-header-bg: #0f1a2e;
  --modal-header-ink: #f0ebe3;
  --modal-header-muted: #94a3b8;
  --modal-meta-bg: #e5dfd4;
  --modal-meta-ink: #0f1a2e;
  --modal-border: #c9bfb0;
  --modal-icon-bg: #162236;
  --modal-icon-border: #3d5270;
  --modal-icon-ink: #f0ebe3;
  --modal-transcript-bg: #0f1a2e;
  --modal-transcript-ink: #06d6a0;
  --ink: #f0ebe3;
  --ink-body: #dbe4ef;
  --muted: #94a3b8;
  --strip-surface: #121c30;
  --banner-error-bg: #3d1a1a;
  --banner-error-border: #5c2020;
  --banner-error-ink: #fecaca;
  --banner-warn-bg: #3d3014;
  --banner-warn-border: #854d0e;
  --banner-warn-ink: #fde68a;
  --line: #2a3a52;
  --line-strong: #3d5270;
  --accent: #ff6b35;
  --accent-soft: #3d2218;
  --accent-text: #ffb899;
  --accent-secondary: #7eb8da;
  --accent-secondary-soft: #1a3040;
  --accent-secondary-text: #a5d8f3;
  --blue-bg: #1a3040;
  --blue-text: #7eb8da;
  --green-bg: #0f3d32;
  --green-text: #06d6a0;
  --red-bg: #3d1a1a;
  --red-text: #fca5a5;
  --red-border: #5c2020;
  --yellow-bg: #3d3014;
  --yellow-text: #fde047;
  --active-surface: #1f2a18;
  --topbar-bg: rgba(15, 26, 46, 0.94);
  --topbar-border: #2a3a52;
  --control-bg: #162236;
  --control-border: #3d5270;
  --control-text: #f0ebe3;
  --brand-color: #f0ebe3;
  --accent-glow: rgba(255, 107, 53, 0.2);
  --live-online: #06d6a0;
  --live-offline: #facc15;
  --shadow-soft: 0 1px 2px rgba(0, 0, 0, 0.28), 0 10px 28px rgba(0, 0, 0, 0.22);
  --shadow-lift: 0 2px 8px rgba(0, 0, 0, 0.32), 0 16px 40px rgba(0, 0, 0, 0.28);
  --radius-shell: 10px;
  --radius-panel: 10px;
  --radius-card: 8px;
  --active-border-gradient: linear-gradient(110deg, #ff6b35, #ff8c42, #ff6b35);
  --grid-line: rgba(126, 184, 218, 0.06);
  --trail: #7eb8da;
  --summit: #ff6b35;
  --receipt-gutter: #06d6a0;
}

:root[data-skin="relay-map"][data-theme="light"] {
  color-scheme: light;
  --canvas: #f4f6f9;
  --canvas-accent: #eef2f7;
  --surface: #ffffff;
  --surface-muted: #f8fafc;
  --surface-elevated: #ffffff;
  --modal-surface: #ffffff;
  --modal-ink: #0f172a;
  --modal-muted: #64748b;
  --modal-header-bg: #0f172a;
  --modal-header-ink: #f8fafc;
  --modal-header-muted: #94a3b8;
  --modal-meta-bg: #f1f5f9;
  --modal-meta-ink: #0f172a;
  --modal-border: #e2e8f0;
  --modal-icon-bg: #ffffff;
  --modal-icon-border: #cbd5e1;
  --modal-icon-ink: #0f172a;
  --ink: #0f172a;
  --ink-body: #0f172a;
  --muted: #64748b;
  --line: #e2e8f0;
  --line-strong: #cbd5e1;
  --strip-surface: #f8fafc;
  --banner-error-bg: #fef2f2;
  --banner-error-border: #fecaca;
  --banner-error-ink: #b91c1c;
  --banner-warn-bg: #fffbeb;
  --banner-warn-border: #fde68a;
  --banner-warn-ink: #92400e;
  --accent: #ea580c;
  --accent-soft: #ffedd5;
  --accent-text: #c2410c;
  --control-bg: #ffffff;
  --control-border: #cbd5e1;
  --control-text: #334155;
  --brand-color: #0f172a;
  --topbar-bg: rgba(255, 255, 255, 0.94);
  --topbar-border: #e2e8f0;
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --canvas: #0b1017;
  --canvas-accent: #0f1520;
  --surface: #151c27;
  --surface-muted: #111820;
  --surface-elevated: #171f2b;
  --modal-surface: #171f2b;
  --modal-ink: #e8eef7;
  --modal-muted: #94a3b8;
  --modal-header-bg: #0b1017;
  --modal-header-ink: #e8eef7;
  --modal-header-muted: #94a3b8;
  --modal-meta-bg: #111820;
  --modal-meta-ink: #e8eef7;
  --modal-border: #243041;
  --modal-icon-bg: #151c27;
  --modal-icon-border: #334155;
  --modal-icon-ink: #e8eef7;
  --modal-transcript-bg: #0b1017;
  --modal-transcript-ink: #86efac;
  --ink: #e8eef7;
  --muted: #94a3b8;
  --line: #243041;
  --line-strong: #334155;
  --accent: #60a5fa;
  --accent-soft: #1e3a5f;
  --accent-text: #bfdbfe;
  --accent-secondary: #22d3ee;
  --accent-secondary-soft: #164e63;
  --accent-secondary-text: #a5f3fc;
  --blue-bg: #1e3a5f;
  --blue-text: #93c5fd;
  --green-bg: #14532d;
  --green-text: #86efac;
  --red-bg: #450a0a;
  --red-text: #fca5a5;
  --red-border: #7f1d1d;
  --yellow-bg: #422006;
  --yellow-text: #fde047;
  --active-surface: #101c2e;
  --topbar-bg: rgba(17, 24, 39, 0.92);
  --topbar-border: #243041;
  --control-bg: #151c27;
  --control-border: #334155;
  --control-text: var(--ink);
  --brand-color: var(--ink);
  --accent-glow: rgba(96, 165, 250, 0.2);
  --live-online: #4ade80;
  --live-offline: #facc15;
  --shadow-soft: 0 1px 2px rgba(0, 0, 0, 0.28), 0 10px 28px rgba(0, 0, 0, 0.22);
  --shadow-lift: 0 2px 8px rgba(0, 0, 0, 0.32), 0 16px 40px rgba(0, 0, 0, 0.28);
  --grid-line: rgba(148, 163, 184, 0.08);
}

:root[data-skin="field-notes"][data-theme="dark"],
:root[data-skin="proof-ledger"][data-theme="dark"] {
  --canvas: #1a1814;
  --canvas-accent: #141210;
  --surface: #221f1a;
  --surface-muted: #1a1814;
  --surface-elevated: #2a2620;
  --modal-surface: #2a2620;
  --modal-ink: #f0ebe3;
  --modal-muted: #a89888;
  --modal-header-bg: #141210;
  --modal-header-ink: #f0ebe3;
  --modal-header-muted: #a89888;
  --modal-meta-bg: #221f1a;
  --modal-meta-ink: #f0ebe3;
  --modal-border: #4a4238;
  --modal-icon-bg: #221f1a;
  --modal-icon-border: #4a4238;
  --modal-icon-ink: #f0ebe3;
  --ink: #f0ebe3;
  --muted: #a89888;
  --line: #4a4238;
  --line-strong: #5c5348;
  --control-bg: #221f1a;
  --control-border: #4a4238;
  --control-text: #f0ebe3;
  --topbar-bg: rgba(34, 31, 26, 0.96);
  --topbar-border: #4a4238;
}

@media (prefers-color-scheme: dark) {
  :root[data-theme="system"]:not([data-skin="control-room"]):not([data-skin="relay-map"]) {
    color-scheme: dark;
    --canvas: #0b1017;
    --canvas-accent: #0f1520;
    --surface: #151c27;
    --surface-muted: #111820;
    --surface-elevated: #171f2b;
    --ink: #e8eef7;
    --muted: #94a3b8;
    --line: #243041;
    --line-strong: #334155;
    --accent: #60a5fa;
    --accent-soft: #1e3a5f;
    --accent-text: #bfdbfe;
    --topbar-bg: rgba(17, 24, 39, 0.92);
    --topbar-border: #243041;
    --control-bg: #151c27;
    --control-border: #334155;
    --control-text: var(--ink);
    --brand-color: var(--ink);
    --grid-line: rgba(148, 163, 184, 0.08);
  }
}`;
}

export function themeSurfaceCss() {
  return `@keyframes page-rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes hub-reveal {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes active-card-orbit {
  to { transform: rotate(360deg); }
}

@keyframes caret-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

@keyframes scan-line {
  from { transform: translateY(-100%); opacity: 0.7; }
  to { transform: translateY(calc(100% + 100%)); opacity: 0; }
}

@keyframes relay-trail-draw {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

* { box-sizing: border-box; }

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(ellipse 90% 55% at 50% -8%, color-mix(in srgb, var(--accent) 7%, transparent), transparent 58%),
    linear-gradient(180deg, var(--canvas-accent), var(--canvas));
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

body::before {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  content: "";
  opacity: 0.45;
  background-image: radial-gradient(circle, var(--grid-line) 1px, transparent 1px);
  background-size: 22px 22px;
  mask-image: linear-gradient(180deg, black, transparent 92%);
}

:root[data-skin="proof-ledger"] body::before,
:root[data-skin="relay-map"] body::before {
  opacity: 0;
}

body.theme-board .shell > * {
  animation: page-rise var(--duration-reveal) var(--ease-out) both;
}

body.theme-board .shell > *:nth-child(1) { animation-delay: 40ms; }
body.theme-board .shell > *:nth-child(2) { animation-delay: 80ms; }
body.theme-board .shell > *:nth-child(3) { animation-delay: 120ms; }
body.theme-board .shell > *:nth-child(4) { animation-delay: 160ms; }
body.theme-board .shell > *:nth-child(5) { animation-delay: 200ms; }

body.theme-hub .hub-hero,
body.theme-hub .hub-provenance,
body.theme-hub .hub-grid,
body.theme-hub .hub-empty {
  animation: page-rise var(--duration-reveal) var(--ease-out) both;
}

body.theme-hub .hub-provenance { animation-delay: 60ms; }
body.theme-hub .hub-grid,
body.theme-hub .hub-empty { animation-delay: 100ms; }

h1,
h2,
h3,
h4 {
  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: -0.02em;
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  body.theme-board .shell > *,
  body.theme-hub .hub-hero,
  body.theme-hub .hub-provenance,
  body.theme-hub .hub-grid,
  body.theme-hub .hub-empty,
  .hub-card {
    animation: none !important;
  }
}`;
}

export function boardSkinCss() {
  return `:root[data-skin="control-room"] h1 {
  font-size: clamp(1.35rem, 2.4vw, 1.85rem);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

:root[data-skin="control-room"] .success-criteria-strip {
  padding: 18px 20px;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-panel);
  background: var(--surface-muted);
  margin-top: 8px;
}

:root[data-skin="control-room"] .task-card.is-active {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent), 0 12px 32px var(--accent-glow);
}

:root[data-skin="control-room"] .task-card.is-active::before,
:root[data-skin="control-room"] .task-card.is-active::after {
  display: none;
}

:root[data-skin="control-room"] .task-card.is-active .task-id::before {
  content: "▌";
  margin-right: 2px;
  color: var(--accent);
  animation: caret-blink 1s step-end infinite;
}

:root[data-skin="control-room"] .task-card.is-active .scan-line {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

:root[data-skin="control-room"] .task-card.is-active .scan-line::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  animation: scan-line 1.2s var(--ease-out) 1 both;
}

:root[data-skin="control-room"] .receipt-transcript {
  margin: 0;
  padding: 12px 14px;
  border-radius: 6px;
  background: var(--modal-transcript-bg);
  color: var(--modal-transcript-ink);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
}

:root[data-skin="field-notes"] .goal-header {
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 20px;
  border-bottom: none;
  padding-bottom: 12px;
}

:root[data-skin="field-notes"] .goal-header::before {
  content: "";
  grid-row: 1 / span 3;
  width: 3px;
  border-radius: 2px;
  background: var(--accent);
}

:root[data-skin="field-notes"] .goal-header > div:first-of-type {
  grid-column: 2;
}

:root[data-skin="field-notes"] .goal-meta {
  grid-column: 3;
  grid-row: 1 / span 3;
  align-self: start;
  border: none;
  border-radius: 0;
  background: transparent;
  gap: 10px;
}

:root[data-skin="field-notes"] .goal-meta div {
  padding: 0;
  background: transparent;
}

:root[data-skin="field-notes"] .goal-tranche {
  grid-column: 2;
  padding-bottom: 12px;
  border-bottom: 1px dashed var(--line);
}

:root[data-skin="field-notes"] .success-criteria-signal {
  font-family: var(--font-display);
  font-size: 1.15rem;
  line-height: 1.35;
}

:root[data-skin="field-notes"] .success-criteria-meta {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 3px;
}

:root[data-skin="field-notes"] .task-card.is-stuck::after {
  content: "STUCK";
  position: absolute;
  top: 10px;
  right: 8px;
  z-index: 2;
  padding: 4px 10px;
  border: 2px solid var(--accent-secondary);
  border-radius: 4px;
  color: var(--accent-secondary);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  transform: rotate(-8deg);
  opacity: 0.82;
  pointer-events: none;
}

:root[data-skin="field-notes"] .task-card.is-active {
  background: var(--active-surface);
  border-color: var(--line-strong);
  box-shadow: none;
}

:root[data-skin="field-notes"] .task-card.is-active::before,
:root[data-skin="field-notes"] .task-card.is-active::after {
  display: none;
}

:root[data-skin="field-notes"] .modal-panel {
  border-top: 4px dashed var(--line);
  box-shadow: var(--shadow-lift);
}

:root[data-skin="field-notes"] .subobjective-section {
  border-style: dashed;
}

:root[data-skin="proof-ledger"] .topbar,
:root[data-skin="proof-ledger"] .column,
:root[data-skin="proof-ledger"] .task-card,
:root[data-skin="proof-ledger"] .goal-meta,
:root[data-skin="proof-ledger"] .modal-panel,
:root[data-skin="proof-ledger"] .detail-grid,
:root[data-skin="proof-ledger"] .subobjective-section {
  box-shadow: none;
}

:root[data-skin="proof-ledger"] .column-header {
  border-bottom-width: 2px;
}

:root[data-skin="proof-ledger"] .column[data-column-id="todo"] .column-header {
  border-bottom-color: var(--muted);
}

:root[data-skin="proof-ledger"] .column[data-column-id="in-progress"] .column-header {
  border-bottom-color: var(--accent);
}

:root[data-skin="proof-ledger"] .column[data-column-id="blocked"] .column-header {
  border-bottom-color: var(--red-text);
}

:root[data-skin="proof-ledger"] .column[data-column-id="completed"] .column-header {
  border-bottom-color: var(--accent-secondary);
}

:root[data-skin="proof-ledger"] .task-card {
  min-height: 72px;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
}

:root[data-skin="proof-ledger"] .task-card .task-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 13px;
}

:root[data-skin="proof-ledger"] .task-card .card-topline,
:root[data-skin="proof-ledger"] .task-card .card-footer {
  display: none;
}

:root[data-skin="proof-ledger"] .task-card.is-active {
  border-left: 4px solid var(--accent);
  background: var(--active-surface);
}

:root[data-skin="proof-ledger"] .task-card.is-active::before,
:root[data-skin="proof-ledger"] .task-card.is-active::after {
  display: none;
}

:root[data-skin="proof-ledger"] .receipt-gutter {
  flex: 0 0 auto;
  min-width: 28px;
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 600;
  line-height: 1;
  text-align: center;
  color: var(--receipt-gutter);
}

:root[data-skin="proof-ledger"] .receipt-gutter.is-disputed {
  color: var(--red-text);
}

:root[data-skin="proof-ledger"] .receipt-gutter.is-pending {
  color: var(--muted);
}

:root[data-skin="proof-ledger"] .task-id-inline {
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--muted);
}

:root[data-skin="proof-ledger"] .success-criteria-strip {
  border: 1px solid var(--line);
  padding: 14px 16px;
  background: var(--surface);
}

:root[data-skin="proof-ledger"] .success-criteria-signal::before {
  content: "signal: ";
  font-family: var(--font-mono);
  color: var(--muted);
}

:root[data-skin="proof-ledger"] .success-criteria-meta::before {
  content: "proof: ";
  font-family: var(--font-mono);
}

:root[data-skin="relay-map"] .board-frame {
  position: relative;
  padding-top: 8px;
}

:root[data-skin="relay-map"] .relay-trail {
  display: block;
  height: 2px;
  margin: 0 8px 18px;
  border-radius: var(--radius-pill);
  background: linear-gradient(90deg, var(--trail), color-mix(in srgb, var(--trail) 40%, transparent));
  transform-origin: left center;
  animation: relay-trail-draw 900ms var(--ease-out) both;
}

:root[data-skin="relay-map"] .column-header h2::before {
  content: "● ";
  color: var(--trail);
  font-size: 0.85em;
}

:root[data-skin="relay-map"] .column[data-column-id="in-progress"] .column-header h2::before {
  content: "◆ ";
  color: var(--summit);
}

:root[data-skin="relay-map"] .column[data-column-id="blocked"] .column-header h2::before {
  content: "◌ ";
  color: var(--fog, var(--muted));
}

:root[data-skin="relay-map"] .column[data-column-id="completed"] .column-header h2::before {
  content: "✓ ";
  color: var(--live-online);
}

:root[data-skin="relay-map"] .column[data-column-id="blocked"] {
  border-style: dashed;
}

:root[data-skin="relay-map"] .task-card.is-active {
  border-color: var(--summit);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--summit) 35%, transparent);
}

:root[data-skin="relay-map"] .task-card.is-active::before,
:root[data-skin="relay-map"] .task-card.is-active::after {
  display: none;
}

:root[data-skin="relay-map"] .modal-panel {
  border-top: 4px solid var(--summit);
}

:root[data-skin="relay-map"] .goal-tranche::before {
  content: "Route note: ";
  color: var(--muted);
  font-weight: 600;
}

:root[data-motion="reduce"] .task-card.is-active .task-id::before,
:root[data-motion="reduce"] .relay-trail,
:root[data-motion="reduce"] .task-card.is-active .scan-line::after {
  animation: none !important;
}

@media (prefers-reduced-motion: reduce) {
  :root[data-skin="control-room"] .task-card.is-active .task-id::before,
  :root[data-skin="relay-map"] .relay-trail,
  :root[data-skin="control-room"] .task-card.is-active .scan-line::after {
    animation: none !important;
  }
}`;
}

export function hubPageCss() {
  return `.hub-wrap {
  width: min(1180px, calc(100% - 48px));
  margin: 0 auto;
  padding: 28px 0 40px;
}

.hub-hero {
  margin-bottom: 20px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--line);
}

.hub-hero .eyebrow {
  margin: 0 0 6px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.hub-hero h1 {
  margin: 0 0 8px;
  font-size: clamp(1.5rem, 2.5vw, 2rem);
  line-height: 1.15;
  font-weight: 600;
}

.hub-hero .meta {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
}

.hub-provenance {
  margin: 0 0 18px;
  color: var(--muted);
  font-size: 0.84rem;
  line-height: 1.5;
}

.hub-provenance a {
  color: var(--control-text);
  font-weight: 600;
  text-decoration: none;
}

.hub-provenance a:hover {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.hub-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}

.hub-card {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-panel);
  background: var(--surface);
  box-shadow: var(--shadow-soft);
  transition: border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out);
  animation: hub-reveal var(--duration-reveal) var(--ease-out) both;
  animation-delay: calc(var(--i, 0) * 45ms);
}

.hub-card:hover {
  border-color: var(--line-strong);
  box-shadow: var(--shadow-lift);
}

.hub-card-head {
  display: grid;
  gap: 4px;
}

.hub-card-head a {
  color: var(--ink);
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.3;
  text-decoration: none;
}

.hub-card-head a:hover {
  color: var(--accent);
}

.hub-slug {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.74rem;
}

.hub-card-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.hub-card dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
  margin: 0;
  padding-top: 4px;
  border-top: 1px solid var(--line);
}

.hub-card dt {
  margin: 0 0 2px;
  color: var(--muted);
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hub-card dd {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.35;
}

.hub-success-criteria {
  color: var(--muted);
  font-size: 0.8rem;
}

.hub-empty {
  padding: 40px 20px;
  border: 1px dashed var(--line);
  border-radius: var(--radius-panel);
  background: var(--surface);
  color: var(--muted);
  text-align: center;
}

.badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.badge.active { background: var(--blue-bg); color: var(--blue-text); }
.badge.blocked { background: var(--red-bg); color: var(--red-text); }
.badge.done { background: var(--green-bg); color: var(--green-text); }
.badge.weak { background: var(--yellow-bg); color: var(--yellow-text); }
.badge.strong { background: var(--green-bg); color: var(--green-text); }

@media (max-width: 640px) {
  .hub-wrap { width: min(100%, calc(100% - 28px)); padding-top: 20px; }
  .hub-card dl { grid-template-columns: 1fr; }
}`;
}
