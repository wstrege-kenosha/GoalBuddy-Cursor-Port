import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  cleanCursorCuratorInstall,
  resolveReinstallRepoRoot,
} from "./reinstall-clean.mjs";
import { SKILL_NAME } from "../lib/brand.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

test("resolveReinstallRepoRoot finds repo from parent of skill root", () => {
  const skillRoot = join(repoRoot, SKILL_NAME);
  const found = resolveReinstallRepoRoot(skillRoot, join(repoRoot, ".cursor-test-home"));
  assert.equal(found, repoRoot);
});

test("resolveReinstallRepoRoot reads port config repoRoot", () => {
  const tempHome = mkdtempSync(join(tmpdir(), "curator-reinstall-"));
  const skillRoot = join(tempHome, "skills", SKILL_NAME);
  mkdirSync(skillRoot, { recursive: true });
  writeFileSync(
    join(skillRoot, ".cursor-curator-port.json"),
    `${JSON.stringify({ repoRoot })}\n`,
    "utf8",
  );
  const found = resolveReinstallRepoRoot(skillRoot, tempHome);
  assert.equal(found, repoRoot);
});

test("cleanCursorCuratorInstall removes only installed skill copies", () => {
  const tempHome = mkdtempSync(join(tmpdir(), "curator-clean-"));
  const skillsDir = join(tempHome, "skills");
  const installedRoot = join(skillsDir, SKILL_NAME);
  const repoSkillRoot = join(repoRoot, SKILL_NAME);
  mkdirSync(join(skillsDir, "curator-prep"), { recursive: true });
  mkdirSync(installedRoot, { recursive: true });
  writeFileSync(join(installedRoot, "install.json"), '{"agents":[],"commands":[]}\n', "utf8");

  const removed = cleanCursorCuratorInstall({
    cursorHome: tempHome,
    quiet: true,
  });

  assert.ok(removed.some((entry) => entry.includes("curator-prep")));
  assert.ok(removed.some((entry) => entry.includes(SKILL_NAME)));
  assert.ok(existsSync(repoSkillRoot), "repo source tree must not be deleted");
});
