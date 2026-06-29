import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

import { CLI_NAME } from "../lib/brand.mjs";

export const CLI_BIN_DIR_NAME = "bin";
export const CLI_BIN_NAME = CLI_NAME;

function toPosixPath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function resolveCliBinDir(cursorHome: string): string {
  return join(resolve(cursorHome || join(homedir(), ".cursor")), CLI_BIN_DIR_NAME);
}

export function resolveCuratorCliPath(skillRoot: string): string {
  return join(resolve(skillRoot), "dist", "cli", "curator.mjs");
}

export function buildCliBinShim({ skillRoot }: { cursorHome?: string; skillRoot: string }): string {
  const cliPath = toPosixPath(resolveCuratorCliPath(skillRoot));
  return `#!/usr/bin/env sh
exec node "${cliPath}" "$@"
`;
}

export function buildCliBinCmd({ skillRoot }: { cursorHome?: string; skillRoot: string }): string {
  const cliPath = resolveCuratorCliPath(skillRoot);
  return `@echo off\r\nnode "${cliPath}" %*\r\n`;
}

export function installCliBin({ cursorHome, skillRoot }: { cursorHome: string; skillRoot: string }) {
  const binDir = resolveCliBinDir(cursorHome);
  const cliPath = resolveCuratorCliPath(skillRoot);
  if (!existsSync(cliPath)) {
    return { ok: false as const, error: `missing CLI: ${cliPath}` };
  }

  mkdirSync(binDir, { recursive: true });
  const shPath = join(binDir, CLI_BIN_NAME);
  const cmdPath = join(binDir, `${CLI_BIN_NAME}.cmd`);
  writeFileSync(shPath, buildCliBinShim({ cursorHome, skillRoot }), "utf8");
  writeFileSync(cmdPath, buildCliBinCmd({ cursorHome, skillRoot }), "utf8");

  return {
    ok: true as const,
    binDir,
    shPath,
    cmdPath,
    cliPath,
    pathHint: `curator is installed at ${binDir}. Re-run npm run install:cursor (or node dist/cli/curator.mjs install) with --no-add-to-path to skip automatic PATH updates.`,
  };
}
