#!/usr/bin/env node
import { appendSessionNote } from "../lib/goal-session.mjs";

const input = process.env.CURSOR_HOOK_INPUT || "";
let payload = {};
try {
  payload = input ? JSON.parse(input) : {};
} catch {
  payload = {};
}

const cwd = payload.cwd || process.cwd();
const result = appendSessionNote({
  workspaceRoot: cwd,
  summary: payload.summary || payload.status || "Agent session ended",
  task_id: payload.task_id,
  objective_slug: payload.objective_slug,
});

process.stdout.write(JSON.stringify(result));
