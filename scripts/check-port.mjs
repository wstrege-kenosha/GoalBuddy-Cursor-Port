#!/usr/bin/env node
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function collectMjs(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) collectMjs(path, out);
    else if (name.endsWith(".mjs")) out.push(path);
  }
  return out;
}

const roots = [
  join(repoRoot, "scripts"),
  join(repoRoot, "goalbuddy"),
  join(repoRoot, "goal-prep"),
];

const mjsFiles = roots.flatMap((root) => collectMjs(root));
let failed = false;

for (const file of mjsFiles) {
  const r = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (r.status !== 0) {
    failed = true;
    console.error(`syntax check failed: ${file}`);
    if (r.stderr) console.error(r.stderr.trim());
  }
}

console.log(`syntax ok (${mjsFiles.length} .mjs files)`);

const testFile = join(
  repoRoot,
  "goalbuddy",
  "surfaces",
  "local-goal-board",
  "test",
  "local-goal-board.test.mjs",
);

if (existsSync(testFile)) {
  const tests = spawnSync(process.execPath, ["--test", testFile], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (tests.status !== 0) failed = true;
}

const doctor = spawnSync(
  process.execPath,
  [join(repoRoot, "goalbuddy", "scripts", "goalbuddy.mjs"), "doctor"],
  { cwd: repoRoot, encoding: "utf8", stdio: "inherit" },
);

if (doctor.status !== 0) failed = true;

if (failed) process.exit(1);
console.log("check-port: all checks passed");
