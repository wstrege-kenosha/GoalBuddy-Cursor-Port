// @ts-nocheck
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BOARD_SKIN_COPY,
  BOARD_SKIN_IDS,
  DEFAULT_BOARD_SKIN,
  boardSkinCss,
  themeFontLinksHtml,
  themeSurfaceCss,
  themeTokensCss,
} from "./board-theme.mjs";
import {
  DEFAULT_REPO_LINKS,
  githubSlugFromUrl,
  readBoardRepoLinks,
} from "./port-metadata.mjs";
import { checkCompletionReadiness } from "../completion/objective-completion.mjs";
import { readLastVerificationFromState } from "../verify/objective-verify.mjs";
import { readSessionDigest } from "../session/objective-session.mjs";
import { loadState, resolveStatePath } from "../state/objective-state.mjs";
import { validateObjectiveStateFile } from "../mcp/validate-state-bridge.mjs";

export { readBoardRepoLinks };

const VALID_STATUSES = new Set(["queued", "active", "blocked", "done"]);
const COLUMN_ORDER = ["todo", "in-progress", "blocked", "completed"];
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "../..");
const logoAssetPath = join(packageRoot, "assets", "curator-mark.png");

function readObjectiveStateAtRoot(root: string) {
  const statePath = resolveStatePath(root);
  const loaded = loadState(root, { warnYaml: false });
  return { statePath, loaded };
}

export class ObjectiveBoardError extends Error {
  constructor(message) {
    super(message);
    this.name = "ObjectiveBoardError";
  }
}

export async function loadObjectiveBoard(objectiveDir) {
  const root = resolve(objectiveDir);
  const { loaded } = readObjectiveStateAtRoot(root);
  return normalizeObjectiveBoard(loaded.raw, root);
}

export function createBoardPayload(objectiveDir, options = {}) {
  const includeSubobjectives = options.includeSubobjectives !== false;
  const root = resolve(objectiveDir);
  const { statePath, loaded } = readObjectiveStateAtRoot(root);
  const document = loaded.raw;

  const board = normalizeObjectiveBoard(document, root);
  const noteIndex = loadNotes(root);
  const tasks = board.tasks
    .map((task) => attachTaskNote(task, noteIndex))
    .map((task) => includeSubobjectives ? attachTaskSubobjective(task, root) : task);
  const columns = buildColumns(tasks);
  const stateStat = statSync(statePath);
  const repo = readBoardRepoLinks();
  const stateText = readFileSync(statePath, "utf8");
  const validation = validateObjectiveStateFile(statePath);
  const completion = checkCompletionReadiness(statePath);
  const lastVerification = readLastVerificationFromState(stateText);
  const sessionDigest = readSessionDigest(root, { limit: 3 });
  const activeTaskRow = tasks.find((task) => task.id === board.activeTask) || null;
  const doneCount = tasks.filter((task) => task.status === "done").length;
  const blockedCount = tasks.filter((task) => task.status === "blocked").length;
  const queuedCount = tasks.filter((task) => task.status === "queued").length;
  const activeCount = tasks.filter((task) => task.status === "active").length;
  const progressPct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  return {
    generatedAt: new Date().toISOString(),
    repo,
    source: {
      objectiveDir: root,
      statePath,
      stateMtimeMs: stateStat.mtimeMs,
      notesDir: join(root, "notes"),
    },
    objective: {
      title: board.title,
      slug: board.slug,
      kind: board.kind,
      status: board.status,
      tranche: board.tranche,
      activeTask: board.activeTask,
      success_criteria: document.objective?.success_criteria || null,
      intake: document.objective?.intake || null,
    },
    validation: {
      ok: validation.ok,
      errors: validation.errors,
      warnings: validation.warnings,
    },
    completion: {
      ready: completion.ready,
      blockers: completion.blockers,
      success_criteria_ready: completion.success_criteria_ready,
      audit_ready: completion.audit_ready,
    },
    lastVerification: lastVerification || { result: null, task: null, commands: [] },
    activeTaskDetail: activeTaskRow
      ? {
          id: activeTaskRow.id,
          objective: activeTaskRow.objective,
          assignee: activeTaskRow.assignee,
          type: activeTaskRow.type,
          verify: activeTaskRow.verify || [],
        }
      : null,
    progress: {
      total: tasks.length,
      done: doneCount,
      blocked: blockedCount,
      queued: queuedCount,
      active: activeCount,
      pct: progressPct,
    },
    sessionPreview: sessionDigest.preview,
    counts: {
      total: tasks.length,
      todo: columns.find((column) => column.id === "todo").tasks.length,
      inProgress: columns.find((column) => column.id === "in-progress").tasks.length,
      blocked: columns.find((column) => column.id === "blocked").tasks.length,
      completed: columns.find((column) => column.id === "completed").tasks.length,
    },
    columns,
    tasks,
    notes: Object.values(noteIndex).map(({ path, title, mtimeMs }) => ({ path, title, mtimeMs })),
    sessionLog: noteIndex["notes/SESSION.md"]?.content || noteIndex["notes/session.md"]?.content || null,
  };
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

  return [
    { id: "todo", title: "Todo", description: "Queued work ready to pull", tasks: byColumn.get("todo") },
    { id: "in-progress", title: "In Progress", description: "The active task", tasks: byColumn.get("in-progress") },
    { id: "blocked", title: "Blocked", description: "Needs unblock or a smaller slice", tasks: byColumn.get("blocked") },
    { id: "completed", title: "Completed", description: "Receipted work", tasks: byColumn.get("completed") },
  ];
}

export function writeBoardApp(objectiveDir) {
  const root = resolve(objectiveDir);
  const appDir = join(root, ".cursor-curator-board");
  mkdirSync(appDir, { recursive: true });
  const boardPayload = createBoardPayload(root);
  const repoLinks = readBoardRepoLinks();
  writeFileSync(join(appDir, "index.html"), `${boardHtml(boardPayload, repoLinks)}\n`);
  writeFileSync(join(appDir, "styles.css"), `${boardCss()}\n`);
  writeFileSync(join(appDir, "app.js"), `${boardJs(repoLinks)}\n`);
  writeFileSync(join(appDir, "board-snapshot.json"), `${JSON.stringify(boardPayload, null, 2)}\n`);
  copyFileSync(logoAssetPath, join(appDir, "curator-mark.png"));
  return appDir;
}

function attachTaskNote(task, noteIndex) {
  const notePath = task.receipt.note || "";
  if (!notePath) return task;
  const normalized = notePath.replaceAll("\\", "/").replace(/^\.?\//, "");
  return {
    ...task,
    note: noteIndex[normalized] || null,
  };
}

function attachTaskSubobjective(task, objectiveDir) {
  if (!task.subobjective) return task;
  const childRelative = task.subobjective.path;
  const childGoalDir = resolve(objectiveDir, dirname(childRelative));
  let childStatePath;
  try {
    childStatePath = resolveStatePath(childGoalDir);
  } catch {
    childStatePath = resolve(objectiveDir, childRelative);
  }
  validateChildSubobjectivePath(task, objectiveDir, childStatePath, childRelative);
  if (!existsSync(childStatePath)) {
    throw new ObjectiveBoardError(`Missing sub-objective state for ${task.id}: ${childRelative}`);
  }

  return {
    ...task,
    subobjective: {
      ...task.subobjective,
      path: relative(objectiveDir, childStatePath).replaceAll("\\", "/"),
      board: createBoardPayload(childGoalDir, { includeSubobjectives: false }),
    },
  };
}

function validateChildSubobjectivePath(task, objectiveDir, childStatePath, childRelative = task.subobjective.path) {
  if (task.subobjective.depth !== 1) {
    throw new ObjectiveBoardError(`Invalid sub-objective depth for ${task.id}: only depth 1 is supported.`);
  }
  const childRelativePath = relative(objectiveDir, childStatePath);
  if (!isInsideRoot(childRelativePath)) {
    throw new ObjectiveBoardError(`Invalid sub-objective path for ${task.id}: ${childRelative} must stay inside the objective root.`);
  }
  const parts = childRelativePath.split(/[\\/]+/);
  if (parts.length !== 3 || parts[0] !== "subobjectives" || !["state.yaml", "state.json"].includes(parts[2])) {
    throw new ObjectiveBoardError(`Invalid sub-objective path for ${task.id}: ${childRelative} must be subobjectives/<slug>/state.yaml or state.json.`);
  }
}

function isInsideRoot(relativePath) {
  return relativePath && relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

function loadNotes(objectiveDir) {
  const notesDir = join(objectiveDir, "notes");
  if (!existsSync(notesDir)) return {};

  const notes = {};
  for (const entry of readdirSync(notesDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const path = `notes/${entry.name}`;
    const absolute = join(notesDir, entry.name);
    const content = readFileSync(absolute, "utf8");
    notes[path] = {
      path,
      title: noteTitle(content, entry.name),
      content,
      mtimeMs: statSync(absolute).mtimeMs,
    };
  }
  return notes;
}

function noteTitle(content, filename) {
  const heading = content.split(/\r?\n/).find((line) => line.startsWith("# "));
  return heading ? heading.replace(/^#\s+/, "").trim() : basename(filename, ".md");
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

function embedBoardSnapshot(snapshot) {
  const json = JSON.stringify(snapshot).replace(/</g, "\\u003c");
  return `  <script id="board-snapshot" type="application/json">${json}</script>`;
}

function boardProvenanceHtml(repoLinks = DEFAULT_REPO_LINKS) {
  const portVersion = repoLinks.cursorPortVersion ? ` · Cursor port ${repoLinks.cursorPortVersion}` : "";
  const upstreamVersion = repoLinks.upstreamVersion ? ` (${repoLinks.upstreamVersion})` : "";
  return `  <footer class="board-provenance" aria-label="Cursor Curator port provenance">
    <p>
      Board UI from
      <a href="${repoLinks.portUrl}" target="_blank" rel="noreferrer">${repoLinks.portLabel}</a>${portVersion}
      · ported from upstream
      <a href="${repoLinks.upstreamUrl}" target="_blank" rel="noreferrer">${repoLinks.upstreamLabel}</a>${upstreamVersion}
    </p>
  </footer>`;
}

function boardHtml(snapshot, repoLinks = DEFAULT_REPO_LINKS) {
  return `<!doctype html>
<html lang="en" data-skin="${DEFAULT_BOARD_SKIN}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cursor Curator Board</title>
  ${themeFontLinksHtml()}
  <link rel="stylesheet" href="./styles.css">
</head>
<body class="theme-board">
  <header class="topbar">
    <div class="topbar-primary">
      <div class="brand" aria-label="Cursor Curator">
        <img class="brand-mark" src="./curator-mark.png" alt="Cursor Curator">
        <span class="brand-name">Cursor Curator</span>
        <span class="live-dot" id="live-dot" aria-hidden="true"></span>
      </div>
      <nav class="board-switcher is-empty" aria-label="Local Cursor Curator boards">
        <label for="board-switcher">Board</label>
        <select id="board-switcher" aria-label="Switch local board"></select>
      </nav>
    </div>
    <div class="header-tools">
      <div class="repo-links">
        <a class="github-stars" href="${repoLinks.portUrl}" target="_blank" rel="noreferrer" aria-label="Open ${repoLinks.portLabel} on GitHub">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.84 5.76 6.36.92-4.6 4.48 1.08 6.34L12 17.32 6.32 20.3l1.08-6.34-4.6-4.48 6.36-.92L12 2.8Z"></path></svg>
          <span id="github-stars">${repoLinks.portLabel}</span>
        </a>
        <a class="github-upstream" href="${repoLinks.upstreamUrl}" target="_blank" rel="noreferrer" aria-label="Open upstream Cursor Curator on GitHub">Upstream: ${repoLinks.upstreamLabel}${repoLinks.upstreamVersion ? ` @ ${repoLinks.upstreamVersion}` : ""}</a>
      </div>
      <div class="settings-wrap">
        <button class="settings-button" id="settings-button" type="button" aria-expanded="false" aria-controls="settings-popover">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12.2 2.75h-.4a1.6 1.6 0 0 0-1.58 1.36l-.18 1.18c-.46.16-.9.34-1.31.56l-1.02-.64a1.6 1.6 0 0 0-2.08.31l-.28.28a1.6 1.6 0 0 0-.31 2.08l.64 1.02c-.22.42-.4.86-.56 1.31l-1.18.18A1.6 1.6 0 0 0 2.58 12v.4A1.6 1.6 0 0 0 3.94 14l1.18.18c.16.46.34.9.56 1.31l-.64 1.02a1.6 1.6 0 0 0 .31 2.08l.28.28a1.6 1.6 0 0 0 2.08.31l1.02-.64c.42.22.86.4 1.31.56l.18 1.18a1.6 1.6 0 0 0 1.58 1.36h.4a1.6 1.6 0 0 0 1.58-1.36l.18-1.18c.46-.16.9-.34 1.31-.56l1.02.64a1.6 1.6 0 0 0 2.08-.31l.28-.28a1.6 1.6 0 0 0 .31-2.08l-.64-1.02c.22-.42.4-.86.56-1.31l1.18-.18a1.6 1.6 0 0 0 1.36-1.58V12a1.6 1.6 0 0 0-1.36-1.58l-1.18-.18a7.2 7.2 0 0 0-.56-1.31l.64-1.02a1.6 1.6 0 0 0-.31-2.08l-.28-.28a1.6 1.6 0 0 0-2.08-.31l-1.02.64c-.42-.22-.86-.4-1.31-.56l-.18-1.18a1.6 1.6 0 0 0-1.58-1.39Z"></path>
            <circle cx="12" cy="12.2" r="3.15"></circle>
          </svg>
          <span class="visually-hidden" id="live-state" aria-live="polite">Connecting</span>
        </button>
        <section class="settings-popover" id="settings-popover" aria-label="Local board settings" hidden>
          <div class="settings-heading">
            <p class="eyebrow">Board settings</p>
            <h2>Local preferences</h2>
          </div>
          <div class="setting-row">
            <label for="setting-skin">Skin</label>
            <select id="setting-skin" data-setting="skin">
              <option value="control-room">Control Room</option>
              <option value="field-notes">Field Notes</option>
              <option value="proof-ledger">Proof Ledger</option>
              <option value="relay-map">Relay Map</option>
            </select>
          </div>
          <div class="setting-row">
            <label for="setting-theme">Theme</label>
            <select id="setting-theme" data-setting="theme">
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div class="setting-row">
            <label for="setting-density">Density</label>
            <select id="setting-density" data-setting="density">
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </div>
          <div class="setting-row">
            <label for="setting-completed">Completed</label>
            <select id="setting-completed" data-setting="completedVisibility">
              <option value="show">Show</option>
              <option value="collapse">Collapse</option>
            </select>
          </div>
          <div class="setting-row">
            <label for="setting-board-open">Open boards</label>
            <select id="setting-board-open" data-setting="boardOpenBehavior">
              <option value="last">Last viewed</option>
              <option value="newest">Newest active</option>
            </select>
          </div>
          <div class="setting-row">
            <label for="setting-motion">Motion</label>
            <select id="setting-motion" data-setting="motion">
              <option value="system">System</option>
              <option value="reduce">Reduce</option>
              <option value="allow">Allow</option>
            </select>
          </div>
        </section>
      </div>
    </div>
  </header>
  <main class="shell">
    <section class="goal-header" aria-labelledby="goal-title">
      <div>
        <p class="eyebrow" id="objective-eyebrow">Objective</p>
        <h1 id="goal-title">Cursor Curator Board</h1>
        <p id="goal-tranche" class="goal-tranche"></p>
      </div>
      <dl class="goal-meta">
        <div><dt>Status</dt><dd id="goal-status">Unknown</dd></div>
        <div><dt>Active</dt><dd id="goal-active">None</dd></div>
        <div><dt>Updated</dt><dd id="goal-updated">Waiting</dd></div>
      </dl>
    </section>
    <section class="validation-banner" id="validation-banner" hidden aria-live="polite">
      <div>
        <p class="eyebrow" id="validation-eyebrow">Validation</p>
        <ul id="validation-list" class="validation-list"></ul>
      </div>
    </section>
    <section class="now-hero" id="now-hero" aria-label="Current focus">
      <div>
        <p class="eyebrow" id="now-eyebrow">Now</p>
        <p id="now-interpreted" class="now-interpreted"></p>
        <p id="now-active-objective" class="now-active-objective"></p>
      </div>
    </section>
    <section class="intake-strip" id="intake-strip" aria-label="Intake">
      <div class="intake-grid">
        <div><p class="eyebrow" id="intake-eyebrow">Original request</p><p id="intake-original" class="intake-value"></p></div>
        <div><p class="eyebrow">Completion proof</p><p id="intake-completion-proof" class="intake-value"></p></div>
        <div><p class="eyebrow">Likely misfire</p><p id="intake-misfire" class="intake-value"></p></div>
      </div>
    </section>
    <section class="progress-rail" id="progress-rail" aria-label="Progress">
      <div class="progress-counts" id="progress-counts"></div>
      <div class="progress-meta">
        <span id="progress-verification" class="progress-verification"></span>
        <span id="progress-criteria" class="progress-criteria"></span>
      </div>
    </section>
    <section class="session-pin" id="session-pin" hidden>
      <p class="eyebrow" id="session-pin-eyebrow">Last session</p>
      <p id="session-pin-text" class="session-pin-text"></p>
    </section>
    <section class="success-criteria-strip" id="success-criteria-strip" aria-label="Success criteria">
      <div>
        <p class="eyebrow" id="success-criteria-eyebrow">Signal</p>
        <p id="success-criteria-signal" class="success-criteria-signal">Waiting for board data…</p>
        <p id="success-criteria-final-proof" class="success-criteria-meta"></p>
      </div>
      <div class="success-criteria-status-wrap">
        <span class="badge" id="success-criteria-health">unknown</span>
        <p id="success-criteria-audit" class="success-criteria-meta"></p>
      </div>
    </section>
    <section class="session-strip" id="session-strip" hidden>
      <div>
        <p class="eyebrow" id="session-eyebrow">Session log</p>
        <pre id="session-log" class="session-log"></pre>
      </div>
    </section>
    <div class="board-frame">
      <div class="relay-trail" id="relay-trail" hidden aria-hidden="true"></div>
      <section class="board" id="board" aria-label="Objective task board"></section>
    </div>
  </main>
${boardProvenanceHtml(repoLinks)}
  <div class="modal" id="task-modal" hidden>
    <button class="modal-scrim" type="button" data-close-modal aria-label="Close task detail"></button>
    <article class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header class="modal-header">
        <div>
          <p class="eyebrow" id="modal-kicker">Task</p>
          <h2 id="modal-title">Task detail</h2>
        </div>
        <button class="icon-button" type="button" data-close-modal aria-label="Close task detail">x</button>
      </header>
      <div class="modal-body" id="modal-body"></div>
    </article>
  </div>
${embedBoardSnapshot(snapshot)}
  <script src="./app.js" defer></script>
</body>
</html>`;
}

function boardCss() {
  return `${themeTokensCss()}
${themeSurfaceCss()}
${boardSkinCss()}

.board-frame {
  position: relative;
}

.relay-trail[hidden] {
  display: none;
}

button,
input,
textarea {
  font: inherit;
}

a {
  color: inherit;
  text-decoration: none;
}

select,
button {
  font: inherit;
}

.topbar {
  position: sticky;
  top: 16px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: min(1392px, calc(100% - 48px));
  min-height: 64px;
  margin: 0 auto;
  padding: 10px 12px 10px 18px;
  border: 1px solid var(--topbar-border);
  border-radius: var(--radius-shell);
  background: var(--topbar-bg);
  box-shadow: var(--shadow-soft);
}

.topbar-primary {
  display: inline-flex;
  align-items: center;
  gap: 24px;
  min-width: 0;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--brand-color);
  font-weight: 800;
  min-width: fit-content;
}

:root[data-theme="dark"] .brand {
  color: var(--ink);
}

.brand-mark {
  display: block;
  width: 38px;
  height: 38px;
  filter: drop-shadow(0 2px 6px var(--accent-glow));
}

.brand-name {
  font-size: 18px;
  letter-spacing: 0;
}

.board-switcher {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-width: 0;
}

.board-switcher label {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.board-switcher select {
  width: min(280px, 100%);
  min-width: 0;
  min-height: 38px;
  border: 1px solid var(--control-border);
  border-radius: var(--radius-control);
  padding: 0 34px 0 12px;
  background: var(--control-bg);
  color: var(--control-text);
  font-weight: 600;
  font-size: 14px;
}

:root[data-theme="dark"] .board-switcher select,
:root[data-theme="dark"] .github-stars,
:root[data-theme="dark"] .github-upstream,
:root[data-theme="dark"] .settings-button {
  border-color: var(--control-border);
  background: var(--control-bg);
  color: var(--control-text);
}

.board-switcher.is-empty {
  display: none;
}

.header-tools {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: fit-content;
}

.github-stars,
.github-upstream,
.settings-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  border: 1px solid var(--control-border);
  border-radius: var(--radius-control);
  background: var(--control-bg);
  color: var(--control-text);
  font-weight: 600;
  transition: transform 180ms ease, color 180ms ease, border-color 180ms ease, background 180ms ease;
}

.repo-links {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.github-stars {
  gap: 7px;
  padding: 0 15px;
  font-size: 14px;
  white-space: nowrap;
  text-decoration: none;
}

.github-upstream {
  padding: 0 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  white-space: nowrap;
  text-decoration: none;
}

.github-stars:hover,
.github-upstream:hover,
.settings-button:hover {
  transform: translateY(-2px);
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 30%, var(--control-border));
  background: var(--surface);
}

.github-stars svg {
  width: 16px;
  height: 16px;
  color: var(--accent);
  fill: currentColor;
}

.settings-wrap {
  position: relative;
}

.settings-button {
  position: relative;
  gap: 8px;
  width: 44px;
  padding: 0;
  cursor: pointer;
}

.settings-button svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linejoin: round;
}

.live-dot {
  width: 8px;
  height: 8px;
  border: 2px solid var(--surface);
  border-radius: var(--radius-pill);
  background: var(--live-online);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--live-online) 18%, transparent);
}

.live-dot.offline {
  background: var(--live-offline);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--live-offline) 18%, transparent);
}

.settings-popover {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: min(320px, calc(100vw - 32px));
  padding: 16px;
  border: 1px solid var(--control-border);
  border-radius: var(--radius-panel);
  background: var(--surface-elevated);
  box-shadow: var(--shadow-lift);
}

:root[data-theme="dark"] .settings-popover {
  border-color: var(--control-border);
  background: var(--surface-elevated);
  box-shadow: var(--shadow-lift);
}

.settings-popover[hidden] {
  display: none;
}

.settings-heading {
  margin-bottom: 12px;
}

.settings-heading .eyebrow {
  margin-bottom: 6px;
}

.settings-heading h2 {
  margin: 0;
  font-size: 20px;
  letter-spacing: 0;
}

.setting-row {
  display: grid;
  gap: 6px;
  margin-top: 12px;
}

.setting-row label {
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
}

.setting-row select {
  min-height: 38px;
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  padding: 0 10px;
  background: var(--surface);
  color: var(--ink);
}

:root[data-theme="dark"] .setting-row select {
  background: var(--surface);
  color: var(--ink);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: var(--blue-bg);
  color: var(--blue-text);
}

.live-state.offline {
  background: var(--yellow-bg);
  color: var(--yellow-text);
}

.shell {
  width: min(1440px, 100%);
  margin: 0 auto;
  padding: 28px 24px 40px;
}

.goal-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
  align-items: end;
  padding: 8px 0 24px;
  border-bottom: 1px solid var(--line);
}

.validation-banner,
.now-hero,
.intake-strip,
.progress-rail,
.session-pin,
.success-criteria-strip,
.session-strip {
  background: var(--strip-surface, var(--surface-muted));
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  padding: 14px 16px;
  margin-top: 14px;
}

.validation-banner[data-level="error"] {
  border-color: var(--banner-error-border, #fecaca);
  background: var(--banner-error-bg, #fef2f2);
  color: var(--banner-error-ink, var(--ink-body, var(--ink)));
}

.validation-banner[data-level="warn"] {
  border-color: var(--banner-warn-border, #fde68a);
  background: var(--banner-warn-bg, #fffbeb);
  color: var(--banner-warn-ink, var(--ink-body, var(--ink)));
}

.validation-list {
  margin: 8px 0 0;
  padding-left: 18px;
  color: var(--ink-body, var(--ink));
}

.now-interpreted,
.now-active-objective {
  margin: 6px 0 0;
  color: var(--ink-body, var(--ink));
  line-height: 1.45;
}

.now-active-objective {
  color: var(--muted);
  font-size: 14px;
}

.intake-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.intake-value {
  margin: 6px 0 0;
  color: var(--ink-body, var(--ink));
  font-size: 14px;
  line-height: 1.4;
}

.intake-value.intake-weak {
  color: var(--banner-warn-ink, #92400e);
}

.progress-counts {
  font-weight: 600;
  color: var(--ink-body, var(--ink));
}

.progress-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
  font-size: 13px;
  color: var(--muted);
}

.progress-criteria.ready {
  color: var(--green-text, #166534);
}

.progress-criteria.weak {
  color: var(--banner-warn-ink, #92400e);
}

.session-pin-text {
  margin: 6px 0 0;
  color: var(--ink-body, var(--ink));
}

.task-card-focus {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.success-criteria-strip,
.session-strip {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: start;
  padding: 16px;
  border-bottom: none;
}

.success-criteria-signal {
  margin: 0;
  font-size: 15px;
  line-height: 1.45;
  max-width: 900px;
}

.success-criteria-meta {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.success-criteria-status-wrap {
  text-align: right;
}

.session-log {
  margin: 0;
  max-height: 180px;
  overflow: auto;
  white-space: pre-wrap;
  font-size: 12px;
  color: var(--muted);
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 8px;
  max-width: 900px;
  font-size: clamp(1.5rem, 2.8vw, 2rem);
  line-height: 1.15;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.goal-tranche {
  max-width: 860px;
  margin-bottom: 0;
  color: var(--ink);
  line-height: 1.55;
}

:root[data-theme="dark"] .goal-tranche,
:root[data-theme="dark"] .task-title,
:root[data-theme="dark"] .setting-row select {
  color: var(--ink);
}

.goal-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(94px, auto));
  gap: 1px;
  overflow: hidden;
  margin: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: var(--line);
}

.goal-meta div {
  min-width: 0;
  padding: 12px 14px;
  background: var(--surface);
}

.goal-meta dt {
  margin-bottom: 6px;
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.goal-meta dd {
  margin: 0;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.board {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  padding-top: 18px;
}

.column {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 0 0 var(--radius-panel) var(--radius-panel);
  background: var(--surface);
  box-shadow: var(--shadow-soft);
  overflow: hidden;
}

.column-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-muted);
  border-radius: 0;
}

.column-header h2 {
  margin: 0 0 4px;
  font-size: 13px;
  line-height: 1.2;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.column-header p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.4;
}

.column-count {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 13px;
}

.card-list {
  display: grid;
  gap: 10px;
  padding: 12px;
}

.task-card {
  position: relative;
  width: 100%;
  min-height: 138px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: var(--surface);
  color: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  transition: transform 160ms ease, border-color 160ms ease;
  will-change: transform, opacity;
}

.task-card > * {
  position: relative;
  z-index: 1;
}

.task-card:hover {
  border-color: var(--line-strong);
  transform: translateY(-1px);
}

.task-card:focus-visible,
.icon-button:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}

.task-card.is-active {
  border-color: transparent;
  background: linear-gradient(var(--active-surface), var(--active-surface)) padding-box,
    var(--active-border-gradient) border-box;
  box-shadow: 0 14px 38px var(--accent-glow);
}

.task-card.is-active::before {
  position: absolute;
  inset: -2px;
  z-index: 0;
  content: "";
  background: conic-gradient(from 0deg, transparent 0 58%, rgba(59, 130, 246, 0.34), rgba(6, 182, 212, 0.38), transparent 78% 100%);
  opacity: 0.86;
  animation: active-card-orbit 2.8s linear infinite;
}

.task-card.is-active::after {
  position: absolute;
  inset: 2px;
  z-index: 0;
  content: "";
  border-radius: calc(var(--radius-card) - 2px);
  background: var(--active-surface);
}

:root[data-theme="dark"] .task-card.is-active {
  background: linear-gradient(var(--active-surface), var(--active-surface)) padding-box,
    var(--active-border-gradient) border-box;
}

:root[data-theme="dark"] .task-card.is-active::after {
  background: var(--active-surface);
}

:root[data-density="compact"] .shell {
  padding-top: 20px;
}

:root[data-density="compact"] .board {
  gap: 12px;
}

:root[data-density="compact"] .column-header {
  padding: 12px;
}

:root[data-density="compact"] .card-list {
  gap: 8px;
  padding: 10px;
}

:root[data-density="compact"] .task-card {
  min-height: 110px;
  gap: 9px;
  padding: 11px;
}

:root[data-density="compact"] .task-title {
  font-size: 14px;
}

:root[data-completed-visibility="collapse"] .column[data-column-id="completed"] .card-list {
  display: none;
}

:root[data-completed-visibility="collapse"] .column[data-column-id="completed"] {
  max-height: 80px;
  overflow: hidden;
}

.task-card.is-moving {
  border-color: color-mix(in srgb, var(--accent-secondary) 40%, var(--line));
}

.card-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.task-id {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 12px;
}

.task-title {
  margin: 0;
  color: var(--ink);
  display: -webkit-box;
  font-size: 15px;
  line-height: 1.35;
  overflow: hidden;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
}

.card-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: auto;
}

.badge.status-active,
.badge.status-queued { background: var(--blue-bg); color: var(--blue-text); }
.badge.status-done { background: var(--green-bg); color: var(--green-text); }
.badge.status-blocked { background: var(--red-bg); color: var(--red-text); }
.badge.role { background: var(--yellow-bg); color: var(--yellow-text); }
.badge.subobjective { background: var(--accent-secondary-soft); color: var(--accent-secondary-text); }
.badge.subobjective.status-blocked { background: var(--red-bg); color: var(--red-text); }
.badge.subobjective.status-done { background: var(--green-bg); color: var(--green-text); }

:root[data-theme="dark"] .badge.subobjective {
  background: var(--accent-secondary-soft);
  color: var(--accent-secondary-text);
}

.empty {
  padding: 18px;
  color: var(--muted);
  font-size: 14px;
}

.board-error {
  grid-column: 1 / -1;
  padding: 18px;
  border: 1px solid var(--red-border);
  border-radius: var(--radius-card);
  background: var(--red-bg);
  color: var(--text);
}

.board-error h2 {
  margin: 0 0 8px;
  font-size: 16px;
}

.board-error p {
  margin: 0;
  color: var(--muted);
}

.board-provenance {
  max-width: 1180px;
  margin: 0 auto;
  padding: 0 24px 28px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.board-provenance p {
  margin: 0;
}

.board-provenance a {
  color: inherit;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.board-provenance a:hover {
  color: var(--ink);
}

@media (prefers-reduced-motion: reduce) {
  .github-stars,
  .github-upstream,
  .settings-button,
  .task-card {
    transition: none;
  }

  .task-card.is-active::before {
    animation: none;
    opacity: 0.26;
  }
}

:root[data-motion="reduce"] .github-stars,
:root[data-motion="reduce"] .github-upstream,
:root[data-motion="reduce"] .settings-button,
:root[data-motion="reduce"] .task-card {
  transition: none;
}

:root[data-motion="reduce"] .task-card.is-active::before {
  animation: none;
  opacity: 0.26;
}

.modal[hidden] {
  display: none;
}

.modal {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 24px;
}

.modal-scrim {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(17, 17, 17, 0.32);
}

.modal-panel {
  position: relative;
  width: min(1080px, 100%);
  max-height: min(760px, calc(100vh - 48px));
  overflow: auto;
  border: 1px solid var(--modal-border);
  border-radius: var(--radius-card);
  background: var(--modal-surface);
  color: var(--modal-ink);
}

.modal-header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  border-bottom: 1px solid var(--modal-border);
  background: var(--modal-header-bg);
  color: var(--modal-header-ink);
}

.modal-header .eyebrow {
  color: var(--modal-header-muted);
}

.modal-header h2 {
  margin: 0;
  font-size: 24px;
  line-height: 1.15;
  letter-spacing: 0;
}

.modal-header .icon-button {
  border-color: var(--modal-icon-border);
  background: var(--modal-icon-bg);
  color: var(--modal-icon-ink);
}

.icon-button {
  width: 32px;
  height: 32px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
}

.modal-body {
  display: grid;
  gap: 18px;
  padding: 20px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--modal-border);
  border-radius: var(--radius-card);
  background: var(--modal-border);
}

.detail-item {
  min-width: 0;
  padding: 12px;
  background: var(--modal-meta-bg);
}

.detail-item dt {
  margin-bottom: 6px;
  color: var(--modal-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.detail-item dd {
  margin: 0;
  line-height: 1.45;
  color: var(--modal-meta-ink);
}

.detail-section {
  border-top: 1px solid var(--modal-border);
  padding-top: 14px;
}

.detail-section h3 {
  margin: 0 0 10px;
  font-size: 14px;
}

.detail-section ul {
  margin: 0;
  padding-left: 18px;
  line-height: 1.55;
}

.subobjective-section {
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  padding: 14px;
  background: var(--surface-muted);
}

.subobjective-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.subobjective-title {
  margin: 0 0 4px;
  font-size: 15px;
}

.subobjective-meta {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

.subobjective-board {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.subobjective-column {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 0 0 var(--radius-card) var(--radius-card);
  background: var(--surface);
  overflow: hidden;
}

.subobjective-column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid var(--line);
}

.subobjective-column-header h4 {
  margin: 0;
  font-size: 12px;
}

.subobjective-card-list {
  display: grid;
  gap: 8px;
  padding: 8px;
}

.subobjective-task-card {
  min-height: 74px;
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 9px;
  background: var(--surface);
}

.subobjective-task-card.is-active {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  background: var(--active-surface);
}

.subobjective-task-title {
  margin: 6px 0 0;
  color: var(--ink);
  font-size: 12px;
  line-height: 1.35;
}

pre.note {
  overflow: auto;
  margin: 0;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: var(--canvas);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
}

@media (max-width: 980px) {
  .goal-header {
    grid-template-columns: 1fr;
  }

  .goal-meta {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .board {
    grid-template-columns: 1fr;
  }

  .subobjective-board {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .topbar {
    align-items: flex-start;
  }

  .topbar-primary {
    flex: 1;
    flex-wrap: wrap;
    gap: 10px 14px;
  }

  .board-switcher select {
    width: 100%;
  }

  .shell {
    padding-left: 14px;
    padding-right: 14px;
  }

  .goal-meta,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  h1 {
    font-size: 1.35rem;
  }
}`;
}

function boardJs(repoLinks = DEFAULT_REPO_LINKS) {
  const portRepoApiUrl = `https://api.github.com/repos/${repoLinks.portApiSlug || githubSlugFromUrl(repoLinks.portUrl)}`;
  const skinCopyJson = JSON.stringify(BOARD_SKIN_COPY);
  const defaultSkinJson = JSON.stringify(DEFAULT_BOARD_SKIN);
  return `let currentBoard = null;
let eventSource = null;
let currentSettings = null;

const boardEl = document.getElementById("board");
const relayTrailEl = document.getElementById("relay-trail");
const liveStateEl = document.getElementById("live-state");
const liveDotEl = document.getElementById("live-dot");
const boardSwitcherEl = document.getElementById("board-switcher");
const settingsButtonEl = document.getElementById("settings-button");
const settingsPopoverEl = document.getElementById("settings-popover");
const githubStarsEl = document.getElementById("github-stars");
const modalEl = document.getElementById("task-modal");
const modalTitleEl = document.getElementById("modal-title");
const modalKickerEl = document.getElementById("modal-kicker");
const modalBodyEl = document.getElementById("modal-body");
const objectiveEyebrowEl = document.getElementById("objective-eyebrow");
const successCriteriaEyebrowEl = document.getElementById("success-criteria-eyebrow");
const sessionEyebrowEl = document.getElementById("session-eyebrow");
const nowEyebrowEl = document.getElementById("now-eyebrow");
const intakeEyebrowEl = document.getElementById("intake-eyebrow");
const validationEyebrowEl = document.getElementById("validation-eyebrow");
const sessionPinEyebrowEl = document.getElementById("session-pin-eyebrow");
const settingsStorageKey = "cursor-curator.localBoardSettings.v1";
const skinStorageKey = "cursor-curator.boardSkin.v1";
const skinCopy = ${skinCopyJson};
const settingsDefaults = {
  skin: ${defaultSkinJson},
  theme: "system",
  density: "comfortable",
  completedVisibility: "show",
  boardOpenBehavior: "last",
  motion: "system",
  lastBoardPath: "",
};
const settingsOptions = {
  skin: new Set(${JSON.stringify(BOARD_SKIN_IDS)}),
  theme: new Set(["system", "light", "dark"]),
  density: new Set(["comfortable", "compact"]),
  completedVisibility: new Set(["show", "collapse"]),
  boardOpenBehavior: new Set(["last", "newest"]),
  motion: new Set(["system", "reduce", "allow"]),
};

try {
  const bootstrapSkin = window.localStorage?.getItem(skinStorageKey);
  if (bootstrapSkin && settingsOptions.skin.has(bootstrapSkin)) {
    document.documentElement.dataset.skin = bootstrapSkin;
  }
  const bootstrapRaw = window.localStorage?.getItem(settingsStorageKey);
  if (bootstrapRaw) {
    const bootstrap = JSON.parse(bootstrapRaw);
    if (!bootstrapSkin && settingsOptions.skin.has(bootstrap.skin)) {
      document.documentElement.dataset.skin = bootstrap.skin;
    }
    if (settingsOptions.theme.has(bootstrap.theme)) document.documentElement.dataset.theme = bootstrap.theme;
    if (settingsOptions.density.has(bootstrap.density)) document.documentElement.dataset.density = bootstrap.density;
    if (settingsOptions.completedVisibility.has(bootstrap.completedVisibility)) {
      document.documentElement.dataset.completedVisibility = bootstrap.completedVisibility;
    }
    if (settingsOptions.motion.has(bootstrap.motion)) document.documentElement.dataset.motion = bootstrap.motion;
  }
} catch {
  // Ignore malformed bootstrap settings and fall back to defaults.
}

document.addEventListener("click", (event) => {
  const card = event.target.closest("[data-task-id]");
  if (card) openTask(card.dataset.taskId);
  if (event.target.matches("[data-close-modal]")) closeModal();
  if (settingsPopoverEl.hidden) return;
  if (!event.target.closest(".settings-wrap")) closeSettings();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal();
    closeSettings();
  }
});

boardSwitcherEl.addEventListener("change", () => {
  if (boardSwitcherEl.value && boardSwitcherEl.value !== window.location.href) {
    window.location.href = boardSwitcherEl.value;
  }
});

settingsButtonEl.addEventListener("click", () => {
  if (settingsPopoverEl.hidden) {
    openSettings();
  } else {
    closeSettings();
  }
});

settingsPopoverEl.addEventListener("change", (event) => {
  const control = event.target.closest("[data-setting]");
  if (!control) return;
  if (control.dataset.setting === "skin") {
    writeStoredSkin(control.value);
  }
  saveSettings({ ...(currentSettings || settingsDefaults), [control.dataset.setting]: control.value });
});

async function loadBoardSnapshot() {
  const embedded = document.getElementById("board-snapshot");
  if (embedded?.textContent) {
    try {
      return JSON.parse(embedded.textContent);
    } catch {
      return null;
    }
  }
  try {
    const response = await fetch("./board-snapshot.json", { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function boardOfflineMessage() {
  return "Start the local board server, then open http://127.0.0.1:41737/<goal-slug>/ (or refresh this page after running: node ~/.cursor/skills/cursor-curator/scripts/curator.mjs board docs/objectives/<slug>).";
}

async function loadBoard() {
  try {
    const response = await fetch("./api/board", { cache: "no-store" });
    if (!response.ok) throw new Error("Board request failed");
    renderBoard(await response.json());
    return true;
  } catch {
    const snapshot = await loadBoardSnapshot();
    if (!snapshot) throw new Error(boardOfflineMessage());
    renderBoard(snapshot);
    return false;
  }
}

async function loadBoardSwitcher() {
  const response = await fetch("../api/boards", { cache: "no-store" });
  if (!response.ok) return;
  const payload = await response.json();
  renderBoardSwitcher(payload.boards || []);
}

async function loadSettings() {
  const stored = readStoredSettings();
  try {
    const response = await fetch("../api/settings", { cache: "no-store" });
    if (!response.ok) throw new Error("Settings request failed");
    const payload = await response.json();
    const rawRemote = payload.settings || {};
    currentSettings = mergeLoadedSettings(stored, rawRemote);
    writeStoredSkin(currentSettings.skin);
    window.localStorage?.setItem(settingsStorageKey, JSON.stringify(currentSettings));
    if (!Object.prototype.hasOwnProperty.call(rawRemote, "skin")) {
      syncSettingsToServer(currentSettings).catch(() => {});
    }
  } catch {
    currentSettings = mergeLoadedSettings(stored, {});
    writeStoredSkin(currentSettings.skin);
  }
  applySettings(currentSettings);
}

async function syncSettingsToServer(settings) {
  const response = await fetch("../api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings: normalizeSettings(settings) }),
  });
  if (!response.ok) throw new Error("Settings sync failed");
  return normalizeSettings((await response.json()).settings);
}

async function saveSettings(nextSettings) {
  const local = normalizeSettings({ ...(currentSettings || settingsDefaults), ...nextSettings });
  writeStoredSkin(local.skin);
  currentSettings = local;
  window.localStorage?.setItem(settingsStorageKey, JSON.stringify(currentSettings));
  applySettings(currentSettings);
  try {
    const remote = await syncSettingsToServer(currentSettings);
    currentSettings = mergeLoadedSettings(currentSettings, remote);
    writeStoredSkin(currentSettings.skin);
    window.localStorage?.setItem(settingsStorageKey, JSON.stringify(currentSettings));
    applySettings(currentSettings);
  } catch {
    // Keep the localStorage fallback active when the local settings API is unavailable.
  }
  return currentSettings;
}

function readStoredSkin(fallback = settingsDefaults.skin) {
  try {
    const dedicated = window.localStorage?.getItem(skinStorageKey);
    if (dedicated && settingsOptions.skin.has(dedicated)) return dedicated;
    const legacy = JSON.parse(window.localStorage?.getItem(settingsStorageKey) || "{}");
    if (legacy.skin && settingsOptions.skin.has(legacy.skin)) {
      window.localStorage?.setItem(skinStorageKey, legacy.skin);
      return legacy.skin;
    }
  } catch {
    // Ignore malformed skin storage.
  }
  return fallback;
}

function writeStoredSkin(skin) {
  if (!settingsOptions.skin.has(skin)) return;
  window.localStorage?.setItem(skinStorageKey, skin);
}

function readStoredSettings() {
  try {
    return normalizeSettings(JSON.parse(window.localStorage?.getItem(settingsStorageKey) || "{}"));
  } catch {
    return { ...settingsDefaults };
  }
}

function mergeLoadedSettings(stored, remote) {
  const normalizedStored = normalizeSettings(stored);
  const normalizedRemote = normalizeSettings(remote);
  return normalizeSettings({
    ...normalizedRemote,
    skin: readStoredSkin(normalizedStored.skin),
    theme: normalizedStored.theme,
    density: normalizedStored.density,
    completedVisibility: normalizedStored.completedVisibility,
    motion: normalizedStored.motion,
    lastBoardPath: normalizedRemote.lastBoardPath || normalizedStored.lastBoardPath,
    boardOpenBehavior: normalizedRemote.boardOpenBehavior || normalizedStored.boardOpenBehavior,
  });
}

function normalizeSettings(settings) {
  const normalized = { ...settingsDefaults };
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return normalized;
  for (const [key, allowed] of Object.entries(settingsOptions)) {
    if (allowed.has(settings[key])) normalized[key] = settings[key];
  }
  if (typeof settings.lastBoardPath === "string" && /^\\/[a-z0-9][a-z0-9-]*\\/$/.test(settings.lastBoardPath)) {
    normalized.lastBoardPath = settings.lastBoardPath;
  }
  return normalized;
}

function applySettings(settings) {
  const normalized = normalizeSettings({
    ...settings,
    skin: readStoredSkin(normalizeSettings(settings).skin),
  });
  writeStoredSkin(normalized.skin);
  currentSettings = normalized;
  document.documentElement.dataset.skin = normalized.skin;
  document.documentElement.dataset.theme = normalized.theme;
  document.documentElement.dataset.density = normalized.density;
  document.documentElement.dataset.completedVisibility = normalized.completedVisibility;
  document.documentElement.dataset.boardOpenBehavior = normalized.boardOpenBehavior;
  document.documentElement.dataset.motion = normalized.motion;
  applySkinCopy(normalized.skin);
  updateRelayTrailVisibility(normalized.skin);
  for (const control of settingsPopoverEl.querySelectorAll("[data-setting]")) {
    control.value = normalized[control.dataset.setting] || settingsDefaults[control.dataset.setting];
  }
  if (currentBoard) renderBoard(currentBoard);
}

function currentSkin() {
  return normalizeSettings(currentSettings || settingsDefaults).skin;
}

function skinLabels(skin) {
  return skinCopy[skin] || skinCopy[${defaultSkinJson}];
}

function applySkinCopy(skin) {
  const labels = skinLabels(skin);
  if (objectiveEyebrowEl) objectiveEyebrowEl.textContent = labels.objectiveEyebrow;
  if (successCriteriaEyebrowEl) successCriteriaEyebrowEl.textContent = labels.successCriteriaEyebrow;
  if (sessionEyebrowEl) sessionEyebrowEl.textContent = labels.sessionEyebrow;
  if (nowEyebrowEl) nowEyebrowEl.textContent = labels.nowEyebrow || "Now";
  if (intakeEyebrowEl) intakeEyebrowEl.textContent = labels.intakeEyebrow || "Intake";
  if (validationEyebrowEl) validationEyebrowEl.textContent = labels.validationEyebrow || "Validation";
  if (sessionPinEyebrowEl) sessionPinEyebrowEl.textContent = labels.sessionEyebrow;
}

function updateRelayTrailVisibility(skin) {
  if (!relayTrailEl) return;
  relayTrailEl.hidden = skin !== "relay-map";
}

function columnLabels(column) {
  const labels = {
    todo: { title: "Todo", description: "Queued work ready to pull" },
    "in-progress": { title: "In Progress", description: "The active task" },
    blocked: { title: "Blocked", description: "Needs unblock or a smaller slice" },
    completed: { title: "Completed", description: "Receipted work" },
  };
  const skin = currentSkin();
  const skinColumns = {
    "control-room": {
      todo: { title: "Queued", description: "Work ready to pull" },
      "in-progress": { title: "Running", description: "No agent running — pull next task from Queued" },
      blocked: { title: "Blocked", description: "Waiting on you or a dependency" },
      completed: { title: "Shipped", description: "Receipted work" },
    },
    "field-notes": {
      todo: { title: "Backlog", description: "Queued for later" },
      "in-progress": { title: "Today", description: "Where attention goes now" },
      blocked: { title: "Stuck", description: "Needs unblock before continuing" },
      completed: { title: "Logged", description: "Receipted and filed" },
    },
    "proof-ledger": {
      todo: { title: "Unverified claims", description: "Queued work awaiting evidence" },
      "in-progress": { title: "Under review", description: "The active task" },
      blocked: { title: "Disputed", description: "Blocked until resolved" },
      completed: { title: "Verified", description: "Receipt on file" },
    },
    "relay-map": {
      todo: { title: "Queued", description: "Waypoints ahead" },
      "in-progress": { title: "Running", description: "Current waypoint" },
      blocked: { title: "Blocked", description: "Trail closed — resolve block to continue" },
      completed: { title: "Done", description: "Summit checkpoints cleared" },
    },
  };
  return skinColumns[skin]?.[column.id] || labels[column.id] || { title: column.title, description: column.description };
}

function emptyColumnMessage() {
  return skinLabels(currentSkin()).emptyColumn;
}

function receiptGutterSymbol(task) {
  if (task.status === "done") return task.receipt?.present ? "✓" : "✓";
  if (task.status === "blocked") return "✗";
  if (task.receipt?.present) return "✓";
  return "—";
}

function rememberCurrentBoard() {
  const boardPath = normalizePath(window.location.pathname);
  if (!/^\\/[a-z0-9][a-z0-9-]*\\/$/.test(boardPath)) return;
  const nextSettings = normalizeSettings({ ...currentSettings, lastBoardPath: boardPath });
  currentSettings = nextSettings;
  window.localStorage?.setItem(settingsStorageKey, JSON.stringify(nextSettings));
  fetch("../api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings: nextSettings }),
  }).catch(() => {});
}

function openSettings() {
  settingsPopoverEl.hidden = false;
  settingsButtonEl.setAttribute("aria-expanded", "true");
  settingsPopoverEl.querySelector("[data-setting]")?.focus();
}

function closeSettings() {
  settingsPopoverEl.hidden = true;
  settingsButtonEl.setAttribute("aria-expanded", "false");
}

function formatStars(count) {
  if (count >= 1000) return \`\${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k\`;
  return String(count);
}

async function loadGithubStars() {
  if (!githubStarsEl) return;
  try {
    const response = await fetch(${JSON.stringify(portRepoApiUrl)}, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error("GitHub API unavailable");
    const repo = await response.json();
    githubStarsEl.textContent = \`\${formatStars(repo.stargazers_count)} stars\`;
  } catch {
    githubStarsEl.textContent = ${JSON.stringify(repoLinks.portLabel)};
  }
}

function connectEvents() {
  eventSource = new EventSource("./events");
  eventSource.addEventListener("board", (event) => {
    setLiveState("Live", true);
    renderBoard(JSON.parse(event.data));
  });
  eventSource.addEventListener("error", () => {
    setLiveState("Reconnecting", false);
  });
}

function renderBoard(board) {
  const previousPositions = measureCards();
  const previousColumns = new Map();
  for (const column of currentBoard?.columns || []) {
    for (const task of column.tasks) previousColumns.set(task.id, column.id);
  }
  const movingTaskIds = tasksChangingColumns(board, previousColumns);
  if (movingTaskIds.size) highlightMovingCards(movingTaskIds);
  currentBoard = board;
  document.getElementById("goal-title").textContent = board.objective.title;
  document.title = board.objective.title ? board.objective.title + " - Cursor Curator Board" : "Cursor Curator Board";
  document.getElementById("goal-tranche").textContent = board.objective.tranche || "";
  document.getElementById("goal-status").textContent = board.objective.status;
  document.getElementById("goal-active").textContent = board.objective.activeTask || "None";
  document.getElementById("goal-updated").textContent = new Date(board.generatedAt).toLocaleTimeString();
  renderSuccessCriteriaStrip(board);
  renderValidationBanner(board);
  renderNowHero(board);
  renderIntakeStrip(board);
  renderProgressRail(board);
  renderSessionPin(board);
  renderSessionStrip(board);

  if (board.error) {
    boardEl.replaceChildren(renderBoardError(board.error));
    return;
  }

  const delay = movingTaskIds.size ? 260 : 0;
  window.setTimeout(() => {
    boardEl.replaceChildren(...board.columns.map(renderColumn));
    animateCardMoves(previousPositions, movingTaskIds);
    focusActiveTaskCard(board.objective.activeTask);
  }, delay);
}

function focusActiveTaskCard(taskId) {
  if (!taskId) return;
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    || document.documentElement.dataset.motion === "reduce";
  const card = document.querySelector(\`.task-card[data-task-id="\${taskId}"]\`);
  if (!card) return;
  card.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "nearest", inline: "nearest" });
  card.classList.add("task-card-focus");
  window.setTimeout(() => card.classList.remove("task-card-focus"), prefersReduced ? 0 : 1200);
}

function renderValidationBanner(board) {
  const banner = document.getElementById("validation-banner");
  const list = document.getElementById("validation-list");
  if (!banner || !list) return;
  const issues = [
    ...(board.validation?.errors || []).map((entry) => ({ level: "error", text: entry })),
    ...(board.validation?.warnings || []).map((entry) => ({ level: "warn", text: entry })),
    ...(board.completion?.blockers || []).filter((entry) => !(board.validation?.errors || []).includes(entry))
      .map((entry) => ({ level: "blocker", text: entry })),
  ];
  if (!issues.length) {
    banner.hidden = true;
    list.replaceChildren();
    return;
  }
  banner.hidden = false;
  banner.dataset.level = issues.some((entry) => entry.level === "error") ? "error" : "warn";
  list.replaceChildren(...issues.slice(0, 6).map((entry) => {
    const item = el("li", \`validation-item validation-\${entry.level}\`, entry.text);
    return item;
  }));
}

function renderNowHero(board) {
  const interpreted = document.getElementById("now-interpreted");
  const activeObjective = document.getElementById("now-active-objective");
  if (!interpreted || !activeObjective) return;
  const intakeOutcome = board.objective?.intake?.interpreted_outcome || "";
  const taskObjective = board.activeTaskDetail?.objective || "";
  interpreted.textContent = intakeOutcome || "No interpreted outcome recorded yet.";
  activeObjective.textContent = taskObjective
    ? \`Active \${board.activeTaskDetail.id}: \${taskObjective}\`
    : "No active task objective.";
}

function renderIntakeStrip(board) {
  const original = document.getElementById("intake-original");
  const completionProof = document.getElementById("intake-completion-proof");
  const misfire = document.getElementById("intake-misfire");
  if (!original || !completionProof || !misfire) return;
  const intake = board.objective?.intake || {};
  original.textContent = intake.original_request || "—";
  completionProof.textContent = intake.completion_proof || "—";
  misfire.textContent = intake.likely_misfire || "—";
  if (isWeakOracle(intake.likely_misfire)) misfire.classList.add("intake-weak");
  else misfire.classList.remove("intake-weak");
}

function renderProgressRail(board) {
  const counts = document.getElementById("progress-counts");
  const verification = document.getElementById("progress-verification");
  const criteria = document.getElementById("progress-criteria");
  if (!counts || !verification || !criteria) return;
  const progress = board.progress || {};
  counts.textContent = \`\${progress.done || 0}/\${progress.total || 0} done · \${progress.active || 0} active · \${progress.blocked || 0} blocked · \${progress.queued || 0} queued\`;
  const last = board.lastVerification?.result;
  verification.textContent = last ? \`Last verification: \${last}\` : "Last verification: none";
  criteria.textContent = board.completion?.success_criteria_ready ? "Success criteria ready" : "Success criteria weak";
  criteria.className = board.completion?.success_criteria_ready ? "progress-criteria ready" : "progress-criteria weak";
}

function renderSessionPin(board) {
  const pin = document.getElementById("session-pin");
  const text = document.getElementById("session-pin-text");
  if (!pin || !text) return;
  if (!board.sessionPreview) {
    pin.hidden = true;
    return;
  }
  pin.hidden = false;
  text.textContent = board.sessionPreview;
}

function renderBoardError(message) {
  const node = el("section", "board-error");
  node.append(
    el("h2", "", "Cursor Curator could not parse this board"),
    el("p", "", message),
  );
  return node;
}

function renderSuccessCriteriaStrip(board) {
  const signalEl = document.getElementById("success-criteria-signal");
  const finalProofEl = document.getElementById("success-criteria-final-proof");
  const healthEl = document.getElementById("success-criteria-health");
  const auditEl = document.getElementById("success-criteria-audit");
  if (!signalEl || !healthEl) return;

  const signal = board.objective?.success_criteria?.signal || "";
  const finalProof = board.objective?.success_criteria?.final_proof || "";
  signalEl.textContent = signal || "No success criteria signal recorded.";
  finalProofEl.textContent = finalProof ? \`Final proof: \${finalProof}\` : "";
  const weak = isWeakOracle(signal) || isWeakOracle(finalProof);
  healthEl.textContent = weak ? "weak success criteria" : "success criteria ready";
  healthEl.className = \`badge \${weak ? "status-blocked" : "status-done"}\`;
  const doneWorkers = (board.tasks || []).filter((task) => task.type === "worker" && task.status === "done").length;
  auditEl.textContent = \`\${doneWorkers} worker receipt(s); final audit maps proof to success criteria.\`;
}

function renderSessionStrip(board) {
  const strip = document.getElementById("session-strip");
  const log = document.getElementById("session-log");
  if (!strip || !log) return;
  if (!board.sessionLog) {
    strip.hidden = true;
    return;
  }
  strip.hidden = false;
  log.textContent = board.sessionLog;
}

function isWeakOracle(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "tbd" || normalized === "unknown" || normalized === "todo" || /^<.*>$/.test(normalized);
}

function renderBoardSwitcher(boards) {
  boardSwitcherEl.closest(".board-switcher").classList.toggle("is-empty", boards.length <= 1);
  const currentPath = normalizePath(window.location.pathname);
  const options = boards.map((board) => {
    const option = document.createElement("option");
    option.value = board.url;
    option.textContent = boardOptionLabel(board);
    const boardPath = normalizePath(new URL(board.url, window.location.href).pathname);
    if (boardPath === currentPath) option.selected = true;
    return option;
  });
  boardSwitcherEl.replaceChildren(...options);
}

function renderColumn(column) {
  const labels = columnLabels(column);
  const section = el("section", "column");
  section.dataset.columnId = column.id;
  const header = el("header", "column-header");
  const titleWrap = el("div");
  titleWrap.append(el("h2", "", labels.title), el("p", "", labels.description));
  header.append(titleWrap, el("span", "column-count", String(column.tasks.length)));

  const list = el("div", "card-list");
  if (column.tasks.length === 0) {
    list.append(el("p", "empty", emptyColumnMessage()));
  } else {
    for (const task of column.tasks) list.append(renderCard(task));
  }

  section.append(header, list);
  return section;
}

function renderCard(task) {
  const skin = currentSkin();
  const button = el("button", \`task-card \${task.active ? "is-active" : ""}\${skin === "field-notes" && task.status === "blocked" ? " is-stuck" : ""}\`);
  button.type = "button";
  button.dataset.taskId = task.id;
  button.dataset.status = task.status;

  if (skin === "proof-ledger") {
    button.append(
      el("span", "task-id-inline", task.id),
      el("h3", "task-title", task.title),
      el("span", \`receipt-gutter \${task.status === "blocked" ? "is-disputed" : task.receipt?.present || task.status === "done" ? "" : "is-pending"}\`, receiptGutterSymbol(task)),
    );
    return button;
  }

  const topline = el("div", "card-topline");
  topline.append(el("span", "task-id", task.id), statusBadge(task.status));

  const footer = el("div", "card-footer");
  footer.append(el("span", "badge role", task.assignee || task.type || "PM"));
  if (task.subobjective) footer.append(subobjectiveBadge(task.subobjective));
  if (task.receipt?.present) footer.append(el("span", "badge status-done", "Receipt"));

  if (skin === "control-room" && task.active) {
    button.append(el("span", "scan-line"));
  }

  button.append(topline, el("h3", "task-title", task.title), footer);
  return button;
}

function measureCards() {
  const positions = new Map();
  for (const card of boardEl.querySelectorAll("[data-task-id]")) {
    const rect = card.getBoundingClientRect();
    positions.set(card.dataset.taskId, {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      columnId: card.closest("[data-column-id]")?.dataset.columnId || "",
    });
  }
  return positions;
}

function tasksChangingColumns(board, previousColumns) {
  const moving = new Set();
  for (const column of board.columns) {
    for (const task of column.tasks) {
      const previousColumn = previousColumns.get(task.id);
      if (previousColumn && previousColumn !== column.id) moving.add(task.id);
    }
  }
  return moving;
}

function highlightMovingCards(taskIds) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const card of boardEl.querySelectorAll("[data-task-id]")) {
    if (!taskIds.has(card.dataset.taskId)) continue;
    card.classList.add("is-moving");
    card.animate([
      { transform: "scale(1)", borderColor: "#e2e8f0" },
      { transform: "scale(1.02)", borderColor: "#2563eb" },
      { transform: "scale(1)", borderColor: "#93c5fd" },
    ], {
      duration: 240,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    });
  }
}

function animateCardMoves(previousPositions, movingTaskIds = new Set()) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  for (const card of boardEl.querySelectorAll("[data-task-id]")) {
    const previous = previousPositions.get(card.dataset.taskId);
    const current = card.getBoundingClientRect();
    const columnId = card.closest("[data-column-id]")?.dataset.columnId || "";

    if (!previous) {
      card.animate([
        { opacity: 0, transform: "translateY(10px) scale(0.98)" },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ], {
        duration: 260,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      });
      continue;
    }

    const dx = previous.left - current.left;
    const dy = previous.top - current.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

    const changedColumn = previous.columnId !== columnId;
    const wasSelected = movingTaskIds.has(card.dataset.taskId);
    card.animate([
      {
        transform: \`translate(\${dx}px, \${dy}px) scale(\${changedColumn ? "1.015" : "1"})\`,
        opacity: changedColumn ? 0.9 : 1,
        borderColor: wasSelected ? "#2563eb" : "#e2e8f0",
      },
      {
        transform: "translate(0, 0) scale(1)",
        opacity: 1,
        borderColor: "#e2e8f0",
      },
    ], {
      duration: changedColumn ? 980 : 520,
      easing: "cubic-bezier(0.19, 1, 0.22, 1)",
    });
  }
}

function openTask(taskId) {
  const task = currentBoard?.tasks.find((candidate) => candidate.id === taskId);
  if (!task) return;

  const labels = skinLabels(currentSkin());
  modalKickerEl.textContent = \`\${labels.modalKicker} · \${task.id} · \${task.status}\`;
  modalTitleEl.textContent = task.title;
  modalBodyEl.replaceChildren(renderTaskDetail(task));
  modalEl.hidden = false;
}

function closeModal() {
  modalEl.hidden = true;
}

function renderTaskDetail(task) {
  const labels = skinLabels(currentSkin()).sections;
  const skin = currentSkin();
  const root = el("div");
  const grid = el("dl", "detail-grid");
  for (const [label, value] of [
    ["Status", task.status],
    ["Assignee", task.assignee || "Unassigned"],
    ["Type", task.type],
    ["Receipt", task.receipt?.summary || (skin === "control-room" ? skinLabels(currentSkin()).receiptEmpty : "None")],
  ]) {
    const item = el("div", "detail-item");
    item.append(el("dt", "", label), el("dd", "", value));
    grid.append(item);
  }
  root.append(grid);
  if (task.subobjective) root.append(renderSubobjective(task.subobjective));
  root.append(detailText(labels.objective, task.objective));
  root.append(detailList(labels.inputs, task.inputs));
  root.append(detailList(labels.constraints, task.constraints));
  root.append(detailList(labels.expectedOutput, task.expectedOutput));
  root.append(detailList(labels.allowedFiles, task.allowedFiles));
  root.append(detailList(labels.verify, task.verify));
  root.append(detailList(labels.stopIf, task.stopIf));
  if (task.receipt?.decision) root.append(detailText(labels.decision, task.receipt.decision));
  if (task.receipt?.changedFiles?.length) root.append(detailList(labels.changedFiles, task.receipt.changedFiles));
  if (task.receipt?.commands?.length) {
    const section = el("section", "detail-section");
    section.append(el("h3", "", labels.commands));
    const list = el("ul", "command-list");
    for (const command of task.receipt.commands) {
      const item = el("li", "command-item");
      const status = command.status ? el("span", \`badge \${command.status === "pass" ? "status-done" : "status-blocked"}\`, command.status) : null;
      const label = el("span", "", command.cmd || String(command));
      item.append(status || el("span", "badge", "cmd"), label);
      list.append(item);
    }
    section.append(list);
    root.append(section);
  }
  if (skin === "control-room") {
    const transcript = [
      task.receipt?.summary ? \`summary: \${task.receipt.summary}\` : skinLabels(currentSkin()).receiptEmpty,
      task.receipt?.result ? \`result: \${task.receipt.result}\` : "",
      task.receipt?.decision ? \`decision: \${task.receipt.decision}\` : "",
    ].filter(Boolean).join("\\n");
    const section = el("section", "detail-section");
    section.append(el("h3", "", "Evidence"), el("pre", "receipt-transcript", transcript));
    root.append(section);
  }
  if (task.note?.content) {
    const section = el("section", "detail-section");
    section.append(el("h3", "", task.note.title || task.note.path), el("pre", "note", task.note.content));
    root.append(section);
  }
  return root;
}

function renderSubobjective(subobjective) {
  const labels = skinLabels(currentSkin()).sections;
  const section = el("section", "detail-section subobjective-section");
  const header = el("div", "subobjective-header");
  const titleWrap = el("div");
  const board = subobjective.board;
  titleWrap.append(
    el("h3", "subobjective-title", board?.objective?.title || "Sub-objective"),
    el("p", "subobjective-meta", [
      subobjective.path,
      subobjective.owner ? \`owner: \${subobjective.owner}\` : "",
      subobjective.depth ? \`depth: \${subobjective.depth}\` : "",
    ].filter(Boolean).join(" · ")),
  );
  header.append(titleWrap, subobjectiveBadge(subobjective));
  section.append(header);

  if (!board?.columns?.length) {
    section.append(el("p", "", "No child board payload."));
    return section;
  }

  const boardEl = el("div", "subobjective-board");
  for (const column of board.columns) {
    const columnLabelsForSkin = columnLabels(column);
    const columnEl = el("section", "subobjective-column");
    const columnHeader = el("header", "subobjective-column-header");
    columnHeader.append(el("h4", "", columnLabelsForSkin.title), el("span", "column-count", String(column.tasks.length)));
    const list = el("div", "subobjective-card-list");
    if (column.tasks.length === 0) {
      list.append(el("p", "empty", emptyColumnMessage()));
    } else {
      for (const task of column.tasks) list.append(renderSubobjectiveTask(task));
    }
    columnEl.append(columnHeader, list);
    boardEl.append(columnEl);
  }
  section.append(el("p", "eyebrow", labels.subobjective));
  section.append(boardEl);

  if (subobjective.rollupReceipt) {
    section.append(detailText(labels.rollupReceipt, subobjective.rollupReceipt));
  }

  return section;
}

function renderSubobjectiveTask(task) {
  const card = el("article", \`subobjective-task-card \${task.active ? "is-active" : ""}\`);
  const topline = el("div", "card-topline");
  topline.append(el("span", "task-id", task.id), statusBadge(task.status));
  const footer = el("div", "card-footer");
  footer.append(el("span", "badge role", task.assignee || task.type || "PM"));
  if (task.receipt?.present) footer.append(el("span", "badge status-done", "Receipt"));
  card.append(topline, el("h4", "subobjective-task-title", task.title), footer);
  return card;
}

function detailText(title, value) {
  const section = el("section", "detail-section");
  section.append(el("h3", "", title), el("p", "", value || "None"));
  return section;
}

function detailList(title, values) {
  const section = el("section", "detail-section");
  section.append(el("h3", "", title));
  if (!values?.length) {
    section.append(el("p", "", "None"));
    return section;
  }
  const list = el("ul");
  for (const value of values) list.append(el("li", "", value));
  section.append(list);
  return section;
}

function statusBadge(status) {
  const label = status === "done" ? "Completed" : status === "active" ? "Active" : status === "blocked" ? "Blocked" : "Queued";
  return el("span", \`badge status-\${status}\`, label);
}

function subobjectiveBadge(subobjective) {
  return el("span", \`badge subobjective status-\${subobjective.status}\`, \`Sub-objective \${subobjective.status || "linked"}\`);
}

function setLiveState(text, live) {
  liveStateEl.textContent = text;
  liveDotEl.classList.toggle("offline", !live);
  settingsButtonEl.setAttribute("aria-label", \`Settings. Board status: \${text}\`);
  settingsButtonEl.title = \`Settings · \${text}\`;
}

function normalizePath(pathname) {
  return pathname.endsWith("/") ? pathname : pathname + "/";
}

function boardOptionLabel(board) {
  const title = board.title || board.slug || board.objectiveDir || "Cursor Curator board";
  return /[/\\\\]subobjectives[/\\\\]/.test(board.objectiveDir || "") ? \`Child: \${title}\` : title;
}

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}

loadSettings()
  .then(loadBoard)
  .then((live) => {
    if (live) {
      setLiveState("Live", true);
      rememberCurrentBoard();
      loadBoardSwitcher();
      window.setInterval(loadBoardSwitcher, 5000);
      connectEvents();
    } else {
      setLiveState("Snapshot", false);
    }
    loadGithubStars();
  })
  .catch((error) => {
    setLiveState("Offline", false);
    boardEl.replaceChildren(renderBoardError(error.message));
  });
`;
}
