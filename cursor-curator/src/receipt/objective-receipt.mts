const RECEIPT_KEY = "cursor_curator_receipt_v1";
const VALID_RESULTS = new Set(["done", "blocked"]);

export type ReceiptRole = "scout" | "approval_gate" | "worker";

export interface ValidateReceiptOptions {
  role?: string | null;
  expectedTaskId?: string | null;
}

export interface ValidateReceiptResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  receipt: Record<string, unknown> | null;
  role: ReceiptRole | null;
}

export function parseReceiptInput(input: unknown): Record<string, unknown> {
  if (input === null || input === undefined) {
    throw new Error("Receipt input is required.");
  }

  if (typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }

  const text = String(input).trim();
  if (!text) {
    throw new Error("Receipt input is empty.");
  }

  const jsonStart = text.indexOf("{");
  const jsonText = jsonStart >= 0 ? text.slice(jsonStart) : text;
  try {
    return JSON.parse(jsonText) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Receipt is not valid JSON: ${message}`);
  }
}

export function validateReceipt(
  input: unknown,
  options: ValidateReceiptOptions = {},
): ValidateReceiptResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let parsed: Record<string, unknown>;

  try {
    parsed = parseReceiptInput(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      errors: [message],
      warnings: [],
      receipt: null,
      role: normalizeRole(options.role) || null,
    };
  }

  const receipt = (parsed[RECEIPT_KEY] ?? parsed) as Record<string, unknown>;
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    errors.push(`Receipt must include a ${RECEIPT_KEY} object.`);
    return { ok: false, errors, warnings, receipt: null, role: normalizeRole(options.role) || null };
  }

  const role = normalizeRole(options.role || inferRole(receipt));
  if (!role) {
    errors.push("Could not infer receipt role; pass --role scout|approval_gate|worker.");
  }

  if (!receipt.task_id || !/^T\d{3}$/.test(String(receipt.task_id))) {
    errors.push("receipt.task_id must use T### format.");
  }
  if (!receipt.board_path) {
    errors.push("receipt.board_path is required.");
  }
  if (!VALID_RESULTS.has(String(receipt.result || ""))) {
    errors.push('receipt.result must be "done" or "blocked".');
  }
  if (!receipt.summary || !String(receipt.summary).trim()) {
    errors.push("receipt.summary is required.");
  }

  if (role === "worker") {
    if (!Array.isArray(receipt.changed_files) || receipt.changed_files.length === 0) {
      errors.push("Worker receipt.changed_files must list at least one file.");
    }
    if (!Array.isArray(receipt.commands)) {
      errors.push("Worker receipt.commands must be an array.");
    } else {
      for (const [index, command] of receipt.commands.entries()) {
        if (!command || typeof command !== "object") {
          errors.push(`Worker receipt.commands[${index}] must be an object.`);
          continue;
        }
        const entry = command as Record<string, unknown>;
        if (!entry.cmd) errors.push(`Worker receipt.commands[${index}] missing cmd.`);
        if (!entry.status) errors.push(`Worker receipt.commands[${index}] missing status.`);
      }
    }
  }

  if (role === "scout") {
    if (!Array.isArray(receipt.evidence) && !receipt.note_needed) {
      warnings.push("Scout receipt has no evidence array; include evidence or set note_needed.");
    }
  }

  if (role === "approval_gate" && receipt.result === "done" && !receipt.decision) {
    errors.push("Approval Gate receipt.decision is required when result is done.");
  }

  if (options.expectedTaskId && receipt.task_id !== options.expectedTaskId) {
    errors.push(
      `receipt.task_id must be ${options.expectedTaskId}; got ${receipt.task_id || "<missing>"}.`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    receipt,
    role,
  };
}

function inferRole(receipt: Record<string, unknown>): ReceiptRole | null {
  if (Array.isArray(receipt.changed_files) || Array.isArray(receipt.verification_attempts)) {
    return "worker";
  }
  if (receipt.decision) return "approval_gate";
  if (Array.isArray(receipt.evidence) || Array.isArray(receipt.facts)) return "scout";
  return null;
}

function normalizeRole(value: unknown): ReceiptRole | null {
  const role = String(value || "").toLowerCase();
  return ["scout", "approval_gate", "worker"].includes(role) ? (role as ReceiptRole) : null;
}
