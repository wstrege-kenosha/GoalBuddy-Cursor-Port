import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOL_HANDLERS } from "./tools.mjs";

const workspaceRootSchema = z
  .string()
  .optional()
  .describe(
    "Open workspace root when known (e.g. W:\\\\Experimental\\\\Cursor CuratorCursorPort). Usually omitted; Cursor Curator resolves from objective slug.",
  );

const __dirname = dirname(fileURLToPath(import.meta.url));
const versionInfo = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "version.json"), "utf8"),
) as { cursorPortVersion?: string };

const server = new McpServer(
  {
    name: "cursor-curator",
    version: versionInfo.cursorPortVersion || "1.0.0",
  },
  {
    instructions: [
      "cursor-curator MCP exposes read-only objective board tools for Cursor PM and subagents.",
      "Workspace is resolved from the objective slug across Cursor workspace env vars and registered project roots.",
      "Call validate_state before advancing state.json.",
      "Call render_task_prompt before spawning Task subagents.",
      "Call validate_receipt before writing receipts into state.json.",
      "This server does not mutate state files or spawn agents.",
    ].join(" "),
  },
);

function registerJsonTool(
  name: string,
  description: string,
  inputSchema: Record<string, z.ZodTypeAny>,
  handler: (args: Record<string, unknown>) => unknown,
) {
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
          structuredContent: result as Record<string, unknown>,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        };
      }
    },
  );
}

registerJsonTool(
  "list_objectives",
  "List objectives under docs/objectives/ with status, active task, success criteria health, and optional staleness.",
  {
    stale_days: z.number().int().positive().optional().describe("When set, include stale report for objectives idle this many days."),
    workspace_root: workspaceRootSchema,
  },
  TOOL_HANDLERS.list_objectives,
);

registerJsonTool(
  "get_objective_state",
  "Read and parse an objective state file into structured JSON plus validation summary.",
  {
    objective: z.string().describe("Objective slug (sample-cursor-smoke) or path under docs/objectives/."),
    workspace_root: workspaceRootSchema,
  },
  TOOL_HANDLERS.get_objective_state,
);

registerJsonTool(
  "get_active_task",
  "Return active_task and the matching task row from state.",
  {
    objective: z.string().describe("Objective slug or path under docs/objectives/."),
    task_id: z
      .string()
      .regex(/^T\d{3}$/)
      .optional()
      .describe("Optional task id; defaults to active_task."),
    workspace_root: workspaceRootSchema,
  },
  TOOL_HANDLERS.get_active_task,
);

registerJsonTool(
  "validate_state",
  "Run Cursor Curator state validation (same logic as check-objective-state.mjs). Stop PM advance when ok is false.",
  {
    objective: z.string().describe("Objective slug or path under docs/objectives/."),
    workspace_root: workspaceRootSchema,
  },
  TOOL_HANDLERS.validate_state,
);

registerJsonTool(
  "render_task_prompt",
  "Render the canonical Task handoff prompt for the active or specified task.",
  {
    objective: z.string().describe("Objective slug or path under docs/objectives/."),
    task_id: z
      .string()
      .regex(/^T\d{3}$/)
      .optional()
      .describe("Optional task id; defaults to active_task."),
    workspace_root: workspaceRootSchema,
  },
  TOOL_HANDLERS.render_task_prompt,
);

registerJsonTool(
  "parallel_plan",
  "Parallel safety report with spawn_plan hints for disjoint Workers.",
  {
    objective: z.string().describe("Objective slug or path under docs/objectives/."),
    workspace_root: workspaceRootSchema,
  },
  TOOL_HANDLERS.parallel_plan,
);

registerJsonTool(
  "validate_receipt",
  "Validate cursor_curator_receipt_v1 JSON before PM writes state.",
  {
    receipt: z
      .union([z.string(), z.object({}).passthrough()])
      .optional()
      .describe("Receipt JSON string or object."),
    receipt_file: z.string().optional().describe("Path to a note file containing receipt JSON."),
    role: z.enum(["scout", "approval_gate", "worker"]).optional(),
    task_id: z
      .string()
      .regex(/^T\d{3}$/)
      .optional(),
  },
  TOOL_HANDLERS.validate_receipt,
);

registerJsonTool(
  "completion_check",
  "Check readiness for objective.status: done (success criteria, audit, workers).",
  {
    objective: z.string().describe("Objective slug or path under docs/objectives/."),
    workspace_root: workspaceRootSchema,
  },
  TOOL_HANDLERS.completion_check,
);

registerJsonTool(
  "append_session_note",
  "Append a timestamped line to notes/SESSION.md for one or all objectives.",
  {
    summary: z.string().describe("Short session summary."),
    objective_slug: z
      .string()
      .optional()
      .describe("Limit to one objective slug; omit for all objectives in workspace."),
    task_id: z
      .string()
      .regex(/^T\d{3}$/)
      .optional(),
    workspace_root: workspaceRootSchema,
  },
  TOOL_HANDLERS.append_session_note,
);

registerJsonTool(
  "session_resume_digest",
  "Turn-0 handoff: session preview, validation, active task, last verification, stale nudge.",
  {
    objective: z.string().describe("Objective slug or path under docs/objectives/."),
    stale_days: z.number().int().positive().optional(),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Recent SESSION.md entries (default 3)."),
    workspace_root: workspaceRootSchema,
  },
  TOOL_HANDLERS.session_resume_digest,
);

registerJsonTool(
  "verify_worker_receipt",
  "Cross-check Worker receipt commands against task.verify; returns last_verification JSON patch (no shell execution).",
  {
    objective: z.string().describe("Objective slug or path under docs/objectives/."),
    task_id: z
      .string()
      .regex(/^T\d{3}$/)
      .optional(),
    receipt: z.union([z.string(), z.object({}).passthrough()]).optional(),
    receipt_file: z.string().optional(),
    workspace_root: workspaceRootSchema,
  },
  TOOL_HANDLERS.verify_worker_receipt,
);

registerJsonTool(
  "blocked_tasks",
  "List blocked tasks with receipt blockers; optional triage plan for Approval Gate.",
  {
    objective: z.string().describe("Objective slug or path under docs/objectives/."),
    triage: z.boolean().optional().describe("When true, include Approval Gate triage suggestions."),
    workspace_root: workspaceRootSchema,
  },
  TOOL_HANDLERS.blocked_tasks,
);

registerJsonTool(
  "misfire_audit_check",
  "Check whether intake misfire audit is due based on completed Workers since last audit receipt.",
  {
    objective: z.string().describe("Objective slug or path under docs/objectives/."),
    workers_between_audits: z.number().int().positive().optional(),
    workspace_root: workspaceRootSchema,
  },
  TOOL_HANDLERS.misfire_audit_check,
);

registerJsonTool(
  "subobjective_rollup_check",
  "Find depth-1 subobjectives where child objective.status is done but rollup_receipt is empty.",
  {
    objective: z.string().describe("Objective slug or path under docs/objectives/."),
    workspace_root: workspaceRootSchema,
  },
  TOOL_HANDLERS.subobjective_rollup_check,
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
