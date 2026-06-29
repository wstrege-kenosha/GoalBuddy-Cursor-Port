#!/usr/bin/env bun
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

const runtime = process.execPath;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  return result.status ?? 1;
}

function ensureRepoDeps() {
  const sdkPath = join(repoRoot, "node_modules", "@modelcontextprotocol", "sdk");
  const zodPath = join(repoRoot, "node_modules", "zod");
  if (existsSync(sdkPath) && existsSync(zodPath)) {
    return 0;
  }
  console.log("Installing repo dependencies (bun install)...");
  return run(runtime, ["install"], { cwd: repoRoot });
}

function ensureDistBuild() {
  const distCli = join(repoRoot, "cursor-curator", "dist", "cli", "curator.mjs");
  if (existsSync(distCli)) {
    return 0;
  }
  console.log("Building TypeScript dist (bun run build)...");
  return run(runtime, ["run", "build"], { cwd: repoRoot });
}

mkdirSync(skillsDir, { recursive: true });

const legacyPrepSkill = join(skillsDir, "curator-prep");
if (existsSync(legacyPrepSkill)) {
  rmSync(legacyPrepSkill, { recursive: true, force: true });
  console.log(`removed legacy skill ${legacyPrepSkill}`);
}

let status = ensureRepoDeps();
if (status !== 0) process.exit(status);

status = ensureDistBuild();
if (status !== 0) process.exit(status);

for (const { name, src } of trees) {
  if (!existsSync(src)) {
    console.error(`Missing vendored tree: ${src}`);
    process.exit(1);
  }
  const dest = join(skillsDir, name);
  cpSync(src, dest, { recursive: true, force: true });
  console.log(`copied ${name} -> ${dest}`);
}

const skillRoot = join(skillsDir, "cursor-curator");
const skillPackageJson = join(skillRoot, "package.json");
if (existsSync(skillPackageJson)) {
  console.log("Installing skill-only dependencies (zod, MCP SDK)...");
  status = run(runtime, ["install", "--production"], { cwd: skillRoot });
  if (status !== 0) {
    console.error("Skill dependency install failed. Ensure bun is on PATH.");
    process.exit(status);
  }
}

const curatorCli = join(skillRoot, "dist", "cli", "curator.mjs");
if (!existsSync(curatorCli)) {
  console.error(`Install copy incomplete: ${curatorCli}`);
  process.exit(1);
}

const installArgs = ["install", ...process.argv.slice(2)];
const install = spawnSync(process.execPath, [curatorCli, ...installArgs], {
  stdio: "inherit",
  env: { ...process.env, CURSOR_HOME: cursorHome, CURATOR_REPO_ROOT: repoRoot },
});

if (install.status !== 0) {
  process.exit(install.status ?? 1);
}

console.log("Cursor Curator install finished.");
