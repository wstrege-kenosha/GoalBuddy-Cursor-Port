import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateReceipt } from "../receipt/objective-receipt.mjs";
import { loadState, validateStateV3 } from "./objective-state.mjs";
import { applyReceipt as applyReceiptToRepository } from "../db/state-repository.mjs";
import type { StateV3, StateV3Task } from "../schema/state-v3.js";

export interface ApplyReceiptOptions {
  role?: string;
  expectedTaskId?: string;
  dryRun?: boolean;
  workspaceRoot?: string;
}

export function parseReceiptFromText(text: string | null | undefined): {
  envelope: Record<string, unknown>;
  receipt: Record<string, unknown>;
} | null {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const candidates: string[] = [];
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) candidates.push(fenceMatch[1].trim());

  const jsonStart = trimmed.indexOf("{");
  if (jsonStart >= 0) candidates.push(trimmed.slice(jsonStart));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const receipt = (parsed.cursor_curator_receipt_v1 ?? parsed) as Record<string, unknown>;
      if (receipt && typeof receipt === "object" && receipt.task_id) {
        return {
          envelope: parsed.cursor_curator_receipt_v1
            ? parsed
            : { cursor_curator_receipt_v1: receipt },
          receipt,
        };
      }
    } catch {
      /* try next */
    }
  }

  return null;
}

export function applyReceiptToState(
  objectiveRef: string,
  receiptEnvelope: unknown,
  options: ApplyReceiptOptions = {},
) {
  const loaded = loadState(objectiveRef, options.workspaceRoot);
  return applyReceiptToRepository(loaded.workspaceRoot, loaded.slug, receiptEnvelope, options);
}

export function loadAgentInstructions(cursorHome: string, agentName: string): string {
  const path = join(cursorHome, "agents", `${agentName}.md`);
  return readFileSync(path, "utf8");
}

export function buildAgentHandoffPrompt({
  agentInstructions,
  taskPromptPayload,
}: {
  agentInstructions: string;
  taskPromptPayload: {
    metadata: Record<string, unknown>;
    task: Record<string, unknown>;
    receipt_schema: unknown;
  };
}): string {
  const metadata = taskPromptPayload.metadata;
  const task = taskPromptPayload.task;
  return [
    agentInstructions.trim(),
    "",
    "# Cursor Curator task handoff",
    "",
    `- board_path: ${metadata.board_path}`,
    `- task_id: ${task.id}`,
    `- type: ${task.type}`,
    `- objective: ${task.objective}`,
    "",
    "## Task JSON",
    JSON.stringify(task, null, 2),
    "",
    "## Receipt schema",
    JSON.stringify(taskPromptPayload.receipt_schema, null, 2),
    "",
    "Return exactly one parseable JSON object with cursor_curator_receipt_v1 as specified in your agent contract.",
  ].join("\n");
}

export function validateObjectiveStateFromObject(state: StateV3) {
  const result = validateStateV3(state, { slug: state.objective.slug });
  return {
    ok: result.ok,
    errors: result.errors,
    warnings: result.warnings,
  };
}
