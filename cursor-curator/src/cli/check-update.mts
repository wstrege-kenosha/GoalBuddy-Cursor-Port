import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageName = "cursor-curator";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(scriptDir, "../..");
const versionInfoPath = join(skillRoot, "version.json");
const cliPath = join(skillRoot, "dist", "cli", "curator.mjs");

export interface UpdateReport {
  package: string;
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
  check_status: string;
  update_command: string;
  cursor_port: {
    name: string;
    cursor_port_version: string | null;
    upstream_version: string | null;
    upstream_url: string | null;
  } | null;
  error?: string;
}

export function buildUpdateReport(): UpdateReport {
  const report: UpdateReport = {
    package: packageName,
    current_version: findCurrentVersion(),
    latest_version: null,
    update_available: false,
    check_status: "unknown",
    update_command: `node ${cliPath.replace(/\\/g, "/")} update`,
    cursor_port: readCursorPortInfo(),
  };

  try {
    report.latest_version = latestPublishedVersion();
    report.update_available = compareVersions(report.current_version, report.latest_version) < 0;
    report.check_status = "ok";
  } catch (error) {
    report.check_status = "unavailable";
    report.error = error instanceof Error ? error.message : String(error);
  }

  return report;
}

export function runCheckUpdate(argv: string[] = []): number {
  const report = buildUpdateReport();

  if (argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else if (report.check_status !== "ok") {
    console.log(`Cursor Curator update check unavailable: ${report.error}`);
  } else if (report.update_available) {
    console.log(`Cursor Curator ${report.latest_version} is available; installed version is ${report.current_version}.`);
    console.log(`Update with: ${report.update_command}`);
  } else {
    console.log(`Cursor Curator is up to date (${report.current_version}).`);
  }

  return 0;
}

function findCurrentVersion(): string {
  const versionJson = readJson(versionInfoPath);
  if (versionJson?.upstreamVersion) return normalizeVersion(versionJson.upstreamVersion);

  const candidates = [
    join(skillRoot, ".cursor-curator-install.json"),
    join(skillRoot, "..", "..", "..", ".codex-plugin", "plugin.json"),
    join(skillRoot, "..", "package.json"),
  ];

  for (const path of candidates) {
    const data = readJson(path);
    const version = data?.package_version || data?.version;
    if (version) return normalizeVersion(version);
  }

  return "0.0.0";
}

function readCursorPortInfo(): UpdateReport["cursor_port"] {
  const versionJson = readJson(versionInfoPath);
  if (!versionJson) return null;
  return {
    name: String(versionJson.name || "cursor-curator-cursor"),
    cursor_port_version: versionJson.cursorPortVersion ? String(versionJson.cursorPortVersion) : null,
    upstream_version: versionJson.upstreamVersion ? String(versionJson.upstreamVersion) : null,
    upstream_url: versionJson.upstreamUrl ? String(versionJson.upstreamUrl) : null,
  };
}

function latestPublishedVersion(): string {
  if (process.env.CURATOR_TEST_NPM_LATEST_VERSION) {
    return normalizeVersion(process.env.CURATOR_TEST_NPM_LATEST_VERSION);
  }

  const result = spawnSync("npm", ["view", packageName, "version"], {
    cwd: skillRoot,
    encoding: "utf8",
    timeout: 5000,
    env: {
      ...process.env,
      npm_config_update_notifier: "false",
    },
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = `${result.stderr || ""}${result.stdout || ""}`.trim();
    throw new Error(output || `npm view exited with status ${result.status}`);
  }

  return normalizeVersion(result.stdout);
}

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeVersion(value: unknown): string {
  const match = String(value).trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) throw new Error(`Unsupported version: ${value}`);
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

function compareVersions(left: string, right: string): number {
  const leftParts = normalizeVersion(left).split(".").map(Number);
  const rightParts = normalizeVersion(right).split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  process.exit(runCheckUpdate(process.argv.slice(2)));
}
