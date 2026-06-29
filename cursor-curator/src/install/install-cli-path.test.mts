import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import {
  appendGitHubActionsPath,
  buildNormalizedWindowsUserPath,
  buildPathMarkerBlock,
  buildUnixPathExportLine,
  ensureCliOnPath,
  isPathEntryPresent,
  normalizePathEntry,
  upsertUnixShellRc,
} from "./install-cli-path.mjs";

test("isPathEntryPresent matches normalized Windows paths", () => {
  const binDir = "C:\\Users\\me\\.cursor\\bin";
  const pathEnv = "C:\\Windows\\System32;C:\\Users\\me\\.cursor\\bin;C:\\Tools";
  assert.equal(isPathEntryPresent(pathEnv, binDir), true);
  assert.equal(normalizePathEntry("C:/Users/me/.cursor/bin"), normalizePathEntry(binDir));
});

test("buildNormalizedWindowsUserPath normalizes escaped Windows segments", () => {
  const current = "C:\\\\Users\\\\me\\\\.cursor\\\\bin;C:\\\\Tools";
  const next = buildNormalizedWindowsUserPath(current);
  assert.match(next, /^C:\\Users\\me\\.cursor\\bin;C:\\Tools$/);
  assert.doesNotMatch(next, /\\\\/);
});

test("buildPathMarkerBlock includes export line", () => {
  const block = buildPathMarkerBlock("/home/me/.cursor/bin");
  assert.match(block, /cursor-curator PATH/);
  assert.equal(buildUnixPathExportLine("/home/me/.cursor/bin"), 'export PATH="/home/me/.cursor/bin:$PATH"');
});

test("upsertUnixShellRc creates and updates shell rc", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-path-"));
  const rcPath = join(root, ".zshrc");
  const binDir = join(root, ".cursor", "bin");
  const block = buildPathMarkerBlock(binDir);

  try {
    assert.equal(upsertUnixShellRc(rcPath, block, binDir), "created");
    assert.match(readFileSync(rcPath, "utf8"), /cursor-curator PATH/);
    assert.equal(upsertUnixShellRc(rcPath, block, binDir), "already");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ensureCliOnPath can be skipped with enabled false", () => {
  const result = ensureCliOnPath("/tmp/.cursor/bin", { enabled: false });
  assert.equal(result.skipped, true);
  assert.match(result.message, /--no-add-to-path/);
});

test("appendGitHubActionsPath registers bin dir for later workflow steps", () => {
  const root = mkdtempSync(join(tmpdir(), "curator-gha-path-"));
  const githubPathFile = join(root, "github-path");
  const binDir = join(root, ".cursor", "bin");
  const previous = process.env.GITHUB_PATH;

  try {
    process.env.GITHUB_PATH = githubPathFile;
    assert.equal(appendGitHubActionsPath(binDir), true);
    assert.equal(readFileSync(githubPathFile, "utf8"), `${binDir}\n`);
    assert.equal(appendGitHubActionsPath(binDir), false);
  } finally {
    if (previous === undefined) {
      delete process.env.GITHUB_PATH;
    } else {
      process.env.GITHUB_PATH = previous;
    }
    rmSync(root, { recursive: true, force: true });
  }
});
