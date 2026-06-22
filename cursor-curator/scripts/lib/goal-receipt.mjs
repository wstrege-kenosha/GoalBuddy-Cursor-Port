const RECEIPT_KEY = "cursor_curator_receipt_v1";
const VALID_RESULTS = new Set(["done", "blocked"]);

export function parseReceiptInput(input) {
  if (input === null || input === undefined) {
    throw new Error("Receipt input is required.");
  }

  if (typeof input === "object") {
    return input;
  }

  const text = String(input).trim();
  if (!text) {
    throw new Error("Receipt input is empty.");
  }

  const jsonStart = text.indexOf("{");
  const jsonText = jsonStart >= 0 ? text.slice(jsonStart) : text;
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Receipt is not valid JSON: ${error.message}`);
  }
}

export function validateReceipt(input, options = {}) {
  const errors = [];
  const warnings = [];
  let parsed;

  try {
    parsed = parseReceiptInput(input);
  } catch (error) {
    return {
      ok: false,
      errors: [error.message],
      warnings: [],
      receipt: null,
      role: options.role || null,
    };
  }

  const receipt = parsed[RECEIPT_KEY] ?? parsed;
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    errors.push(`Receipt must include a ${RECEIPT_KEY} object.`);
    return { ok: false, errors, warnings, receipt: null, role: options.role || null };
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
        if (!command.cmd) errors.push(`Worker receipt.commands[${index}] missing cmd.`);
        if (!command.status) errors.push(`Worker receipt.commands[${index}] missing status.`);
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
    errors.push(`receipt.task_id must be ${options.expectedTaskId}; got ${receipt.task_id || "<missing>"}.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    receipt,
    role,
  };
}

function inferRole(receipt) {
  if (Array.isArray(receipt.changed_files) || Array.isArray(receipt.verification_attempts)) return "worker";
  if (receipt.decision) return "approval_gate";
  if (Array.isArray(receipt.evidence) || Array.isArray(receipt.facts)) return "scout";
  return null;
}

function normalizeRole(value) {
  const role = String(value || "").toLowerCase();
  return ["scout", "approval_gate", "worker"].includes(role) ? role : null;
}
