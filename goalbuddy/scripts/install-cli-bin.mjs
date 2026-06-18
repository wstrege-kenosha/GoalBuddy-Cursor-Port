import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

export const CLI_BIN_DIR_NAME = "bin";
export const CLI_BIN_NAME = "goalbuddy";

function toPosixPath(path) {
  return path.replace(/\\/g, "/");
}

export function resolveCliBinDir(cursorHome) {
  return join(resolve(cursorHome || join(homedir(), ".cursor")), CLI_BIN_DIR_NAME);
}

export function resolveGoalbuddyCliPath(skillRoot) {
  return join(resolve(skillRoot), "scripts", "goalbuddy.mjs");
}

export function buildCliBinShim({ cursorHome, skillRoot }) {
  const cliPath = toPosixPath(resolveGoalbuddyCliPath(skillRoot));
  return `#!/usr/bin/env sh
exec node "${cliPath}" "$@"
`;
}

export function buildCliBinCmd({ cursorHome, skillRoot }) {
  const cliPath = resolveGoalbuddyCliPath(skillRoot);
  return `@echo off\r\nnode "${cliPath}" %*\r\n`;
}

export function installCliBin({ cursorHome, skillRoot }) {
  const binDir = resolveCliBinDir(cursorHome);
  const cliPath = resolveGoalbuddyCliPath(skillRoot);
  if (!existsSync(cliPath)) {
    return { ok: false, error: `missing CLI: ${cliPath}` };
  }

  mkdirSync(binDir, { recursive: true });
  const shPath = join(binDir, CLI_BIN_NAME);
  const cmdPath = join(binDir, `${CLI_BIN_NAME}.cmd`);
  writeFileSync(shPath, buildCliBinShim({ cursorHome, skillRoot }), "utf8");
  writeFileSync(cmdPath, buildCliBinCmd({ cursorHome, skillRoot }), "utf8");

  return {
    ok: true,
    binDir,
    shPath,
    cmdPath,
    cliPath,
    pathHint: `Add ${binDir} to your PATH, then run: goalbuddy doctor | goalbuddy board docs/goals/<slug>`,
  };
}
