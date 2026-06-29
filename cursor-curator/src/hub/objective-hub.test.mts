import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import type { StateV3 } from "../schema/state-v3.js";
import { resetDatabaseCache } from "../db/connection.mjs";
import { seedObjectiveInDb, removeWorkspaceDir } from "../db/test-helpers.mjs";
import { emptyUsageFile } from "../usage/objective-usage.mjs";
import {
  buildHubEntry,
  buildHubHtml,
  buildHubPayload,
  invalidateHubPayloadCache,
} from "./objective-hub.mjs";

function scaffoldObjective(root: string, slug: string): string {
  resetDatabaseCache();
  const state: StateV3 = {
    version: 3,
    objective: {
      title: `Objective ${slug}`,
      slug,
      status: "active",
      success_criteria: { signal: "done", cadence: "once", final_proof: "done" },
    },
    rules: { pm_owns_state: true, one_active_task: true },
    agents: { scout: "installed", worker: "installed", approval_gate: "installed" },
    visual_board: { selected: "none", local: { status: "not_requested" } },
    active_task: "T001",
    tasks: [
      {
        id: "T001",
        type: "worker",
        assignee: "Worker",
        status: "active",
        objective: "Worker slice",
        allowed_files: ["README.md"],
        verify: ["bun run check"],
        stop_if: ["blocked"],
        receipt: null,
      },
    ],
    checks: { dirty_fingerprint: "test" },
  };
  seedObjectiveInDb(root, state, { slug });
  return join(root, "docs", "objectives", slug);
}

function writeUsageJson(
  objectiveDir: string,
  rollup: {
    duration_ms: number;
    input_tokens: number;
    output_tokens: number;
    session_count: number;
  },
  unattributed = emptyUsageFile().unattributed,
) {
  const notesDir = join(objectiveDir, "notes");
  mkdirSync(notesDir, { recursive: true });
  writeFileSync(join(notesDir, "usage.json"), JSON.stringify({
    version: 1,
    rollup: {
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      ...rollup,
    },
    tasks: {},
    unattributed,
    sessions: [],
  }, null, 2));
}

test("buildHubEntry exposes usage fields when usage.json is present", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-hub-entry-"));
  try {
    const objectiveDir = scaffoldObjective(root, "hub-usage");
    writeUsageJson(objectiveDir, {
      duration_ms: 90_000,
      input_tokens: 20_000,
      output_tokens: 1_000,
      session_count: 1,
    });

    const entry = buildHubEntry(objectiveDir);
    assert.equal(entry.usage_visible, true);
    assert.equal(entry.usage_agent_time, "2m");
    assert.equal(entry.usage_tokens, "21k");
    assert.match(String(entry.usage_summary), /agent time/);
  } finally {
    removeWorkspaceDir(root);
  }
});

test("buildHubHtml includes usage metrics when fixture has usage.json", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-hub-html-"));
  try {
    const objectiveDir = scaffoldObjective(root, "hub-html-usage");
    writeUsageJson(objectiveDir, {
      duration_ms: 90_000,
      input_tokens: 20_000,
      output_tokens: 1_000,
      session_count: 1,
    });

    invalidateHubPayloadCache();
    const payload = buildHubPayload({ roots: [root] });
    const html = buildHubHtml(payload);

    assert.match(html, /class="hub-grid"/);
    assert.match(html, /class="hub-card"/);
    assert.match(html, /<dt>Agent time<\/dt><dd>2m<\/dd>/);
    assert.match(html, /<dt>Tokens<\/dt><dd>21k<\/dd>/);
    assert.match(html, /Objective hub-html-usage/);
  } finally {
    removeWorkspaceDir(root);
  }
});

test("buildHubHtml shows unattributed warning badge on cards", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-hub-unattrib-"));
  try {
    const objectiveDir = scaffoldObjective(root, "hub-unattrib");
    writeUsageJson(
      objectiveDir,
      {
        duration_ms: 60_000,
        input_tokens: 5_000,
        output_tokens: 500,
        session_count: 1,
      },
      {
        duration_ms: 30_000,
        input_tokens: 1_000,
        output_tokens: 100,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        session_count: 1,
      },
    );

    invalidateHubPayloadCache();
    const payload = buildHubPayload({ roots: [root], fresh: true });
    const html = buildHubHtml(payload);

    assert.match(html, /class="badge warning"/);
    assert.match(html, /Unattributed usage/);
  } finally {
    removeWorkspaceDir(root);
  }
});

test("buildHubHtml renders hub-empty when no objectives exist", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-hub-empty-"));
  try {
    invalidateHubPayloadCache();
    const payload = buildHubPayload({ roots: [root], fresh: true });
    const html = buildHubHtml(payload);

    assert.match(html, /class="hub-empty"/);
    assert.doesNotMatch(html, /<table>/);
  } finally {
    removeWorkspaceDir(root);
  }
});
