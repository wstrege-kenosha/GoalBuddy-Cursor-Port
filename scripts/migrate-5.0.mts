#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { convertStateYamlV2TextToV3 } from "./migrate/yaml-v2.mts";

const scriptPath = fileURLToPath(import.meta.url);

function ensureTsxBootstrap(): void {
  if (process.env.CURATOR_MIGRATE_50_BOOTSTRAPPED === "1") {
    return;
  }

  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", scriptPath, ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: { ...process.env, CURATOR_MIGRATE_50_BOOTSTRAPPED: "1" },
    },
  );

  process.exit(result.status ?? 1);
}

export interface MigrateObjectiveResult {
  objective_dir: string;
  source: string;
  target: string;
  dry_run: boolean;
  written: boolean;
  changes: string[];
}

export function migrateObjectiveDir(
  objectiveDir: string,
  options: { dryRun?: boolean } = {},
): MigrateObjectiveResult {
  const root = resolve(objectiveDir);
  const source = join(root, "state.yaml");
  const target = join(root, "state.json");
  const dryRun = options.dryRun === true;
  const changes: string[] = [];

  if (!existsSync(source)) {
    throw new Error(`Missing state.yaml in ${root}`);
  }

  const yamlText = readFileSync(source, "utf8");
  const converted = convertStateYamlV2TextToV3(yamlText);
  const document =
    typeof converted === "object" && converted !== null
      ? (converted as Record<string, unknown>)
      : {};

  if (document.version !== 3) {
    throw new Error(`Expected migrated document version 3; got ${String(document.version)}`);
  }

  changes.push("state.yaml -> state.json");
  changes.push("version: 2 -> 3");

  const jsonText = `${JSON.stringify(converted, null, 2)}\n`;
  let written = false;

  if (!dryRun) {
    writeFileSync(target, jsonText, "utf8");
    written = true;
    changes.push("wrote state.json");
  } else {
    changes.push("dry run — state.json not written");
  }

  return {
    objective_dir: root,
    source,
    target,
    dry_run: dryRun,
    written,
    changes,
  };
}

function parseArgs(argv: string[]): { dryRun: boolean; paths: string[] } {
  const dryRun = argv.includes("--dry-run");
  const positional = argv.filter((arg) => arg !== "--dry-run");
  return { dryRun, paths: positional };
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const normalized = entry.replace(/\\/g, "/");
  return normalized.endsWith("migrate-5.0.mts");
}

if (isDirectExecution()) {
  ensureTsxBootstrap();

  const { dryRun, paths } = parseArgs(process.argv.slice(2));
  if (paths.length === 0) {
    console.error("Usage: node scripts/migrate-5.0.mts <objective-dir> [--dry-run]");
    process.exit(2);
  }

  const results = paths.map((path) => migrateObjectiveDir(path, { dryRun }));
  console.log(JSON.stringify({ dry_run: dryRun, objectives: results }, null, 2));
  if (dryRun) {
    console.error("\n(dry run — no files written)");
  }
}
