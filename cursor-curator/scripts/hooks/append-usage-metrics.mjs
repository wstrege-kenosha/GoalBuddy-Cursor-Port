#!/usr/bin/env bun
import { appendSessionNote } from "../../dist/session/objective-session.mjs";
import { processHookUsage, readHookPayload } from "../../dist/usage/objective-usage.mjs";

const payload = readHookPayload();
const usageResult = processHookUsage(payload);

let sessionResult = null;
const hookName = typeof payload.hook_event_name === "string" ? payload.hook_event_name : "stop";

if (hookName === "stop") {
  const workspaceRoot =
    (Array.isArray(payload.workspace_roots) && typeof payload.workspace_roots[0] === "string"
      ? payload.workspace_roots[0]
      : null)
    || (typeof payload.cwd === "string" ? payload.cwd : null)
    || process.cwd();

  sessionResult = appendSessionNote({
    workspaceRoot,
    summary: payload.summary || payload.status || "Agent session ended",
    task_id: typeof payload.task_id === "string" ? payload.task_id : undefined,
    objective_slug: typeof payload.objective_slug === "string" ? payload.objective_slug : undefined,
  });
}

process.stdout.write(JSON.stringify({ usage: usageResult, session: sessionResult }));
