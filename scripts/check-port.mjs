#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const distCli = join(repoRoot, "cursor-curator", "dist", "cli", "curator.mjs");
const distBoard = join(repoRoot, "cursor-curator", "dist", "board", "objective-board.mjs");

const runtime = process.execPath;

function runBunTests(testFile, label) {
  if (!existsSync(testFile)) return true;
  const tests = spawnSync(runtime, ["test", testFile], {
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
  console.error(`missing compiled CLI: ${distCli} (run bun run build)`);
  failed = true;
}

if (!existsSync(distBoard)) {
  console.error(`missing compiled board module: ${distBoard} (run bun run build)`);
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
if (!runBunTests(boardTestFile, "local-objective-board tests")) failed = true;

const validatorTestFile = join(repoRoot, "cursor-curator", "scripts", "test", "check-objective-state.test.mjs");
if (!runBunTests(validatorTestFile, "check-objective-state tests")) failed = true;

const phaseATestFile = join(repoRoot, "cursor-curator", "scripts", "test", "phase-a-cli.test.mjs");
if (!runBunTests(phaseATestFile, "phase-a cli tests")) failed = true;

const phaseBTestFile = join(repoRoot, "cursor-curator", "scripts", "test", "phase-b-mcp.test.mjs");
if (!runBunTests(phaseBTestFile, "phase-b mcp tests")) failed = true;

const verifyTestFile = join(repoRoot, "cursor-curator", "scripts", "test", "objective-verify.test.mjs");
if (!runBunTests(verifyTestFile, "objective-verify tests")) failed = true;

const repositoryTestFile = join(repoRoot, "cursor-curator", "src", "db", "state-repository.test.mts");
if (!runBunTests(repositoryTestFile, "state-repository tests")) failed = true;

const doctor = spawnSync(runtime, [distCli, "doctor"], {
  cwd: repoRoot,
  encoding: "utf8",
  stdio: "inherit",
});

if (doctor.status !== 0) failed = true;

const seedSmoke = spawnSync(
  runtime,
  [
    "-e",
    `import { importObjectiveFixture } from "./cursor-curator/dist/db/state-repository.mjs"; importObjectiveFixture(${JSON.stringify(repoRoot)}, "sample-cursor-smoke");`,
  ],
  { cwd: repoRoot, encoding: "utf8", stdio: "inherit" },
);

if (seedSmoke.status !== 0) failed = true;

const checkObjective = spawnSync(
  runtime,
  [distCli, "check-objective", "sample-cursor-smoke", "--json"],
  { cwd: repoRoot, encoding: "utf8", stdio: "inherit" },
);

if (checkObjective.status !== 0) failed = true;

if (failed) {
  process.exit(1);
}
console.log("check-port: all checks passed");
