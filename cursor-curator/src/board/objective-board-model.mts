// @ts-nocheck — follow-up: type normalizeTask/buildColumns and YAML legacy parsers
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { boardColumnLabels } from "./board-theme.mjs";

export const VALID_STATUSES = new Set(["queued", "active", "blocked", "done"]);
export const COLUMN_ORDER = ["todo", "in-progress", "blocked", "completed"];

export class ObjectiveBoardError extends Error {
  constructor(message) {
    super(message);
    this.name = "ObjectiveBoardError";
  }
}

export function normalizeObjectiveBoard(document, objectiveDir = "<memory>") {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new ObjectiveBoardError("Objective state must be a YAML mapping.");
  }
  if (Number(document.version) !== 2 && Number(document.version) !== 3) {
    throw new ObjectiveBoardError("Only Cursor Curator state v2 (YAML) or v3 (JSON) files are supported.");
  }
  if (!document.objective || typeof document.objective !== "object") {
    throw new ObjectiveBoardError("Missing objective metadata.");
  }
  if (!Array.isArray(document.tasks) || document.tasks.length === 0) {
    throw new ObjectiveBoardError("Missing non-empty tasks list.");
  }

  const tasks = document.tasks.map((task, index) => normalizeTask(task, index));
  const activeTasks = tasks.filter((task) => task.status === "active");
  if (activeTasks.length > 1) {
    throw new ObjectiveBoardError("Objective state has more than one active task.");
  }

  return {
    objectiveDir,
    title: cleanText(document.objective.title || "Untitled objective"),
    slug: cleanText(document.objective.slug || "untitled-objective"),
    kind: cleanText(document.objective.kind || "open_ended"),
    tranche: cleanText(document.objective.tranche || ""),
    status: cleanText(document.objective.status || "active"),
    activeTask: cleanText(document.active_task || activeTasks[0]?.id || ""),
    tasks,
  };
}

export function normalizeTask(task, index) {
  if (!task || typeof task !== "object" || Array.isArray(task)) {
    throw new ObjectiveBoardError(`Task ${index + 1} must be a mapping.`);
  }

  const id = cleanText(task.id);
  const status = normalizeTaskStatus(task.status);
  if (!id) throw new ObjectiveBoardError(`Task ${index + 1} is missing id.`);
  if (!VALID_STATUSES.has(status)) {
    throw new ObjectiveBoardError(`Task ${id} has unsupported status "${status}".`);
  }

  return {
    id,
    title: titleForTask(task),
    objective: cleanText(task.objective || ""),
    status,
    column: columnForStatus(status),
    type: cleanText(task.type || "pm"),
    assignee: cleanText(task.assignee || ""),
    active: status === "active",
    inputs: normalizeStringList(task.inputs),
    constraints: normalizeStringList(task.constraints),
    expectedOutput: normalizeStringList(task.expected_output),
    allowedFiles: normalizeStringList(task.allowed_files),
    verify: normalizeStringList(task.verify),
    stopIf: normalizeStringList(task.stop_if),
    subobjective: normalizeSubobjective(task.subobjective),
    receipt: normalizeReceipt(task.receipt),
  };
}

export function buildColumns(tasks) {
  const byColumn = new Map(COLUMN_ORDER.map((id) => [id, []]));
  for (const task of tasks) {
    byColumn.get(task.column).push(task);
  }

  for (const [columnId, columnTasks] of byColumn.entries()) {
    columnTasks.sort((left, right) => compareColumnTasks(columnId, left, right));
  }

  return COLUMN_ORDER.map((id) => {
    const labels = boardColumnLabels(id);
    return {
      id,
      title: labels.title,
      description: labels.description,
      tasks: byColumn.get(id),
    };
  });
}

function normalizeReceipt(receipt) {
  if (!receipt) return { present: false, summary: "", result: "", note: "" };
  if (typeof receipt === "string") {
    return { present: true, summary: cleanText(receipt), result: "", note: "" };
  }
  if (Array.isArray(receipt) || typeof receipt !== "object") {
    return { present: true, summary: cleanText(receipt), result: "", note: "" };
  }
  return {
    present: true,
    result: cleanText(receipt.result || ""),
    summary: cleanText(receipt.summary || receipt.decision || receipt.note || receipt.result || ""),
    decision: cleanText(receipt.decision || ""),
    note: cleanText(receipt.note || ""),
    changedFiles: normalizeStringList(receipt.changed_files),
    commands: normalizeCommands(receipt.commands),
    evidence: normalizeStringList(receipt.evidence),
  };
}

function normalizeSubobjective(subobjective) {
  if (!subobjective || typeof subobjective !== "object" || Array.isArray(subobjective)) return null;
  return {
    status: cleanText(subobjective.status || ""),
    path: cleanText(subobjective.path || ""),
    owner: cleanText(subobjective.owner || ""),
    createdFrom: cleanText(subobjective.created_from || ""),
    depth: Number(subobjective.depth || 0),
    rollupReceipt: cleanText(subobjective.rollup_receipt || ""),
    board: null,
  };
}

function normalizeCommands(commands) {
  if (!commands) return [];
  if (!Array.isArray(commands)) return [cleanText(commands)].filter(Boolean).map((cmd) => ({ cmd, status: "" }));
  return commands.map((command) => {
    if (typeof command === "string") return { cmd: cleanText(command), status: "" };
    return {
      cmd: cleanText(command?.cmd || ""),
      status: cleanText(command?.status || ""),
    };
  }).filter((command) => command.cmd || command.status);
}

function titleForTask(task) {
  if (task.title) return compactTaskTitle(task.title);
  const objective = cleanText(task.objective || "Untitled task");
  return compactTaskTitle(objective);
}

function compactTaskTitle(value) {
  const text = cleanText(value).replace(/\.$/, "");
  const routeMatch = text.match(/^Implement\b.*?\s(\/[A-Za-z0-9_./:-]+)\s+(route|queue slice|slice)\b/i);
  if (routeMatch) return `Implement ${routeMatch[1]} ${routeMatch[2]}`;

  const firstClause = text
    .split(/(?<=[.!?])\s+|\s+(?:Use only|Add|Match|Render|Clearly label|Do not)\b/i)[0]
    .replace(/\bas the next first-milestone slice\b/gi, "")
    .replace(/\bblocker documentation\b/gi, "blocker docs")
    .replace(/\benv\/setup notes\b/gi, "setup notes")
    .replace(/\s+/g, " ")
    .replace(/[.;:,]\s*$/, "")
    .trim();

  return firstClause || text;
}

function columnForStatus(status) {
  if (status === "blocked") return "blocked";
  if (status === "done") return "completed";
  if (status === "queued") return "todo";
  return "in-progress";
}

function taskSortKey(task) {
  const rank = task.status === "active" ? "0" : task.status === "queued" ? "1" : task.status === "blocked" ? "2" : "3";
  return `${rank}:${task.id}`;
}

function compareColumnTasks(columnId, left, right) {
  const order = taskSortKey(left).localeCompare(taskSortKey(right));
  if (columnId === "completed") return -order;
  return order;
}

function normalizeStringList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  return [cleanText(value)].filter(Boolean);
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeTaskStatus(value) {
  const status = cleanText(value);
  if (status === "complete" || status === "completed") return "done";
  return status;
}

export function parseObjectiveStateText(text) {
  try {
    const lines = tokenizeYaml(text);
    if (!lines.length) throw new ObjectiveBoardError("Objective state is empty.");
    const [value, nextIndex] = parseBlock(lines, 0, lines[0].indent);
    if (nextIndex < lines.length) {
      throw new ObjectiveBoardError(`Could not parse line ${lines[nextIndex].number}.`);
    }
    return value;
  } catch (error) {
    if (error instanceof ObjectiveBoardError && canRecoverBoardSubset(error)) {
      return parseObjectiveBoardSubset(text);
    }
    throw error;
  }
}

function canRecoverBoardSubset(error) {
  return /Could not parse line|Expected key\/value pair|Expected mapping|Block scalar YAML/.test(error.message);
}

function parseObjectiveBoardSubset(text) {
  const tasks = parseTaskSubsets(text);
  if (!tasks.length) throw new ObjectiveBoardError("Missing non-empty tasks list.");
  return {
    version: parseYamlScalar(findTopLevelScalar(text, "version") || "2"),
    objective: {
      title: parseYamlScalar(findNestedScalar(text, "objective", "title") || "Untitled objective"),
      slug: parseYamlScalar(findNestedScalar(text, "objective", "slug") || "untitled-objective"),
      kind: parseYamlScalar(findNestedScalar(text, "objective", "kind") || "open_ended"),
      tranche: parseYamlScalar(findNestedScalar(text, "objective", "tranche") || ""),
      status: parseYamlScalar(findNestedScalar(text, "objective", "status") || "active"),
    },
    active_task: parseYamlScalar(findTopLevelScalar(text, "active_task") || ""),
    tasks,
  };
}

function parseTaskSubsets(text) {
  const tasksText = findTopLevelSection(text, "tasks");
  if (!tasksText) return [];
  const taskBlocks = [];
  let current = [];
  for (const line of tasksText.split("\n")) {
    if (/^  - id:/.test(line)) {
      if (current.length) taskBlocks.push(current.join("\n"));
      current = [line];
    } else if (current.length) {
      current.push(line);
    }
  }
  if (current.length) taskBlocks.push(current.join("\n"));
  return taskBlocks.map((block) => ({
    id: parseYamlScalar(findTaskScalar(block, "id") || ""),
    type: parseYamlScalar(findTaskScalar(block, "type") || "pm"),
    assignee: parseYamlScalar(findTaskScalar(block, "assignee") || ""),
    status: parseYamlScalar(findTaskScalar(block, "status") || "queued"),
    title: parseYamlScalar(findTaskScalar(block, "title") || ""),
    objective: parseYamlScalar(findTaskScalar(block, "objective") || ""),
    inputs: findTaskList(block, "inputs"),
    constraints: findTaskList(block, "constraints"),
    expected_output: findTaskList(block, "expected_output"),
    allowed_files: findTaskList(block, "allowed_files"),
    verify: findTaskList(block, "verify"),
    stop_if: findTaskList(block, "stop_if"),
    subobjective: findTaskSubobjective(block),
    receipt: findTaskReceipt(block),
  }));
}

function findTopLevelScalar(text, key) {
  return findScalar(text, new RegExp(`^${escapeRegExp(key)}:\\s*(.*?)\\s*$`, "m"));
}

function findNestedScalar(text, section, key) {
  return findScalar(findTopLevelSection(text, section), new RegExp(`^  ${escapeRegExp(key)}:\\s*(.*?)\\s*$`, "m"));
}

function findTaskScalar(text, key) {
  if (key === "id") return findScalar(text, /^  - id:\s*(.*?)\s*$/m);
  return findScalar(text, new RegExp(`^    ${escapeRegExp(key)}:\\s*(.*?)\\s*$`, "m"));
}

function findScalar(text, pattern) {
  const match = String(text || "").match(pattern);
  return match ? match[1] : "";
}

function findTopLevelSection(text, key) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => line.trim() === `${key}:`);
  if (start === -1) return "";
  const section = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\S/.test(line)) break;
    section.push(line);
  }
  return section.join("\n");
}

function findIndentedSection(text, key, indent) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const prefix = " ".repeat(indent);
  const start = lines.findIndex((line) => line.trim() === `${key}:` && line.startsWith(prefix));
  if (start === -1) return "";
  const section = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() && !line.startsWith(`${prefix}  `)) break;
    section.push(line);
  }
  return section.join("\n");
}

function findTaskList(text, key) {
  const inline = findTaskScalar(text, key);
  if (inline) {
    const parsed = parseYamlScalar(inline);
    if (Array.isArray(parsed)) return parsed.map(cleanText).filter(Boolean);
    return cleanText(parsed) ? [cleanText(parsed)] : [];
  }
  const section = findIndentedSection(text, key, 4);
  return section
    .split("\n")
    .map((line) => line.match(/^      -\s*(.*?)\s*$/)?.[1] || "")
    .map(parseYamlScalar)
    .map(cleanText)
    .filter(Boolean);
}

function findTaskSubobjective(text) {
  const inline = findTaskScalar(text, "subobjective");
  if (inline && parseYamlScalar(inline) === null) return null;
  const section = findIndentedSection(text, "subobjective", 4);
  if (!section) return null;
  return {
    status: parseYamlScalar(findScalar(section, /^      status:\s*(.*?)\s*$/m) || "active"),
    path: parseYamlScalar(findScalar(section, /^      path:\s*(.*?)\s*$/m) || ""),
    owner: parseYamlScalar(findScalar(section, /^      owner:\s*(.*?)\s*$/m) || ""),
    created_from: parseYamlScalar(findScalar(section, /^      created_from:\s*(.*?)\s*$/m) || ""),
    depth: parseYamlScalar(findScalar(section, /^      depth:\s*(.*?)\s*$/m) || "1"),
    rollup_receipt: parseYamlScalar(findScalar(section, /^      rollup_receipt:\s*(.*?)\s*$/m) || "null"),
  };
}

function findTaskReceipt(text) {
  const inline = findTaskScalar(text, "receipt");
  if (inline && parseYamlScalar(inline) === null) return null;
  const section = findIndentedSection(text, "receipt", 4);
  if (!section) return null;
  return {
    result: parseYamlScalar(findScalar(section, /^      result:\s*(.*?)\s*$/m) || ""),
    summary: parseYamlScalar(findScalar(section, /^      summary:\s*(.*?)\s*$/m) || ""),
    decision: parseYamlScalar(findScalar(section, /^      decision:\s*(.*?)\s*$/m) || ""),
    note: parseYamlScalar(findScalar(section, /^      note:\s*(.*?)\s*$/m) || ""),
    changed_files: findReceiptList(section, "changed_files"),
    commands: findReceiptCommands(section),
    evidence: [],
  };
}

function findReceiptList(text, key) {
  const section = findIndentedSection(text, key, 6);
  return section
    .split("\n")
    .map((line) => line.match(/^        -\s*(.*?)\s*$/)?.[1] || "")
    .map(parseYamlScalar)
    .map(cleanText)
    .filter(Boolean);
}

function findReceiptCommands(text) {
  const section = findIndentedSection(text, "commands", 6);
  const blocks = [];
  let current = [];
  for (const line of section.split("\n")) {
    if (/^        - cmd:/.test(line)) {
      if (current.length) blocks.push(current.join("\n"));
      current = [line];
    } else if (current.length) {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join("\n"));
  return blocks.map((block) => ({
    cmd: parseYamlScalar(findScalar(block, /^        - cmd:\s*(.*?)\s*$/m) || ""),
    status: parseYamlScalar(findScalar(block, /^          status:\s*(.*?)\s*$/m) || ""),
    note: parseYamlScalar(findScalar(block, /^          note:\s*(.*?)\s*$/m) || ""),
  }));
}

function parseYamlScalar(value) {
  const text = stripComment(String(value ?? "")).trim();
  if (!text) return "";
  try {
    return parseScalar(text);
  } catch {
    if (
      (text.startsWith("\"") && text.endsWith("\"")) ||
      (text.startsWith("'") && text.endsWith("'"))
    ) {
      return text.slice(1, -1);
    }
    return text;
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenizeYaml(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((raw, index) => {
      const withoutComments = stripComment(raw).replace(/\s+$/, "");
      if (!withoutComments.trim()) return null;
      const indent = withoutComments.match(/^ */)[0].length;
      if (indent % 2 !== 0) {
        throw new ObjectiveBoardError(`Unsupported odd indentation at line ${index + 1}.`);
      }
      return {
        number: index + 1,
        indent,
        text: withoutComments.trimStart(),
      };
    })
    .filter(Boolean);
}

function stripComment(line) {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previous = line[index - 1];
    if ((char === "\"" || char === "'") && previous !== "\\") {
      quote = quote === char ? null : quote || char;
      continue;
    }
    if (char === "#" && !quote && (index === 0 || /\s/.test(previous))) {
      return line.slice(0, index);
    }
  }
  return line;
}

function parseBlock(lines, index, indent) {
  if (index >= lines.length) return [{}, index];
  if (lines[index].indent < indent) return [{}, index];
  if (lines[index].text.startsWith("- ")) return parseArray(lines, index, indent);
  return parseObject(lines, index, indent);
}

function parseObject(lines, index, indent) {
  const object = {};
  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent) break;
    if (line.indent !== indent || line.text.startsWith("- ")) break;

    const { key, valueText } = splitKeyValue(line);
    index += 1;

    if (valueText === "") {
      if (index < lines.length && lines[index].indent > indent) {
        const [child, nextIndex] = parseBlock(lines, index, lines[index].indent);
        object[key] = child;
        index = nextIndex;
      } else {
        object[key] = {};
      }
    } else {
      object[key] = parseScalar(valueText);
    }
  }
  return [object, index];
}

function parseArray(lines, index, indent) {
  const array = [];
  while (index < lines.length) {
    const line = lines[index];
    if (line.indent !== indent || !line.text.startsWith("- ")) break;

    const content = line.text.slice(2).trim();
    index += 1;

    if (content === "") {
      if (index < lines.length && lines[index].indent > indent) {
        const [child, nextIndex] = parseBlock(lines, index, lines[index].indent);
        array.push(child);
        index = nextIndex;
      } else {
        array.push(null);
      }
      continue;
    }

    if (isInlineMapping(content)) {
      const object = {};
      const { key, valueText } = splitKeyValue({ text: content, number: line.number });
      object[key] = valueText === "" ? {} : parseScalar(valueText);
      if (index < lines.length && lines[index].indent > indent) {
        const [child, nextIndex] = parseBlock(lines, index, lines[index].indent);
        if (child && typeof child === "object" && !Array.isArray(child)) {
          Object.assign(object, child);
        } else {
          throw new ObjectiveBoardError(`Expected mapping below line ${line.number}.`);
        }
        index = nextIndex;
      }
      array.push(object);
    } else {
      array.push(parseScalar(content));
    }
  }
  return [array, index];
}

function splitKeyValue(line) {
  const separator = line.text.indexOf(":");
  if (separator <= 0) {
    throw new ObjectiveBoardError(`Expected key/value pair at line ${line.number}.`);
  }
  return {
    key: line.text.slice(0, separator).trim(),
    valueText: line.text.slice(separator + 1).trim(),
  };
}

function isInlineMapping(text) {
  return /^[A-Za-z0-9_.-]+:\s*/.test(text);
}

function parseScalar(text) {
  if (text === "[]") return [];
  if (text === "{}") return {};
  if (text === "null" || text === "~") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (text.startsWith("[") && text.endsWith("]")) {
    const inner = text.slice(1, -1).trim();
    if (!inner) return [];
    return splitInlineArray(inner).map(parseScalar);
  }
  if (
    (text.startsWith("\"") && text.endsWith("\"")) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return unquote(text);
  }
  if (text === "|" || text === ">") {
    throw new ObjectiveBoardError("Block scalar YAML is not supported by this lightweight parser.");
  }
  return text;
}

function unquote(text) {
  if (text.startsWith("'")) return text.slice(1, -1).replace(/''/g, "'");
  return text
    .slice(1, -1)
    .replace(/\\"/g, "\"")
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\");
}

function splitInlineArray(text) {
  const values = [];
  let quote = null;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const previous = text[index - 1];
    if ((char === "\"" || char === "'") && previous !== "\\") {
      quote = quote === char ? null : quote || char;
      continue;
    }
    if (char === "," && !quote) {
      values.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  values.push(text.slice(start).trim());
  return values;
}
