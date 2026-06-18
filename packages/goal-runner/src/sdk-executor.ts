import { Agent, CursorAgentError } from "@cursor/sdk";
import type { McpServerConfig } from "@cursor/sdk";

export type SdkAgentTurnInput = {
  prompt: string;
  model: string;
  cwd: string;
  apiKey: string;
  mcpServers?: Record<string, McpServerConfig>;
  onText?: (chunk: string) => void;
  taskId?: string;
  role?: string;
};

export type SdkAgentTurnResult = {
  ok: boolean;
  text: string;
  status: string;
  runId?: string;
  error?: string;
  retryable?: boolean;
};

export async function executeSdkAgentTurn(input: SdkAgentTurnInput): Promise<SdkAgentTurnResult> {
  try {
    const result = await Agent.prompt(input.prompt, {
      apiKey: input.apiKey,
      model: { id: input.model },
      local: { cwd: input.cwd, settingSources: [] },
      mcpServers: input.mcpServers,
      name: input.taskId ? `GoalBuddy ${input.role || "agent"} ${input.taskId}` : "GoalBuddy runner",
    });

    const text = result.result || "";
    if (input.onText && text) input.onText(text);

    if (result.status === "error") {
      return {
        ok: false,
        text,
        status: result.status,
        runId: result.id,
        error: "agent run finished with error status",
      };
    }

    return {
      ok: result.status === "finished",
      text,
      status: result.status,
      runId: result.id,
    };
  } catch (error) {
    if (error instanceof CursorAgentError) {
      return {
        ok: false,
        text: "",
        status: "startup_error",
        error: error.message,
        retryable: error.isRetryable,
      };
    }
    throw error;
  }
}

export function createSdkExecutor(options: {
  apiKey: string;
  mcpServers?: Record<string, McpServerConfig>;
  onText?: (chunk: string) => void;
}) {
  return async (turn: Omit<SdkAgentTurnInput, "apiKey" | "mcpServers" | "onText">) =>
    executeSdkAgentTurn({
      ...turn,
      apiKey: options.apiKey,
      mcpServers: options.mcpServers,
      onText: options.onText,
    });
}
