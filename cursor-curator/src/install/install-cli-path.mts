import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, normalize, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const PATH_MARKER_START = "# >>> cursor-curator PATH >>>";
export const PATH_MARKER_END = "# <<< cursor-curator PATH <<<";

export interface EnsureCliPathResult {
  ok: boolean;
  skipped?: boolean;
  alreadyPresent?: boolean;
  persisted?: boolean;
  binDir: string;
  message: string;
}

export function normalizePathEntry(entry: string): string {
  const trimmed = entry.trim().replace(/^["']|["']$/g, "");
  if (!trimmed) {
    return "";
  }
  try {
    return normalize(resolve(trimmed)).toLowerCase();
  } catch {
    return normalize(trimmed).toLowerCase();
  }
}

export function isPathEntryPresent(pathEnv: string, binDir: string): boolean {
  const target = normalizePathEntry(binDir);
  if (!target) {
    return false;
  }
  return pathEnv
    .split(delimiter)
    .some((entry) => normalizePathEntry(entry) === target);
}

export function buildUnixPathExportLine(binDir: string): string {
  const escaped = binDir.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `export PATH="${escaped}:$PATH"`;
}

export function buildPathMarkerBlock(binDir: string): string {
  return `${PATH_MARKER_START}\n${buildUnixPathExportLine(binDir)}\n${PATH_MARKER_END}`;
}

export function primaryUnixShellRc(home = homedir()): string {
  if (process.platform === "darwin") {
    return join(home, ".zshrc");
  }
  const shell = process.env.SHELL ?? "";
  if (shell.includes("zsh")) {
    return join(home, ".zshrc");
  }
  if (shell.includes("bash")) {
    return join(home, ".bashrc");
  }
  return join(home, ".profile");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function upsertUnixShellRc(rcPath: string, block: string, binDir: string): "updated" | "already" | "created" {
  if (!existsSync(rcPath)) {
    writeFileSync(rcPath, `${block}\n`, "utf8");
    return "created";
  }

  const content = readFileSync(rcPath, "utf8");
  const markerPattern = new RegExp(
    `${escapeRegExp(PATH_MARKER_START)}[\\s\\S]*?${escapeRegExp(PATH_MARKER_END)}`,
    "m",
  );

  if (markerPattern.test(content)) {
    const existing = content.match(markerPattern)?.[0];
    if (existing === block) {
      return "already";
    }
    const next = content.replace(markerPattern, block);
    writeFileSync(rcPath, next.endsWith("\n") ? next : `${next}\n`, "utf8");
    return "updated";
  }

  writeFileSync(rcPath, content.endsWith("\n") ? `${content}${block}\n` : `${content}\n${block}\n`, "utf8");
  return "updated";
}

export function buildNormalizedWindowsUserPath(
  current: string,
  options: { prepend?: string } = {},
): string {
  const seen = new Set<string>();
  const segments: string[] = [];
  const prependKey = options.prepend ? normalizePathEntry(options.prepend) : "";

  const add = (entry: string): void => {
    const trimmed = entry.trim();
    if (!trimmed) {
      return;
    }
    const resolved = normalize(resolve(trimmed));
    const key = normalizePathEntry(resolved);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    segments.push(resolved);
  };

  if (options.prepend) {
    add(options.prepend);
  }

  for (const entry of current.split(";")) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    if (prependKey && normalizePathEntry(trimmed) === prependKey) {
      continue;
    }
    add(trimmed);
  }

  return segments.join(";");
}

export function buildWindowsPathSessionRefreshCommand(): string {
  return "$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')";
}

export function buildDirectCliInvokeHint(binDir: string): string {
  const cliName = process.platform === "win32" ? "curator.cmd" : "curator";
  return `& "${join(binDir, cliName)}" doctor`;
}

export function prependProcessPath(binDir: string): void {
  if (!isPathEntryPresent(process.env.PATH ?? "", binDir)) {
    process.env.PATH = `${binDir}${delimiter}${process.env.PATH ?? ""}`;
  }
}

export function appendGitHubActionsPath(binDir: string): boolean {
  const githubPathFile = process.env.GITHUB_PATH;
  if (!githubPathFile) {
    return false;
  }

  const resolved = resolve(binDir);
  const existing = existsSync(githubPathFile) ? readFileSync(githubPathFile, "utf8") : "";
  const alreadyListed = existing
    .split(/\r?\n/)
    .some((line) => normalizePathEntry(line) === normalizePathEntry(resolved));
  if (alreadyListed) {
    return false;
  }

  appendFileSync(githubPathFile, `${resolved}\n`, "utf8");
  return true;
}

function readWindowsUserPath(): string {
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-Command", "[Environment]::GetEnvironmentVariable('Path','User')"],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) {
    return "";
  }
  return result.stdout?.trim() ?? "";
}

function writeWindowsUserPath(pathValue: string): boolean {
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "[Environment]::SetEnvironmentVariable('Path', $env:CURATOR_USER_PATH, 'User')",
    ],
    {
      encoding: "utf8",
      windowsHide: true,
      env: { ...process.env, CURATOR_USER_PATH: pathValue },
    },
  );
  return result.status === 0;
}

function ensureWindowsUserPath(binDir: string): EnsureCliPathResult {
  const current = readWindowsUserPath();
  const next = buildNormalizedWindowsUserPath(current, { prepend: binDir });
  const alreadyPresent = isPathEntryPresent(current, binDir);

  if (alreadyPresent) {
    if (next !== current) {
      if (!writeWindowsUserPath(next)) {
        return {
          ok: false,
          binDir,
          message: `Could not normalize User PATH. Add ${binDir} manually.`,
        };
      }
      return {
        ok: true,
        alreadyPresent: true,
        persisted: true,
        binDir,
        message: `User PATH already includes ${binDir} (normalized entries)`,
      };
    }
    return {
      ok: true,
      alreadyPresent: true,
      persisted: false,
      binDir,
      message: `User PATH already includes ${binDir}`,
    };
  }

  if (!writeWindowsUserPath(next)) {
    return {
      ok: false,
      binDir,
      message: `Could not update User PATH. Add ${binDir} manually.`,
    };
  }

  return {
    ok: true,
    alreadyPresent: false,
    persisted: true,
    binDir,
    message: `Added ${binDir} to User PATH`,
  };
}

function ensureUnixUserPath(binDir: string): EnsureCliPathResult {
  const rcPath = primaryUnixShellRc();
  const block = buildPathMarkerBlock(binDir);
  const action = upsertUnixShellRc(rcPath, block, binDir);

  if (action === "already") {
    return {
      ok: true,
      alreadyPresent: true,
      persisted: false,
      binDir,
      message: `Shell init already includes ${binDir} (${rcPath})`,
    };
  }

  return {
    ok: true,
    alreadyPresent: false,
    persisted: true,
    binDir,
    message: action === "created"
      ? `Created ${rcPath} with ${binDir} on PATH`
      : `Updated ${rcPath} with ${binDir} on PATH`,
  };
}

export function ensureCliOnPath(binDir: string, options: { enabled?: boolean } = {}): EnsureCliPathResult {
  const resolved = resolve(binDir);
  const enabled = options.enabled !== false;

  if (!enabled) {
    return {
      ok: true,
      skipped: true,
      binDir: resolved,
      message: "Skipped PATH update (--no-add-to-path).",
    };
  }

  prependProcessPath(resolved);
  appendGitHubActionsPath(resolved);

  if (process.platform === "win32") {
    return ensureWindowsUserPath(resolved);
  }

  return ensureUnixUserPath(resolved);
}
