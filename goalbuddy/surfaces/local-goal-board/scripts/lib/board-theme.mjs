export function themeFontLinksHtml() {
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@450;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">`;
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
}

:root[data-theme="dark"] {
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

@media (prefers-color-scheme: dark) {
  :root[data-theme="system"] {
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

* { box-sizing: border-box; }

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(ellipse 90% 55% at 50% -8%, rgba(37, 99, 235, 0.07), transparent 58%),
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

.hub-oracle {
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
