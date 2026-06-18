#!/usr/bin/env node
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOL_HANDLERS } from "./tools.mjs";

const workspaceRootSchema = z.string().optional().describe("Open workspace root when known (e.g. W:\\\\Experimental\\\\GoalBuddyCursorPort). Usually omitted; GoalBuddy resolves from goal slug.");

const __dirname = dirname(fileURLToPath(import.meta.url));
const versionInfo = JSON.parse(readFileSync(join(__dirname, "..", "version.json"), "utf8"));

const server = new McpServer(
  {
    name: "goalbuddy",
    version: versionInfo.cursorPortVersion || "1.0.0",
  },
  {
    instructions: [
      "GoalBuddy MCP exposes read-only goal board tools for Cursor PM and subagents.",
      "Workspace is resolved from the goal slug across Cursor workspace env vars and registered project roots.",
      "Call validate_state before advancing state.yaml.",
      "Call render_task_prompt before spawning Task subagents.",
      "Call validate_receipt before writing receipts into state.yaml.",
      "This server does not mutate state.yaml or spawn agents.",
    ].join(" "),
  },
);

function registerJsonTool(name, description, inputSchema, handler) {
  server.registerTool(
    name,
    {
      description,
      inputSchema,
    },
    async (args) => {
      try {
        const result = handler(args || {});
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: error.message }],
        };
      }
    },
  );
}

registerJsonTool(
  "list_goals",
  "List goals under docs/goals/ with status, active task, oracle health, and optional staleness.",
  {
    stale_days: z.number().int().positive().optional().describe("When set, include stale report for goals idle this many days."),
    workspace_root: workspaceRootSchema,
  },
  TOOL_HANDLERS.list_goals,
);

registerJsonTool(
  "get_goal_state",
  "Read and parse a goal state.yaml into structured JSON plus validation summary.",
  {
    goal: z.string().describe("Goal slug (sample-cursor-smoke) or path under docs/goals/."),
    workspace_root: workspaceRootSchema,
  },
  TOOL_HANDLERS.get_goal_state,
);

registerJsonTool(
  "get_active_task",
  "Return active_task and the matching task row from state.yaml.",
  {
    goal: z.string().describe("Goal slug or path under docs/goals/."),
    task_id: z.string().regex(/^T\d{3}$/).optional().describe("Optional task id; defaults to active_task."),
    workspace_root: workspaceRootSchema,
  },
  TOOL_HANDLERS.get_active_task,
);

registerJsonTool(
  "validate_state",
  "Run GoalBuddy state validation (same logic as check-goal-state.mjs). Stop PM advance when ok is false.",
  {
    goal: z.string().describe("Goal slug or path under docs/goals/."),
    workspace_root: workspaceRootSchema,
  },
  TOOL_HANDLERS.validate_state,
);

registerJsonTool(
  "render_task_prompt",
  "Render the canonical Task handoff prompt for the active or specified task.",
  {
    goal: z.string().describe("Goal slug or path under docs/goals/."),
    task_id: z.string().regex(/^T\d{3}$/).optional().describe("Optional task id; defaults to active_task."),
    workspace_root: workspaceRootSchema,
  },
  TOOL_HANDLERS.render_task_prompt,
);

registerJsonTool(
  "parallel_plan",
  "Parallel safety report with spawn_plan hints for disjoint Workers.",
  {
    goal: z.string().describe("Goal slug or path under docs/goals/."),
    workspace_root: workspaceRootSchema,
  },
  TOOL_HANDLERS.parallel_plan,
);

registerJsonTool(
  "validate_receipt",
  "Validate goalbuddy_receipt_v1 JSON before PM writes state.yaml.",
  {
    receipt: z.union([z.string(), z.object({}).passthrough()]).optional().describe("Receipt JSON string or object."),
    receipt_file: z.string().optional().describe("Path to a note file containing receipt JSON."),
    role: z.enum(["scout", "judge", "worker"]).optional(),
    task_id: z.string().regex(/^T\d{3}$/).optional(),
  },
  TOOL_HANDLERS.validate_receipt,
);

registerJsonTool(
  "completion_check",
  "Check readiness for goal.status: done (oracle, audit, workers).",
  {
    goal: z.string().describe("Goal slug or path under docs/goals/."),
    workspace_root: workspaceRootSchema,
  },
  TOOL_HANDLERS.completion_check,
);

registerJsonTool(
  "append_session_note",
  "Append a timestamped line to notes/SESSION.md for one or all goals.",
  {
    summary: z.string().describe("Short session summary."),
    goal_slug: z.string().optional().describe("Limit to one goal slug; omit for all goals in workspace."),
    task_id: z.string().regex(/^T\d{3}$/).optional(),
    workspace_root: workspaceRootSchema,
  },
  TOOL_HANDLERS.append_session_note,
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
