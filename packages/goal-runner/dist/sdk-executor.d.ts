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
export declare function executeSdkAgentTurn(input: SdkAgentTurnInput): Promise<SdkAgentTurnResult>;
export declare function createSdkExecutor(options: {
    apiKey: string;
    mcpServers?: Record<string, McpServerConfig>;
    onText?: (chunk: string) => void;
}): (turn: Omit<SdkAgentTurnInput, "apiKey" | "mcpServers" | "onText">) => Promise<SdkAgentTurnResult>;
