#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(__dirname, "..");
const cursorHome = resolve(process.env.CURSOR_HOME || join(homedir(), ".cursor"));
const agentsSrc = join(skillRoot, "agents-src");
const commandsSrc = join(skillRoot, "commands-src");
const agentsDest = join(cursorHome, "agents");
const commandsDest = join(cursorHome, "commands");
const manifestPath = join(skillRoot, "install.json");
const LEGACY_AGENTS = ["goal-scout.md", "goal-approval-gate.md", "goal-worker.md"];
const LEGACY_COMMANDS = ["curator-prep.md"];

export function installCursorSurfaces({ force = false, quiet = false } = {}) {
  const installed = { agents: [], commands: [], errors: [], removed: [] };

  mkdirSync(agentsDest, { recursive: true });
  mkdirSync(commandsDest, { recursive: true });

  for (const file of LEGACY_AGENTS) {
    const legacyPath = join(agentsDest, file);
    if (existsSync(legacyPath)) {
      unlinkSync(legacyPath);
      installed.removed.push(legacyPath);
      if (!quiet) console.log(`removed legacy ${legacyPath}`);
    }
  }

  for (const file of LEGACY_COMMANDS) {
    const legacyPath = join(commandsDest, file);
    if (existsSync(legacyPath)) {
      unlinkSync(legacyPath);
      installed.removed.push(legacyPath);
      if (!quiet) console.log(`removed legacy ${legacyPath}`);
    }
  }

  for (const { src, dest, kind } of [
    { src: agentsSrc, dest: agentsDest, kind: "agents" },
    { src: commandsSrc, dest: commandsDest, kind: "commands" },
  ]) {
    if (!existsSync(src)) {
      installed.errors.push(`missing source: ${src}`);
      continue;
    }
    for (const file of readdirSync(src).filter((f) => f.endsWith(".md"))) {
      const srcPath = join(src, file);
      const destPath = join(dest, file);
      let status = "installed";
      if (existsSync(destPath) && !force) {
        const srcHash = sha256(readFileSync(srcPath));
        const destHash = sha256(readFileSync(destPath));
        if (srcHash !== destHash) {
          if (!quiet) console.log(`skip existing ${destPath} (use --force to overwrite)`);
          status = "skipped";
        } else {
          status = "unchanged";
        }
      } else {
        copyFileSync(srcPath, destPath);
        if (!quiet) console.log(`installed ${destPath}`);
      }
      installed[kind].push({ file, path: destPath, status });
    }
  }

  const manifest = {
    target: "cursor",
    installedAt: new Date().toISOString(),
    cursorHome,
    agents: installed.agents.map((e) => e.path),
    commands: installed.commands.map((e) => e.path),
    skillRoot,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return installed;
}

export function resetCursorSurfaces({ quiet = false } = {}) {
  if (!existsSync(manifestPath)) {
    if (!quiet) console.log("No install.json manifest; nothing to reset.");
    return { removed: [] };
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const paths = [...new Set([...(manifest.agents || []), ...(manifest.commands || [])])];
  const removed = [];
  for (const path of paths) {
    if (existsSync(path)) {
      unlinkSync(path);
      removed.push(path);
      if (!quiet) console.log(`removed ${path}`);
    }
  }
  return { removed, manifest };
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}
