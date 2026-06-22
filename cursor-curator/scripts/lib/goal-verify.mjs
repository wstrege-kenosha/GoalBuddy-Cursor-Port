function normalizeCommand(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function commandKey(value) {
  return normalizeCommand(value).toLowerCase();
}

export function crossCheckWorkerReceipt(task, receipt) {
  const errors = [];
  const warnings = [];
  const verifyList = Array.isArray(task?.verify)
    ? task.verify.map((item) => normalizeCommand(item)).filter(Boolean)
    : [];
  const receiptCommands = Array.isArray(receipt?.commands) ? receipt.commands : [];

  if (verifyList.length === 0) {
    warnings.push("Worker task has no verify commands in state.yaml.");
  }

  const receiptByKey = new Map();
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

  const matched = [];
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

export function buildLastVerificationPatch(task, receipt, crossCheck) {
  const check = crossCheck || crossCheckWorkerReceipt(task, receipt);
  const commands = (check.matched.length ? check.matched : (receipt?.commands || []))
    .map((entry) => ({
      cmd: normalizeCommand(entry.cmd || entry),
      status: String(entry.status || (check.ok ? "pass" : "fail")).trim().toLowerCase(),
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

export function formatLastVerificationYaml(patch) {
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

export function readLastVerificationFromState(text) {
  if (!text || typeof text !== "string") return null;
  const lines = text.split(/\r?\n/);
  let inChecks = false;
  let inLastVerification = false;
  let depth = 0;
  const result = { result: null, task: null, commands: [] };
  let currentCommand = null;

  for (const line of lines) {
    if (/^checks:\s*$/.test(line)) {
      inChecks = true;
      inLastVerification = false;
      depth = 1;
      continue;
    }
    if (!inChecks) continue;
    if (/^\S/.test(line)) break;

    if (/^\s{2}last_verification:\s*$/.test(line)) {
      inLastVerification = true;
      depth = 2;
      continue;
    }
    if (!inLastVerification) continue;
    if (/^\s{2}\S/.test(line) && !/^\s{2}last_verification:/.test(line)) {
      inLastVerification = false;
      continue;
    }

    const resultMatch = line.match(/^\s{4}result:\s*(.+?)\s*$/);
    if (resultMatch) {
      result.result = cleanScalar(resultMatch[1]);
      continue;
    }
    const taskMatch = line.match(/^\s{4}task:\s*(.+?)\s*$/);
    if (taskMatch) {
      result.task = cleanScalar(taskMatch[1]);
      continue;
    }
    const cmdMatch = line.match(/^\s{6}-\s+cmd:\s*(.+?)\s*$/);
    if (cmdMatch) {
      if (currentCommand) result.commands.push(currentCommand);
      currentCommand = { cmd: cleanScalar(cmdMatch[1]), status: "" };
      continue;
    }
    const statusMatch = line.match(/^\s{8}status:\s*(.+?)\s*$/);
    if (statusMatch && currentCommand) {
      currentCommand.status = cleanScalar(statusMatch[1]);
    }
  }
  if (currentCommand) result.commands.push(currentCommand);

  if (!result.result && result.result !== "fail" && !result.task && result.commands.length === 0) {
    return null;
  }
  return result;
}

function cleanScalar(value) {
  const cleaned = String(value || "").replace(/#.*/, "").trim().replace(/^['"]|['"]$/g, "");
  if (cleaned === "null") return null;
  return cleaned;
}

export function verifyWorkerReceiptForTask(task, receipt) {
  const crossCheck = crossCheckWorkerReceipt(task, receipt);
  const patch = buildLastVerificationPatch(task, receipt, crossCheck);
  return {
    ok: crossCheck.ok,
    cross_check: crossCheck,
    last_verification: patch,
    last_verification_yaml: formatLastVerificationYaml(patch),
  };
}
