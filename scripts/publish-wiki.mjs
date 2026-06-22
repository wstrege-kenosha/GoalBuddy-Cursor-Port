#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "..");
const wikiSrc = join(repoRoot, "docs", "wiki");
const owner = process.env.GITHUB_WIKI_OWNER || "wstrege-kenosha";
const repo = process.env.GITHUB_WIKI_REPO || "Cursor-Curator";
const wikiUrl = `https://github.com/${owner}/${repo}.wiki.git`;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: node scripts/publish-wiki.mjs

Copies docs/wiki/*.md into a clone of ${wikiUrl} and pushes.

If the wiki git repo does not exist yet, create the first page on GitHub:
  https://github.com/${owner}/${repo}/wiki
then re-run this script.

Env: GITHUB_WIKI_OWNER, GITHUB_WIKI_REPO`);
  process.exit(0);
}

if (!existsSync(wikiSrc)) {
  console.error(`Missing ${wikiSrc}`);
  process.exit(1);
}

const workDir = join(tmpdir(), `${repo}-wiki-publish`);
rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });

let clone = spawnSync("git", ["clone", wikiUrl, workDir], { encoding: "utf8" });
if (clone.status !== 0) {
  console.error(clone.stderr || clone.stdout || "git clone failed");
  console.error(
    "\nWiki git repo may not exist yet. Open the wiki in GitHub, click 'Create the first page', save Home, then retry.",
  );
  process.exit(1);
}

for (const name of readdirSync(wikiSrc)) {
  if (!name.endsWith(".md")) continue;
  cpSync(join(wikiSrc, name), join(workDir, name), { force: true });
}

spawnSync("git", ["add", "-A"], { cwd: workDir, stdio: "inherit" });
const status = spawnSync("git", ["status", "--porcelain"], { cwd: workDir, encoding: "utf8" });
if (!status.stdout?.trim()) {
  console.log("Wiki clone already matches docs/wiki; nothing to commit.");
  process.exit(0);
}

const commit = spawnSync(
  "git",
  ["commit", "-m", "docs: sync wiki from docs/wiki"],
  { cwd: workDir, stdio: "inherit" },
);
if (commit.status !== 0) process.exit(commit.status ?? 1);

const push = spawnSync("git", ["push", "origin", "master"], {
  cwd: workDir,
  stdio: "inherit",
});
if (push.status !== 0) {
  spawnSync("git", ["push", "origin", "main"], { cwd: workDir, stdio: "inherit" });
}

console.log(`Wiki published: https://github.com/${owner}/${repo}/wiki`);
