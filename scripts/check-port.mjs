#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const distCli = join(repoRoot, "cursor-curator", "dist", "cli", "curator.mjs");
const distBoard = join(repoRoot, "cursor-curator", "dist", "board", "objective-board.mjs");

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

let failed = false;

if (!existsSync(distCli)) {
  console.error(`missing compiled CLI: ${distCli} (run npm run build)`);
  failed = true;
}

if (!existsSync(distBoard)) {
  console.error(`missing compiled board module: ${distBoard} (run npm run build)`);
  failed = true;
} else {
  console.log("board module ok (dist/board/objective-board.mjs present)");
}

const boardTestFile = join(
  repoRoot,
  "cursor-curator",
  "surfaces",
  "local-objective-board",
  "test",
  "local-objective-board.test.mjs",
);
if (!runNodeTests(boardTestFile, "local-objective-board tests")) failed = true;

const validatorTestFile = join(repoRoot, "cursor-curator", "scripts", "test", "check-objective-state.test.mjs");
if (!runNodeTests(validatorTestFile, "check-objective-state tests")) failed = true;

const phaseATestFile = join(repoRoot, "cursor-curator", "scripts", "test", "phase-a-cli.test.mjs");
if (!runNodeTests(phaseATestFile, "phase-a cli tests")) failed = true;

const phaseBTestFile = join(repoRoot, "cursor-curator", "scripts", "test", "phase-b-mcp.test.mjs");
if (!runNodeTests(phaseBTestFile, "phase-b mcp tests")) failed = true;

const verifyTestFile = join(repoRoot, "cursor-curator", "scripts", "test", "objective-verify.test.mjs");
if (!runNodeTests(verifyTestFile, "objective-verify tests")) failed = true;

const doctor = spawnSync(process.execPath, [distCli, "doctor"], {
  cwd: repoRoot,
  encoding: "utf8",
  stdio: "inherit",
});

if (doctor.status !== 0) failed = true;

const smoke = spawnSync(
  process.execPath,
  [
    distCli,
    "check-state",
    join(repoRoot, "docs", "objectives", "sample-cursor-smoke", "state.json"),
    "--json",
  ],
  { cwd: repoRoot, encoding: "utf8", stdio: "inherit" },
);

if (smoke.status !== 0) failed = true;

if (failed) process.exit(1);
console.log("check-port: all checks passed");
