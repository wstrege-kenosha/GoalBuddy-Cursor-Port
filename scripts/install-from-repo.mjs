#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const cursorHome = resolve(process.env.CURSOR_HOME || join(homedir(), ".cursor"));
const skillsDir = join(cursorHome, "skills");

const trees = [
  { name: "goalbuddy", src: join(repoRoot, "goalbuddy") },
  { name: "goal-prep", src: join(repoRoot, "goal-prep") },
];

mkdirSync(skillsDir, { recursive: true });

for (const { name, src } of trees) {
  if (!existsSync(src)) {
    console.error(`Missing vendored tree: ${src}`);
    process.exit(1);
  }
  const dest = join(skillsDir, name);
  cpSync(src, dest, { recursive: true, force: true });
  console.log(`copied ${name} -> ${dest}`);
}

const goalbuddyCli = join(skillsDir, "goalbuddy", "scripts", "goalbuddy.mjs");
if (!existsSync(goalbuddyCli)) {
  console.error(`Install copy incomplete: ${goalbuddyCli}`);
  process.exit(1);
}

const install = spawnSync(process.execPath, [goalbuddyCli, "install"], {
  stdio: "inherit",
  env: { ...process.env, CURSOR_HOME: cursorHome, GOALBUDDY_REPO_ROOT: repoRoot },
});

if (install.status !== 0) {
  process.exit(install.status ?? 1);
}

console.log("GoalBuddy Cursor port install finished.");
