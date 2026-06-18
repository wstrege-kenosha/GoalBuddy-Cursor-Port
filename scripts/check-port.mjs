#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const CANONICAL_BOARD = join(
  repoRoot,
  "goalbuddy",
  "surfaces",
  "local-goal-board",
  "scripts",
  "lib",
  "goal-board.mjs",
);
const RUNTIME_BOARD_REEXPORT = join(repoRoot, "goalbuddy", "scripts", "lib", "goal-board.mjs");
const EXPECTED_BOARD_REEXPORT = 'export * from "../../surfaces/local-goal-board/scripts/lib/goal-board.mjs";\n';

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

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function verifyBoardModuleLayout() {
  if (!existsSync(CANONICAL_BOARD)) {
    console.error(`missing canonical board module: ${CANONICAL_BOARD}`);
    return false;
  }

  const runtimeText = readFileSync(RUNTIME_BOARD_REEXPORT, "utf8").replace(/\r\n/g, "\n");
  const expected = EXPECTED_BOARD_REEXPORT;
  if (runtimeText !== expected) {
    console.error("goalbuddy/scripts/lib/goal-board.mjs must re-export the canonical surfaces board module");
    return false;
  }

  console.log(`board module ok (canonical sha256 ${hashFile(CANONICAL_BOARD).slice(0, 12)}…)`);
  return true;
}

function runNodeTests(testFile, label) {
  if (!existsSync(testFile)) return true;
  const tests = spawnSync(process.execPath, ["--test", testFile], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (tests.status !== 0) {
    console.error(`${label} failed`);
    return false;
  }
  return true;
}

const roots = [
  join(repoRoot, "scripts"),
  join(repoRoot, "goalbuddy"),
  join(repoRoot, "goal-prep"),
];

const mjsFiles = roots.flatMap((root) => collectMjs(root));
let failed = false;

if (!verifyBoardModuleLayout()) failed = true;

for (const file of mjsFiles) {
  const r = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (r.status !== 0) {
    failed = true;
    console.error(`syntax check failed: ${file}`);
    if (r.stderr) console.error(r.stderr.trim());
  }
}

console.log(`syntax ok (${mjsFiles.length} .mjs files)`);

const boardTestFile = join(
  repoRoot,
  "goalbuddy",
  "surfaces",
  "local-goal-board",
  "test",
  "local-goal-board.test.mjs",
);
if (!runNodeTests(boardTestFile, "local-goal-board tests")) failed = true;

const validatorTestFile = join(repoRoot, "goalbuddy", "scripts", "test", "check-goal-state.test.mjs");
if (!runNodeTests(validatorTestFile, "check-goal-state tests")) failed = true;

const doctor = spawnSync(
  process.execPath,
  [join(repoRoot, "goalbuddy", "scripts", "goalbuddy.mjs"), "doctor"],
  { cwd: repoRoot, encoding: "utf8", stdio: "inherit" },
);

if (doctor.status !== 0) failed = true;

const smoke = spawnSync(
  process.execPath,
  [
    join(repoRoot, "goalbuddy", "scripts", "check-goal-state.mjs"),
    join(repoRoot, "docs", "goals", "sample-cursor-smoke", "state.yaml"),
  ],
  { cwd: repoRoot, encoding: "utf8", stdio: "inherit" },
);

if (smoke.status !== 0) failed = true;

if (failed) process.exit(1);
console.log("check-port: all checks passed");
