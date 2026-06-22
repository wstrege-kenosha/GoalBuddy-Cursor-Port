#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const cursorHome = resolve(process.env.CURSOR_HOME || join(homedir(), ".cursor"));
const skillsDir = join(cursorHome, "skills");

const trees = [
  { name: "cursor-curator", src: join(repoRoot, "cursor-curator") },
  { name: "objective-prep", src: join(repoRoot, "objective-prep") },
];

mkdirSync(skillsDir, { recursive: true });

const legacyPrepSkill = join(skillsDir, "curator-prep");
if (existsSync(legacyPrepSkill)) {
  rmSync(legacyPrepSkill, { recursive: true, force: true });
  console.log(`removed legacy skill ${legacyPrepSkill}`);
}

for (const { name, src } of trees) {
  if (!existsSync(src)) {
    console.error(`Missing vendored tree: ${src}`);
    process.exit(1);
  }
  const dest = join(skillsDir, name);
  cpSync(src, dest, { recursive: true, force: true });
  console.log(`copied ${name} -> ${dest}`);
}

const curatorCli = join(skillsDir, "cursor-curator", "scripts", "curator.mjs");
if (!existsSync(curatorCli)) {
  console.error(`Install copy incomplete: ${curatorCli}`);
  process.exit(1);
}

const install = spawnSync(process.execPath, [curatorCli, "install"], {
  stdio: "inherit",
  env: { ...process.env, CURSOR_HOME: cursorHome, CURATOR_REPO_ROOT: repoRoot },
});

if (install.status !== 0) {
  process.exit(install.status ?? 1);
}

console.log("Cursor Curator install finished.");
