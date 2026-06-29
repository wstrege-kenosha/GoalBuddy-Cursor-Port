import test, { after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { resetDatabaseCache, closeDatabase } from "../../../dist/db/connection.mjs";
import { importObjectiveFixture, saveStateV3 } from "../../../dist/db/state-repository.mjs";
import { removeWorkspaceDir } from "../../../dist/db/test-helpers.mjs";
import { buildColumns, createBoardPayload, writeBoardApp } from "../../../dist/board/objective-board.mjs";
import {
  BOARD_COLUMN_LABELS,
  BOARD_COPY,
} from "../../../dist/board/board-theme.mjs";
import { parseArgs, startBoardServer } from "../../../dist/board/local-objective-board.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../..");
const examplesRoot = join(repoRoot, "cursor-curator/surfaces/local-objective-board/examples");
process.env.WORKSPACE_FOLDER_PATHS = repoRoot;

function seedRepoExamples() {
  resetDatabaseCache();
  for (const name of ["sample-objective", "subobjective-parent"]) {
    importObjectiveFixture(repoRoot, `board-examples/${name}`, {
      dirPath: join(examplesRoot, name),
    });
  }
  closeDatabase(repoRoot);
}

seedRepoExamples();

after(() => {
  closeDatabase(repoRoot);
  resetDatabaseCache();
});

test("normalizes a dense objective into local board columns", () => {
  const payload = createBoardPayload(join(repoRoot, "cursor-curator/surfaces/local-objective-board/examples/sample-objective"));

  assert.equal(payload.objective.title, "Local Goal Board Surface");
  assert.equal(payload.objective.activeTask, "");
  assert.equal(payload.counts.total, 14);
  assert.equal(payload.counts.todo, 0);
  assert.equal(payload.counts.inProgress, 0);
  assert.equal(payload.counts.blocked, 5);
  assert.equal(payload.counts.completed, 9);
  assert.deepEqual(payload.columns.map((column) => column.title), ["Queued", "Running", "Blocked", "Shipped"]);

  const scout = payload.tasks.find((task) => task.id === "T001");
  assert.equal(scout.receipt.summary, "T001 completed during the progressive board motion demo.");
});

test("exposes board copy and column labels", () => {
  assert.equal(BOARD_COLUMN_LABELS.todo.title, "Queued");
  assert.equal(BOARD_COPY.sections.verify, "Verify");
  assert.equal(BOARD_COPY.successCriteriaEyebrow, "Signal");
  assert.equal(BOARD_COPY.nowEyebrow, "Now");
});

test("createBoardPayload includes validation completion and progress fields", () => {
  const payload = createBoardPayload(join(repoRoot, "cursor-curator/surfaces/local-objective-board/examples/sample-objective"));
  assert.ok("validation" in payload);
  assert.ok("completion" in payload);
  assert.ok("lastVerification" in payload);
  assert.ok("progress" in payload);
  assert.ok("usage" in payload);
  assert.equal(typeof payload.progress.total, "number");
  assert.equal(typeof payload.validation.ok, "boolean");
});

test("createBoardPayload attaches per-task metrics from notes/usage.json", () => {
  const root = mkdtempSync(join(tmpdir(), "cursor-curator-usage-board-"));
  try {
    const objectiveDir = join(root, "usage-objective");
    cpSync(join(repoRoot, "cursor-curator/surfaces/local-objective-board/examples/sample-objective"), objectiveDir, { recursive: true });
    resetDatabaseCache();
    importObjectiveFixture(root, "board-examples/sample-objective", { dirPath: objectiveDir });
    mkdirSync(join(objectiveDir, "notes"), { recursive: true });
    writeFileSync(join(objectiveDir, "notes", "usage.json"), `${JSON.stringify({
      version: 1,
      rollup: {
        duration_ms: 120_000,
        input_tokens: 50_000,
        output_tokens: 2_000,
        cache_read_tokens: 10_000,
        cache_write_tokens: 0,
        session_count: 1,
      },
      tasks: {
        T001: {
          duration_ms: 120_000,
          input_tokens: 50_000,
          output_tokens: 2_000,
          cache_read_tokens: 10_000,
          cache_write_tokens: 0,
          session_count: 1,
          last_session_at: "2026-06-25T12:00:00.000Z",
          models: ["composer"],
        },
      },
      unattributed: {
        duration_ms: 0,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        session_count: 0,
      },
      sessions: [],
    }, null, 2)}\n`, "utf8");

    const payload = createBoardPayload(objectiveDir);
    assert.equal(payload.usage.present, true);
    assert.equal(payload.usage.visible, true);
    assert.equal(payload.usage.rollup.session_count, 1);
    assert.match(payload.usage.summary, /agent time/);
    const scout = payload.tasks.find((task) => task.id === "T001");
    assert.equal(scout.metrics.session_count, 1);
    assert.equal(scout.metrics.input_tokens, 50_000);
    assert.match(scout.metrics_badge, /tok/);

    writeBoardApp(objectiveDir);
    const html = readFileSync(join(objectiveDir, ".cursor-curator-board", "index.html"), "utf8");
    const js = readFileSync(join(objectiveDir, ".cursor-curator-board", "app.js"), "utf8");
    assert.match(html, /id="progress-usage"/);
    assert.match(html, /id="goal-agent-time"/);
    assert.match(html, /id="goal-tokens"/);
    assert.match(js, /renderGoalMeta/);
    assert.match(js, /usage\?\.visible/);
    assert.match(js, /metrics_badge/);
  } finally {
    removeWorkspaceDir(root);
  }
});

test("generated board HTML includes new strip containers", () => {
  const root = mkdtempSync(join(tmpdir(), "cursor-curator-strips-"));
  try {
    const objectiveDir = join(root, "strip-test");
    cpSync(join(repoRoot, "cursor-curator/surfaces/local-objective-board/examples/sample-objective"), objectiveDir, { recursive: true });
    resetDatabaseCache();
    importObjectiveFixture(root, "board-examples/sample-objective", { dirPath: objectiveDir });
    const appDir = join(objectiveDir, ".cursor-curator-board");
    writeBoardApp(objectiveDir);
    const html = readFileSync(join(appDir, "index.html"), "utf8");
    const css = readFileSync(join(appDir, "styles.css"), "utf8");
    assert.match(html, /id="validation-banner"/);
    assert.match(html, /id="usage-warning"/);
    assert.match(html, /id="now-hero"/);
    assert.match(html, /id="intake-strip"/);
    assert.match(html, /id="progress-rail"/);
    assert.match(html, /id="session-drawer"/);
    assert.match(html, /id="session-drawer-trigger"/);
    assert.match(css, /var\(--strip-surface/);
  } finally {
    removeWorkspaceDir(root);
  }
});

test("orders completed cards newest first while preserving queued order", () => {
  const columns = buildColumns([
    { id: "T001", column: "completed", status: "done" },
    { id: "T002", column: "todo", status: "queued" },
    { id: "T003", column: "completed", status: "done" },
    { id: "T004", column: "todo", status: "queued" },
  ]);

  assert.deepEqual(columns.find((column) => column.id === "todo").tasks.map((task) => task.id), ["T002", "T004"]);
  assert.deepEqual(columns.find((column) => column.id === "completed").tasks.map((task) => task.id), ["T003", "T001"]);
});

test("loads depth-1 subobjective boards into parent task payloads", () => {
  const payload = createBoardPayload(join(repoRoot, "cursor-curator/surfaces/local-objective-board/examples/subobjective-parent"));
  const parentTask = payload.tasks.find((task) => task.id === "T004");

  assert.equal(parentTask.subobjective.status, "active");
  assert.equal(parentTask.subobjective.path, "subobjectives/T004-board-view");
  assert.equal(parentTask.subobjective.depth, 1);
  assert.equal(parentTask.subobjective.board.objective.title, "T004 Board View Subobjective");
  assert.equal(parentTask.subobjective.board.objective.activeTask, "T002");
  assert.equal(parentTask.subobjective.board.counts.total, 3);
  assert.equal(parentTask.subobjective.board.tasks.find((task) => task.id === "T002").active, true);
  assert.equal(parentTask.subobjective.board.tasks.find((task) => task.id === "T002").subobjective, null);
});

test("createBoardPayload merges parent and child usage rollups for subobjectives", () => {
  const root = mkdtempSync(join(tmpdir(), "cursor-curator-subobjective-usage-"));
  try {
    const objectiveDir = join(root, "parent-usage");
    cpSync(join(examplesRoot, "subobjective-parent"), objectiveDir, { recursive: true });
    resetDatabaseCache();
    importObjectiveFixture(root, "board-examples/subobjective-parent", { dirPath: objectiveDir });
    const childDir = join(objectiveDir, "subobjectives", "T004-board-view");
    mkdirSync(join(objectiveDir, "notes"), { recursive: true });
    mkdirSync(join(childDir, "notes"), { recursive: true });
    writeFileSync(join(objectiveDir, "notes", "usage.json"), `${JSON.stringify({
      version: 1,
      rollup: {
        duration_ms: 120_000,
        input_tokens: 40_000,
        output_tokens: 1_500,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        session_count: 1,
      },
      tasks: {
        T004: {
          duration_ms: 120_000,
          input_tokens: 40_000,
          output_tokens: 1_500,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
          session_count: 1,
          models: ["composer"],
        },
      },
      unattributed: emptyUsageCounters(),
      sessions: [],
    }, null, 2)}\n`, "utf8");
    writeFileSync(join(childDir, "notes", "usage.json"), `${JSON.stringify({
      version: 1,
      rollup: {
        duration_ms: 30_000,
        input_tokens: 5_000,
        output_tokens: 200,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        session_count: 1,
      },
      tasks: {
        T002: {
          duration_ms: 30_000,
          input_tokens: 5_000,
          output_tokens: 200,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
          session_count: 1,
          models: ["gpt-4"],
        },
      },
      unattributed: emptyUsageCounters(),
      sessions: [],
    }, null, 2)}\n`, "utf8");

    const payload = createBoardPayload(objectiveDir);
    assert.equal(payload.usage.rollup.duration_ms, 150_000);
    assert.equal(payload.usage.rollup.session_count, 2);
    assert.match(payload.usage.summary, /agent time/);

    const parentTask = payload.tasks.find((task) => task.id === "T004");
    assert.match(parentTask.metrics_badge, /2m|3m/);
    assert.equal(parentTask.metrics_detail.parent_agent_time, "2m");
    assert.equal(parentTask.metrics_detail.child_agent_time, "30s");
    assert.equal(parentTask.subobjective.board.usage.visible, true);
    assert.match(parentTask.subobjective.board.usage.summary, /agent time/);

    writeBoardApp(objectiveDir);
    const js = readFileSync(join(objectiveDir, ".cursor-curator-board", "app.js"), "utf8");
    assert.match(js, /subobjective-usage/);
    assert.match(js, /renderSubobjectiveTask[\s\S]*metrics_badge/);
  } finally {
    removeWorkspaceDir(root);
  }
});

test("uses readable card titles while preserving full objectives", () => {
  const root = mkdtempSync(join(tmpdir(), "cursor-curator-readable-titles-"));
  try {
    const objectiveDir = join(root, "readable-titles");
    mkdirSync(join(objectiveDir, "notes"), { recursive: true });
    writeStateJson(root, objectiveDir, {
      version: 3,
      objective: {
        title: "Compact titles",
        slug: "compact-titles",
        kind: "specific",
        tranche: "Title display.",
        status: "active",
      },
      active_task: "T001",
      tasks: [
        {
          id: "T001",
          type: "worker",
          assignee: "Worker",
          status: "active",
          objective: "Implement a read-only fixture-backed /admin/enrichment-qa queue slice. Use only admin_seed_metrics.enrichment_qa plus existing contacts, companies, users, evidence_items, and facts. Do not create new APIs.",
          receipt: null,
        },
        {
          id: "T002",
          type: "worker",
          assignee: "Worker",
          status: "blocked",
          objective: "Implement the read-only fixture-backed /contacts/con_aaron_keller route as the next first-milestone slice. Add a clickable path from the Coinbase chat answer matched contact row/name to Aaron Keller's profile.",
          receipt: null,
        },
        {
          id: "T003",
          title: "Human-friendly release title",
          type: "pm",
          assignee: "PM",
          status: "queued",
          objective: "This objective can stay much more detailed because it belongs in the modal, not on the card face",
          receipt: null,
        },
        {
          id: "T004",
          title: "Run installed-Cursor runtime proof for a named model request through the local BYOK bridge",
          type: "worker",
          assignee: "Worker",
          status: "queued",
          objective: "Run installed-Cursor runtime proof for a named model request through the local BYOK bridge.",
          receipt: null,
        },
      ],
    });

    const payload = createBoardPayload(objectiveDir);
    assert.equal(payload.tasks.find((task) => task.id === "T001").title, "Implement /admin/enrichment-qa queue slice");
    assert.equal(payload.tasks.find((task) => task.id === "T001").objective.includes("admin_seed_metrics.enrichment_qa"), true);
    assert.equal(payload.tasks.find((task) => task.id === "T002").title, "Implement /contacts/con_aaron_keller route");
    assert.equal(payload.tasks.find((task) => task.id === "T003").title, payload.tasks.find((task) => task.id === "T003").objective);
    assert.match(
      payload.tasks.find((task) => task.id === "T004").title,
      /named model request through the local BYOK bridge/,
    );
  } finally {
    removeWorkspaceDir(root);
  }
});

test("keeps board rendering when receipt raw fields are loosely shaped", () => {
  const root = mkdtempSync(join(tmpdir(), "cursor-curator-board-subset-parser-"));
  try {
    const objectiveDir = join(root, "subset-parser");
    mkdirSync(join(objectiveDir, "notes"), { recursive: true });
    writeStateJson(root, objectiveDir, {
      version: 3,
      objective: {
        title: "Subset parser",
        slug: "subset-parser",
        kind: "specific",
        tranche: "Recover shallow board fields.",
        status: "active",
      },
      active_task: "T003",
      checks: {
        last_verification: {
          status: "pass",
          raw: "malformed nested checker output",
        },
      },
      tasks: [
        {
          id: "T001",
          type: "worker",
          assignee: "Worker",
          status: "done",
          objective: "Ship a completed worker slice.",
          receipt: {
            result: "done",
            summary: "Worker finished.",
            raw: "malformed nested receipt output",
          },
        },
        {
          id: "T002",
          type: "approval_gate",
          assignee: "Approval Gate",
          status: "done",
          objective: "Approve the result.",
          receipt: null,
        },
        {
          id: "T003",
          type: "scout",
          assignee: "Scout",
          status: "active",
          objective: "Inspect what is left.",
          receipt: null,
        },
      ],
    });

    const payload = createBoardPayload(objectiveDir);
    assert.equal(payload.objective.title, "Subset parser");
    assert.equal(payload.objective.activeTask, "T003");
    assert.equal(payload.counts.completed, 2);
    assert.equal(payload.counts.inProgress, 1);
    assert.equal(payload.tasks.find((task) => task.id === "T001").status, "done");
    assert.equal(payload.tasks.find((task) => task.id === "T002").status, "done");
    assert.equal(payload.tasks.find((task) => task.id === "T001").receipt.summary, "Worker finished.");
  } finally {
    removeWorkspaceDir(root);
  }
});

test("missing linked subobjective is omitted from board payload after reload", () => {
  const root = mkdtempSync(join(tmpdir(), "cursor-curator-missing-subobjective-"));
  try {
    const objectiveDir = join(root, "parent");
    mkdirSync(join(objectiveDir, "notes"), { recursive: true });
    writeStateJson(root, objectiveDir, {
      version: 3,
      objective: {
        title: "Missing child",
        slug: "missing-child",
        kind: "specific",
        tranche: "Missing child.",
        status: "active",
      },
      active_task: "T001",
      tasks: [
        {
          id: "T001",
          type: "worker",
          assignee: "Worker",
          status: "active",
          objective: "Render child.",
          allowed_files: ["notes/**"],
          verify: ["bun test"],
          stop_if: ["Needs files outside allowed_files"],
          subobjective: {
            status: "active",
            path: "subobjectives/missing",
            owner: "Worker",
            depth: 1,
          },
          receipt: null,
        },
      ],
    });

    const payload = createBoardPayload(objectiveDir);
    assert.equal(payload.tasks.find((task) => task.id === "T001").subobjective, null);
  } finally {
    removeWorkspaceDir(root);
  }
});

test("refuses to render subobjective boards outside the parent objective root", () => {
  const root = mkdtempSync(join(tmpdir(), "cursor-curator-outside-subobjective-"));
  try {
    const objectiveDir = join(root, "parent");
    const outsideDir = join(root, "outside");
    mkdirSync(join(objectiveDir, "notes"), { recursive: true });
    mkdirSync(outsideDir, { recursive: true });
    writeStateJson(root, outsideDir, {
      version: 3,
      objective: {
        title: "Outside child",
        slug: "outside-child",
        kind: "specific",
        tranche: "Outside.",
        status: "active",
      },
      active_task: "T001",
      tasks: [
        {
          id: "T001",
          type: "scout",
          assignee: "Scout",
          status: "active",
          objective: "Read.",
          receipt: null,
        },
      ],
    });
    writeStateJson(root, objectiveDir, {
      version: 3,
      objective: {
        title: "Outside child parent",
        slug: "outside-child-parent",
        kind: "specific",
        tranche: "Reject outside child.",
        status: "active",
      },
      active_task: "T001",
      tasks: [
        {
          id: "T001",
          type: "worker",
          assignee: "Worker",
          status: "active",
          objective: "Render child.",
          subobjective: {
            status: "active",
            path: "../outside",
            owner: "Worker",
            depth: 1,
          },
          receipt: null,
        },
      ],
    });

    assert.throws(
      () => createBoardPayload(objectiveDir),
      /Invalid sub-objective path for T001:/,
    );
  } finally {
    removeWorkspaceDir(root);
  }
});

test("writes a minimal Cursor Curator web app into the objective directory", () => {
  const appDir = writeBoardApp(join(repoRoot, "cursor-curator/surfaces/local-objective-board/examples/sample-objective"));
  const html = readFileSync(join(appDir, "index.html"), "utf8");
  const css = readFileSync(join(appDir, "styles.css"), "utf8");
  const js = readFileSync(join(appDir, "app.js"), "utf8");
  const logo = readFileSync(join(appDir, "curator-mark.png"));

  assert.match(html, /id="objective-eyebrow"/);
  assert.match(html, /id="setting-density"/);
  assert.match(html, /class="board-frame"/);
  assert.match(html, /curator-mark\.png/);
  assert.match(html, /class="theme-board"/);
  assert.match(html, /fonts\.googleapis\.com/);
  assert.match(html, /class="topbar-primary"/);
  assert.match(html, /class="board-switcher is-empty"/);
  assert.match(html, /class="github-stars"/);
  assert.match(html, /class="github-upstream"/);
  assert.match(html, /wstrege-kenosha\/Cursor-Curator/);
  assert.match(html, /Upstream: tolibear\/goalbuddy @ 0\.3\.8/);
  assert.match(html, /class="board-provenance"/);
  assert.match(html, /Board UI from/);
  assert.match(html, /ported from upstream/);
  assert.match(html, /id="settings-button"/);
  assert.match(html, /id="settings-popover"/);
  assert.match(css, /--canvas: #141c26/);
  assert.match(css, /caret-blink/);
  assert.match(css, /scan-line/);
  assert.match(css, /\.topbar-primary/);
  assert.match(css, /\.board-switcher\.is-empty \{\n  display: none;/);
  assert.match(css, /active-card-orbit/);
  assert.match(css, /:root\[data-motion="reduce"\] \.task-card\.is-active::before/);
  assert.match(css, /:root\[data-density="compact"\] \.task-card/);
  assert.match(css, /:root\[data-completed-visibility="collapse"\]/);
  assert.match(css, /-webkit-line-clamp: 5/);
  assert.match(css, /\.subobjective-board/);
  assert.match(css, /\.board-error/);
  assert.match(css, /\.detail-panel/);
  assert.match(js, /let currentBoard = null;/);
  assert.match(js, /function columnLabels\(column\)/);
  assert.match(js, /renderUsageWarning/);
  assert.match(js, /usage_warning/);
  assert.match(js, /new EventSource\("\.\/events"\)/);
  assert.match(js, /fetch\("\.\.\/api\/boards"/);
  assert.match(js, /fetch\("\.\.\/api\/settings"/);
  assert.match(js, /fetch\("https:\/\/api\.github\.com\/repos\/wstrege-kenosha\/Cursor-Curator"/);
  assert.match(js, /cursor-curator\.localBoardSettings\.v1/);
  assert.match(js, /document\.documentElement\.dataset\.density/);
  assert.match(js, /boardCopy/);
  assert.match(js, /detailPanelText/);
  assert.match(js, /rememberCurrentBoard/);
  assert.match(js, /settingsButtonEl\.setAttribute\("aria-label"/);
  assert.match(js, /animateCardMoves/);
  assert.match(js, /card\.animate/);
  assert.match(js, /highlightMovingCards/);
  assert.match(js, /renderSubobjective/);
  assert.match(js, /renderBoardError/);
  assert.match(js, /boardOptionLabel/);
  assert.match(js, /duration: changedColumn \? 980 : 520/);
  assert.equal(logo.subarray(1, 4).toString("ascii"), "PNG");
});

test("serves global local board settings with defensive normalization", async () => {
  const root = mkdtempSync(join(tmpdir(), "cursor-curator-local-board-settings-"));
  const objectiveDir = join(root, "settings-goal");
  const settingsPath = join(root, "settings.json");
  const previousSettingsPath = process.env.CURATOR_LOCAL_BOARD_SETTINGS_PATH;
  try {
    process.env.CURATOR_LOCAL_BOARD_SETTINGS_PATH = settingsPath;
    mkdirSync(join(objectiveDir, "notes"), { recursive: true });
    writeStateJson(root, objectiveDir, stateJson("active", { title: "Settings Goal", slug: "settings-goal" }));

    const server = await startBoardServer({ objectiveDir, host: "127.0.0.1", port: 0 });
    try {
      const initialResponse = await fetch(`${server.hubUrl}api/settings`);
      assert.equal(initialResponse.status, 200);
      assert.deepEqual((await initialResponse.json()).settings, {
        density: "comfortable",
        completedVisibility: "show",
        boardOpenBehavior: "last",
        motion: "system",
        lastBoardPath: "",
      });

      const updateResponse = await fetch(`${server.hubUrl}api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            density: "compact",
            completedVisibility: "collapse",
            boardOpenBehavior: "newest",
            motion: "reduce",
            lastBoardPath: "/settings-goal/",
            unexpected: "ignored",
          },
        }),
      });
      assert.equal(updateResponse.status, 200);
      assert.deepEqual((await updateResponse.json()).settings, {
        density: "compact",
        completedVisibility: "collapse",
        boardOpenBehavior: "newest",
        motion: "reduce",
        lastBoardPath: "/settings-goal/",
      });
      assert.match(readFileSync(settingsPath, "utf8"), /"density": "compact"/);

      const invalidResponse = await fetch(`${server.hubUrl}api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { density: "tiny", motion: "allow" } }),
      });
      assert.equal(invalidResponse.status, 200);
      assert.deepEqual((await invalidResponse.json()).settings, {
        density: "comfortable",
        completedVisibility: "show",
        boardOpenBehavior: "last",
        motion: "allow",
        lastBoardPath: "",
      });
    } finally {
      await server.close();
    }
  } finally {
    if (previousSettingsPath === undefined) {
      delete process.env.CURATOR_LOCAL_BOARD_SETTINGS_PATH;
    } else {
      process.env.CURATOR_LOCAL_BOARD_SETTINGS_PATH = previousSettingsPath;
    }
    removeWorkspaceDir(root);
  }
});

test("normalizes legacy settings files without density", async () => {
  const root = mkdtempSync(join(tmpdir(), "cursor-curator-legacy-board-settings-"));
  const settingsPath = join(root, "settings.json");
  const previousSettingsPath = process.env.CURATOR_LOCAL_BOARD_SETTINGS_PATH;
  try {
    process.env.CURATOR_LOCAL_BOARD_SETTINGS_PATH = settingsPath;
    writeFileSync(settingsPath, `${JSON.stringify({
      completedVisibility: "show",
      boardOpenBehavior: "last",
      motion: "system",
      lastBoardPath: "",
    }, null, 2)}\n`);

    const objectiveDir = join(root, "legacy-settings-goal");
    mkdirSync(join(objectiveDir, "notes"), { recursive: true });
    writeStateJson(root, objectiveDir, stateJson("active", { title: "Legacy Settings Goal", slug: "legacy-settings-goal" }));

    const server = await startBoardServer({ objectiveDir, host: "127.0.0.1", port: 0 });
    try {
      const response = await fetch(`${server.hubUrl}api/settings`);
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).settings, {
        density: "comfortable",
        completedVisibility: "show",
        boardOpenBehavior: "last",
        motion: "system",
        lastBoardPath: "",
      });
    } finally {
      await server.close();
    }
  } finally {
    if (previousSettingsPath === undefined) {
      delete process.env.CURATOR_LOCAL_BOARD_SETTINGS_PATH;
    } else {
      process.env.CURATOR_LOCAL_BOARD_SETTINGS_PATH = previousSettingsPath;
    }
    removeWorkspaceDir(root);
  }
});

test("parses CLI options", () => {
  assert.equal(parseArgs(["--objective", "docs/objectives/demo"]).port, 41737);
  assert.equal(parseArgs(["--objective", "docs/objectives/demo"]).host, "127.0.0.1");
  assert.equal(parseArgs(["--objective", "docs/objectives/demo"]).publicHost, "curator.localhost");
  assert.deepEqual(parseArgs(["--objective", "docs/objectives/demo", "--port", "0", "--once", "--json"]), {
    objective: "docs/objectives/demo",
    host: "127.0.0.1",
    publicHost: "curator.localhost",
    port: 0,
    once: true,
    json: true,
  });
  assert.deepEqual(parseArgs(["--objective", "docs/objectives/demo", "--host", "localhost"]), {
    objective: "docs/objectives/demo",
    host: "localhost",
    publicHost: "localhost",
    port: 41737,
    once: false,
    json: false,
  });
});

test("advertises curator.localhost while binding to loopback", async () => {
  const root = mkdtempSync(join(tmpdir(), "cursor-curator-local-board-public-host-"));
  const objectiveDir = join(root, "goal");
  try {
    mkdirSync(join(objectiveDir, "notes"), { recursive: true });
    writeStateJson(root, objectiveDir, stateJson("active", { title: "Public Host Goal", slug: "public-host-goal" }));

    const server = await startBoardServer({ objectiveDir, port: 0 });
    try {
      const url = new URL(server.url);
      assert.equal(url.hostname, "curator.localhost");
      assert.equal(url.pathname, "/public-host-goal/");

      const loopbackResponse = await fetch(`http://127.0.0.1:${url.port}/api/boards`);
      assert.equal(loopbackResponse.status, 200);
    } finally {
      await server.close();
    }
  } finally {
    removeWorkspaceDir(root);
  }
});

test("runs when installed under a symlinked temp path", { timeout: 120_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), "cursor-curator-local-board-direct-"));
  const installRoot = join(root, "cursor-curator");
  const objectiveDir = join(root, "sample-objective");
  try {
    cpSync("cursor-curator/dist", join(installRoot, "dist"), { recursive: true });
    cpSync("cursor-curator/assets", join(installRoot, "assets"), { recursive: true });
    cpSync("cursor-curator/package.json", join(installRoot, "package.json"));
    cpSync(join(repoRoot, "node_modules"), join(installRoot, "node_modules"), { recursive: true });
    cpSync(join(examplesRoot, "sample-objective"), objectiveDir, { recursive: true });
    resetDatabaseCache();
    importObjectiveFixture(root, "board-examples/sample-objective", { dirPath: objectiveDir });
    closeDatabase(root);

    const result = spawnSync(process.execPath, [
      join(installRoot, "dist/board/local-objective-board.mjs"),
      "--objective",
      objectiveDir,
      "--once",
      "--json",
    ], { encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.board.objective.title, "Local Goal Board Surface");
  } finally {
    closeDatabase(root);
    removeWorkspaceDir(root);
  }
});

test("dist board CLI invokes main when executed directly", () => {
  const boardCli = resolve("cursor-curator/dist/board/local-objective-board.mjs");
  const result = spawnSync(process.execPath, [
    boardCli,
    "--objective",
    resolve("cursor-curator/surfaces/local-objective-board/examples/sample-objective"),
    "--once",
    "--json",
  ], { encoding: "utf8", cwd: resolve(".") });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.board.objective.title, "Local Goal Board Surface");
});

test("serves board JSON and streams live state changes over SSE", { timeout: 15_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "cursor-curator-local-board-"));
  const objectiveDir = join(root, "demo-goal");
  try {
    mkdirSync(join(objectiveDir, "notes"), { recursive: true });
    writeStateJson(root, objectiveDir, stateJson("active"));
    writeFileSync(join(objectiveDir, "notes", "T001-note.md"), "# Live Note\n\nInitial note.\n");

    const server = await startBoardServer({ objectiveDir, host: "127.0.0.1", port: 0 });
    try {
      assert.match(server.url, /\/live-board\/$/);
      const boardResponse = await fetch(`${server.url}api/board`);
      assert.equal(boardResponse.status, 200);
      const board = await boardResponse.json();
      assert.equal(board.tasks[0].status, "active");

      const controller = new AbortController();
      const events = await fetch(`${server.url}events`, { signal: controller.signal });
      assert.equal(events.status, 200);
      const reader = events.body.getReader();

      await readUntil(reader, /"status":"active"/);
      writeStateJson(root, objectiveDir, stateJson("blocked"));
      const update = await readUntil(reader, /"status":"blocked"/);
      assert.match(update, /"title":"Blocked"/);

      controller.abort();
      await reader.cancel().catch(() => {});
    } finally {
      await server.close();
    }
  } finally {
    removeWorkspaceDir(root);
  }
});

test("streams parent board updates when linked child subobjective state changes", { timeout: 15_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "cursor-curator-local-board-subobjective-live-"));
  const objectiveDir = join(root, "parent-goal");
  const childDir = join(objectiveDir, "subobjectives", "T001-child");
  try {
    mkdirSync(join(objectiveDir, "notes"), { recursive: true });
    mkdirSync(join(childDir, "notes"), { recursive: true });
    writeStateJson(root, childDir, stateJson("active", { title: "Child Goal", slug: "child-goal" }));
    writeStateJson(root, objectiveDir, parentWithSubobjectiveJson());

    const server = await startBoardServer({ objectiveDir, host: "127.0.0.1", port: 0 });
    try {
      const controller = new AbortController();
      const events = await fetch(`${server.url}events`, { signal: controller.signal });
      assert.equal(events.status, 200);
      const reader = events.body.getReader();

      await readUntil(reader, /"title":"Child Goal"/);
      writeStateJson(root, childDir, stateJson("blocked", { title: "Child Goal", slug: "child-goal" }));
      const update = await readUntil(reader, /"status":"blocked"/);
      assert.match(update, /"Child Goal"/);

      controller.abort();
      await reader.cancel().catch(() => {});
    } finally {
      await server.close();
    }
  } finally {
    removeWorkspaceDir(root);
  }
});

test("serves multiple local boards from one shared hub URL", { timeout: 15_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "cursor-curator-local-board-hub-"));
  const firstObjectiveDir = join(root, "first-goal");
  const secondObjectiveDir = join(root, "second-goal");
  const previousSettingsPath = process.env.CURATOR_LOCAL_BOARD_SETTINGS_PATH;
  try {
    process.env.CURATOR_LOCAL_BOARD_SETTINGS_PATH = join(root, "hub-settings.json");
    mkdirSync(join(firstObjectiveDir, "notes"), { recursive: true });
    mkdirSync(join(secondObjectiveDir, "notes"), { recursive: true });
    writeStateJson(root, firstObjectiveDir, stateJson("active", { title: "First Goal", slug: "first-goal" }));
    writeStateJson(root, secondObjectiveDir, stateJson("blocked", { title: "Second Goal", slug: "second-goal" }));

    const server = await startBoardServer({ objectiveDir: firstObjectiveDir, host: "127.0.0.1", port: 0 });
    try {
      const registerResponse = await fetch(server.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectiveDir: secondObjectiveDir }),
      });
      assert.equal(registerResponse.status, 200);
      const second = await registerResponse.json();

      const firstUrl = new URL(server.url);
      const secondUrl = new URL(second.url);
      assert.equal(secondUrl.origin, firstUrl.origin);
      assert.equal(firstUrl.pathname, "/first-goal/");
      assert.equal(secondUrl.pathname, "/second-goal/");

      const hubResponse = await fetch(server.hubUrl, { redirect: "manual" });
      assert.equal(hubResponse.status, 200);
      const hubHtml = await hubResponse.text();
      assert.match(hubHtml, /Cursor Curator Hub/);
      const hubPayload = JSON.parse(hubHtml.match(/<script id="hub-payload" type="application\/json">([\s\S]*?)<\/script>/)?.[1] ?? "{}");
      const registeredHubObjectives = hubPayload.objectives.filter(
        (objective) => [firstObjectiveDir, secondObjectiveDir].map((dir) => resolve(dir)).includes(resolve(objective.objective_dir)),
      );
      assert.equal(registeredHubObjectives.length, 2);
      assert.deepEqual(new Set(registeredHubObjectives.map((objective) => objective.slug)), new Set(["first-goal", "second-goal"]));

      const noSlashResponse = await fetch(`${secondUrl.origin}/second-goal`, { redirect: "manual" });
      assert.equal(noSlashResponse.status, 302);
      assert.equal(noSlashResponse.headers.get("location"), `${secondUrl.origin}/second-goal/`);

      const boardsResponse = await fetch(server.apiUrl);
      assert.equal(boardsResponse.status, 200);
      const boards = await boardsResponse.json();
      assert.deepEqual(new Set(boards.boards.map((board) => board.title)), new Set(["First Goal", "Second Goal"]));

      const newestSettingsResponse = await fetch(`${firstUrl.origin}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { boardOpenBehavior: "newest" } }),
      });
      assert.equal(newestSettingsResponse.status, 200);
      const newestHubResponse = await fetch(`${firstUrl.origin}/open`, { redirect: "manual" });
      assert.equal(newestHubResponse.status, 302);
      assert.equal(newestHubResponse.headers.get("location"), `${firstUrl.origin}/second-goal/`);

      const lastSettingsResponse = await fetch(`${firstUrl.origin}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { boardOpenBehavior: "last", lastBoardPath: "/first-goal/" } }),
      });
      assert.equal(lastSettingsResponse.status, 200);
      const lastHubResponse = await fetch(`${firstUrl.origin}/open`, { redirect: "manual" });
      assert.equal(lastHubResponse.status, 302);
      assert.equal(lastHubResponse.headers.get("location"), `${firstUrl.origin}/first-goal/`);

      const secondBoardResponse = await fetch(`${second.url}api/board`);
      assert.equal(secondBoardResponse.status, 200);
      const secondBoard = await secondBoardResponse.json();
      assert.equal(secondBoard.objective.title, "Second Goal");
    } finally {
      await server.close();
    }
  } finally {
    if (previousSettingsPath === undefined) {
      delete process.env.CURATOR_LOCAL_BOARD_SETTINGS_PATH;
    } else {
      process.env.CURATOR_LOCAL_BOARD_SETTINGS_PATH = previousSettingsPath;
    }
    removeWorkspaceDir(root);
  }
});

test("unregistered board paths explain hub reuse instead of stale-port cleanup", async () => {
  const root = mkdtempSync(join(tmpdir(), "cursor-curator-local-board-unregistered-"));
  const objectiveDir = join(root, "first-goal");
  try {
    mkdirSync(join(objectiveDir, "notes"), { recursive: true });
    writeStateJson(root, objectiveDir, stateJson("active", { title: "First Goal", slug: "first-goal" }));

    const server = await startBoardServer({ objectiveDir, host: "127.0.0.1", port: 0 });
    try {
      const baseUrl = new URL(server.url).origin;
      const missingResponse = await fetch(`${baseUrl}/rinova-client-revision-redesign/`);
      assert.equal(missingResponse.status, 404);
      const message = await missingResponse.text();
      assert.match(message, /board path is not registered/i);
      assert.match(message, /multi-board hub/i);
      assert.match(message, /Do not stop it just because a \/<slug>\/ board URL returned 404/);
      assert.match(message, /curator\.mjs board <objective-dir>/);
      assert.match(message, /First Goal/);
      assert.match(message, /\/api\/boards/);
    } finally {
      await server.close();
    }
  } finally {
    removeWorkspaceDir(root);
  }
});

async function readUntil(reader, pattern, timeoutMs = 8000) {
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    let readResult;
    try {
      readResult = await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error("poll")),
            Math.max(50, Math.min(250, deadline - Date.now())),
          );
        }),
      ]);
    } catch {
      continue;
    }
    const { done, value } = readResult;
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (pattern.test(text)) return text;
  }

  assert.fail(`Timed out waiting for ${pattern}. Received:\n${text}`);
}

function emptyUsageCounters() {
  return {
    duration_ms: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    session_count: 0,
  };
}

function writeStateJson(workspaceRoot, objectiveDir, state) {
  closeDatabase(workspaceRoot);
  saveStateV3(workspaceRoot, {
    ...boardStateDefaults(),
    ...state,
    objective: {
      title: "Board test",
      slug: basename(objectiveDir),
      kind: "specific",
      tranche: "Board test",
      status: "active",
      success_criteria: {
        signal: "board tests pass",
        final_proof: "local-objective-board tests pass",
      },
      ...(state.objective || {}),
    },
  }, { dirPath: resolve(objectiveDir) });
  closeDatabase(workspaceRoot);
}

function boardStateDefaults(overrides = {}) {
  return {
    success_criteria: {
      signal: "board tests pass",
      final_proof: "local-objective-board tests pass",
    },
    agents: {
      scout: "installed",
      worker: "installed",
      approval_gate: "installed",
    },
    ...overrides,
  };
}

function parentWithSubobjectiveJson() {
  return {
    version: 3,
    ...boardStateDefaults(),
    objective: {
      title: "Parent Goal",
      slug: "parent-goal",
      kind: "specific",
      tranche: "Verify child live updates.",
      status: "active",
      success_criteria: {
        signal: "board tests pass",
        final_proof: "local-objective-board tests pass",
      },
    },
    active_task: "T001",
    tasks: [
      {
        id: "T001",
        type: "worker",
        assignee: "Worker",
        status: "active",
        objective: "Watch child state.",
        allowed_files: ["notes/**"],
        verify: ["bun test"],
        stop_if: ["Needs files outside allowed_files"],
        subobjective: {
          status: "active",
          path: "subobjectives/T001-child",
          owner: "Worker",
          depth: 1,
        },
        receipt: null,
      },
    ],
  };
}

function stateJson(status, { title = "Live board", slug = "live-board" } = {}) {
  return {
    version: 3,
    ...boardStateDefaults(),
    objective: {
      title,
      slug,
      kind: "specific",
      tranche: "Verify live updates.",
      status: "active",
      success_criteria: {
        signal: "board tests pass",
        final_proof: "local-objective-board tests pass",
      },
    },
    active_task: "T001",
    tasks: [
      {
        id: "T001",
        type: "worker",
        assignee: "Worker",
        status,
        objective: "Render live changes.",
        receipt: {
          result: "done",
          summary: "Rendered safely.",
          note: "notes/T001-note.md",
        },
      },
    ],
  };
}
