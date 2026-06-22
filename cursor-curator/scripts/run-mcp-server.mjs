#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveMcpRepoRoot } from "./install-mcp.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(__dirname, "..");
process.env.CURATOR_SKILL_ROOT = skillRoot;

const repoRoot = resolveMcpRepoRoot(skillRoot);
const serverPath = join(repoRoot, "cursor-curator", "mcp", "server.mjs");

if (!existsSync(serverPath)) {
  console.error(`cursor-curator MCP: server not found at ${serverPath}`);
  process.exit(1);
}

await import(pathToFileURL(serverPath).href);
