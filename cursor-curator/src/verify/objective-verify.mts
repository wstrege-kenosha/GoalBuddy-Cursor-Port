export interface WorkerTaskVerify {
  id?: string;
  verify?: string[];
}

export interface ReceiptCommand {
  cmd?: string;
  status?: string;
}

export interface WorkerReceipt {
  task_id?: string;
  commands?: ReceiptCommand[];
}

export interface CrossCheckResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  matched: Array<{ cmd: string; status: string }>;
  verify_count: number;
  receipt_command_count: number;
}

export interface LastVerificationPatch {
  result: string;
  task: string | null;
  commands: Array<{ cmd: string; status: string }>;
  errors: string[];
  warnings: string[];
}

function normalizeCommand(value: unknown): string {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function commandKey(value: string): string {
  return normalizeCommand(value).toLowerCase();
}

export function crossCheckWorkerReceipt(
  task: WorkerTaskVerify | null | undefined,
  receipt: WorkerReceipt | null | undefined,
): CrossCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const verifyList = Array.isArray(task?.verify)
    ? task.verify.map((item) => normalizeCommand(item)).filter(Boolean)
    : [];
  const receiptCommands = Array.isArray(receipt?.commands) ? receipt.commands : [];

  if (verifyList.length === 0) {
    warnings.push("Worker task has no verify commands in state.");
  }

  const receiptByKey = new Map<string, ReceiptCommand>();
  for (const [index, entry] of receiptCommands.entries()) {
    if (!entry || typeof entry !== "object") {
      errors.push(`receipt.commands[${index}] must be an object.`);
      continue;
    }
    const cmd = normalizeCommand(entry.cmd);
    if (!cmd) {
      errors.push(`receipt.commands[${index}] missing cmd.`);
      continue;
    }
    receiptByKey.set(commandKey(cmd), entry);
  }

  const matched: Array<{ cmd: string; status: string }> = [];
  for (const verifyCmd of verifyList) {
    const key = commandKey(verifyCmd);
    const entry = receiptByKey.get(key);
    if (!entry) {
      errors.push(`Missing receipt command for verify step: ${verifyCmd}`);
      continue;
    }
    const status = String(entry.status || "").trim().toLowerCase();
    if (status !== "pass") {
      errors.push(`Verify command did not pass: ${verifyCmd} (status: ${entry.status || "<missing>"})`);
    } else {
      matched.push({ cmd: verifyCmd, status: "pass" });
    }
  }

  for (const entry of receiptCommands) {
    const cmd = normalizeCommand(entry?.cmd);
    if (!cmd) continue;
    const key = commandKey(cmd);
    if (!verifyList.some((verifyCmd) => commandKey(verifyCmd) === key)) {
      warnings.push(`Receipt includes command not listed in task.verify: ${cmd}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    matched,
    verify_count: verifyList.length,
    receipt_command_count: receiptCommands.length,
  };
}

export function buildLastVerificationPatch(
  task: WorkerTaskVerify | null | undefined,
  receipt: WorkerReceipt | null | undefined,
  crossCheck?: CrossCheckResult,
): LastVerificationPatch {
  const check = crossCheck || crossCheckWorkerReceipt(task, receipt);
  const commands = (check.matched.length ? check.matched : receipt?.commands || [])
    .map((entry) => ({
      cmd: normalizeCommand(
        typeof entry === "object" && entry !== null && "cmd" in entry
          ? (entry as ReceiptCommand).cmd
          : entry,
      ),
      status: String(
        typeof entry === "object" && entry !== null && "status" in entry
          ? (entry as ReceiptCommand).status || (check.ok ? "pass" : "fail")
          : check.ok
            ? "pass"
            : "fail",
      )
        .trim()
        .toLowerCase(),
    }))
    .filter((entry) => entry.cmd);

  return {
    result: check.ok ? "pass" : "fail",
    task: task?.id || receipt?.task_id || null,
    commands,
    errors: check.errors,
    warnings: check.warnings,
  };
}

export function formatLastVerificationYaml(patch: LastVerificationPatch): string {
  const lines = [
    "last_verification:",
    `  result: ${patch.result}`,
    `  task: ${patch.task ? JSON.stringify(String(patch.task)) : "null"}`,
    "  commands:",
  ];
  if (!patch.commands?.length) {
    lines.push("    []");
  } else {
    for (const command of patch.commands) {
      lines.push(`    - cmd: ${JSON.stringify(command.cmd)}`);
      lines.push(`      status: ${command.status}`);
    }
  }
  return lines.join("\n");
}

export function readLastVerificationFromState(text: string | null | undefined): {
  result: string | null;
  task: string | null;
  commands: Array<{ cmd: string; status: string }>;
} | null {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;

  try {
    const state = JSON.parse(trimmed) as {
      checks?: {
        last_verification?: {
          result?: string | null;
          task?: string | null;
          commands?: Array<{ cmd?: string; status?: string }>;
        };
      };
    };
    const lastVerification = state.checks?.last_verification;
    if (!lastVerification) return null;
    const commands = (lastVerification.commands || [])
      .map((entry) => ({
        cmd: String(entry.cmd || ""),
        status: String(entry.status || ""),
      }))
      .filter((entry) => entry.cmd);
    return {
      result: lastVerification.result ?? null,
      task: lastVerification.task ?? null,
      commands,
    };
  } catch {
    return null;
  }
}

export function verifyWorkerReceiptForTask(
  task: WorkerTaskVerify,
  receipt: WorkerReceipt,
): {
  ok: boolean;
  cross_check: CrossCheckResult;
  last_verification: LastVerificationPatch;
} {
  const crossCheck = crossCheckWorkerReceipt(task, receipt);
  const patch = buildLastVerificationPatch(task, receipt, crossCheck);
  return {
    ok: crossCheck.ok,
    cross_check: crossCheck,
    last_verification: patch,
  };
}
