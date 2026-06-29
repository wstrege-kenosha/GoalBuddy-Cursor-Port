// @ts-nocheck
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readBoardRepoLinks } from "./port-metadata.mjs";
import { checkCompletionReadiness } from "../completion/objective-completion.mjs";
import { readLastVerificationFromLoadedState } from "../verify/objective-verify.mjs";
import { readSessionDigest } from "../session/objective-session.mjs";
import {
  buildTaskMetricsView,
  buildTaskMetricsWithRollup,
  buildUsageBoardView,
  readUsageSummaryForObjective,
} from "../usage/objective-usage.mjs";
import { loadState, resolveStatePath } from "../state/objective-state.mjs";
import { validateObjectiveStateFile } from "../mcp/validate-state-bridge.mjs";
import { listObjectives, objectiveExistsInDb, resolveChildObjectiveSlug } from "../db/state-repository.mjs";
import { resolveWorkspaceForObjective } from "../mcp/path-utils.mjs";
import {
  ObjectiveBoardError,
  buildColumns,
  normalizeObjectiveBoard,
} from "./objective-board-model.mjs";
import { boardCss } from "./objective-board-styles.mjs";
import { boardHtml } from "./objective-board-html.mjs";
import { boardJs } from "./objective-board-client.mjs";

export { readBoardRepoLinks } from "./port-metadata.mjs";
export {
  ObjectiveBoardError,
  buildColumns,
  normalizeObjectiveBoard,
  normalizeTask,
  parseObjectiveStateText,
} from "./objective-board-model.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "../..");
const logoAssetPath = join(packageRoot, "assets", "curator-mark.png");

function objectiveUpdatedAtMs(workspaceRoot, slug) {
  const entry = listObjectives(workspaceRoot).find((row) => row.slug === slug);
  if (entry?.updatedAt) {
    const parsed = Date.parse(entry.updatedAt);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

function subobjectiveSlugFromPath(childRelative) {
  const normalized = String(childRelative || "").replace(/\\/g, "/");
  if (normalized.startsWith("db:")) return normalized.slice(3);
  const match = normalized.match(/subobjectives\/([^/]+)/);
  return match?.[1] ?? null;
}

function readObjectiveStateAtRoot(root) {
  const workspaceRoot = resolveWorkspaceForObjective(root);
  const statePath = resolveStatePath(root, workspaceRoot);
  const loaded = loadState(root, workspaceRoot, { warnYaml: false });
  return { statePath, loaded, workspaceRoot };
}

export async function loadObjectiveBoard(objectiveDir) {
  const root = resolve(objectiveDir);
  const { loaded } = readObjectiveStateAtRoot(root);
  return normalizeObjectiveBoard(loaded.raw, root);
}
export function createBoardPayload(objectiveDir, options = {}) {
  const includeSubobjectives = options.includeSubobjectives !== false;
  const root = resolve(objectiveDir);
  const { statePath, loaded, workspaceRoot } = readObjectiveStateAtRoot(root);
  const document = loaded.raw;

  const board = normalizeObjectiveBoard(document, root);
  const noteIndex = loadNotes(root);
  const usageSummary = readUsageSummaryForObjective(root, {
    include_subobjectives: includeSubobjectives,
    tasks: board.tasks,
  });
  const usage = buildUsageBoardView(usageSummary);
  const tasks = board.tasks
    .map((task) => attachTaskNote(task, noteIndex))
    .map((task) => includeSubobjectives ? attachTaskSubobjective(task, root, workspaceRoot) : task)
    .map((task) => {
      const childPath = task.subobjective?.path;
      const metricsView = childPath && includeSubobjectives
        ? buildTaskMetricsWithRollup(task.id, usageSummary, childPath)
        : buildTaskMetricsView(usageSummary.tasks[task.id] ?? null);
      return {
        ...task,
        metrics: metricsView.raw,
        metrics_badge: metricsView.badge,
        metrics_detail: metricsView.detail,
      };
    });
  const columns = buildColumns(tasks);
  const stateMtimeMs = objectiveUpdatedAtMs(workspaceRoot, loaded.slug);
  const repo = readBoardRepoLinks();
  const validation = validateObjectiveStateFile(root, workspaceRoot);
  const completion = checkCompletionReadiness(root, workspaceRoot);
  const lastVerification = readLastVerificationFromLoadedState(document);
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
      boardPath: statePath,
      dbPath: validation.db_path,
      stateMtimeMs,
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
    usage,
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

function childDirSegmentFromRelative(childRelative: string): string {
  const normalized = String(childRelative || "").replace(/\\/g, "/");
  const match = normalized.match(/subobjectives\/([^/]+)/);
  return match?.[1] ?? "";
}

function attachTaskSubobjective(task, objectiveDir, workspaceRoot) {
  if (!task.subobjective) return task;
  const childRelative = task.subobjective.path;
  const childDirSegment = childDirSegmentFromRelative(childRelative) || subobjectiveSlugFromPath(childRelative);
  const childSlug =
    resolveChildObjectiveSlug(workspaceRoot, objectiveDir, childRelative)
    ?? childDirSegment;
  if (!childSlug || !childDirSegment) {
    throw new ObjectiveBoardError(`Invalid sub-objective path for ${task.id}: ${childRelative}`);
  }
  const childGoalDir = join(objectiveDir, "subobjectives", childDirSegment);
  validateChildSubobjectivePath(task, objectiveDir, childRelative, childDirSegment);
  if (!objectiveExistsInDb(workspaceRoot, childSlug)) {
    throw new ObjectiveBoardError(`Missing sub-objective state for ${task.id}: ${childRelative}`);
  }

  return {
    ...task,
    subobjective: {
      ...task.subobjective,
      path: `subobjectives/${childDirSegment}`,
      board: createBoardPayload(childGoalDir, { includeSubobjectives: false }),
    },
  };
}

function validateChildSubobjectivePath(task, objectiveDir, childRelative, childSlug) {
  if (task.subobjective.depth !== 1) {
    throw new ObjectiveBoardError(`Invalid sub-objective depth for ${task.id}: only depth 1 is supported.`);
  }
  const expectedPrefix = `subobjectives/${childSlug}`;
  const normalized = String(childRelative || "").replace(/\\/g, "/");
  if (
    normalized !== expectedPrefix
    && normalized !== `${expectedPrefix}/state.json`
    && normalized !== `${expectedPrefix}/state.yaml`
    && !normalized.startsWith("db:")
  ) {
    throw new ObjectiveBoardError(
      `Invalid sub-objective path for ${task.id}: ${childRelative} must be subobjectives/<slug> or legacy state file path.`,
    );
  }
  const childDir = join(objectiveDir, "subobjectives", childSlug);
  const childRelativePath = relative(objectiveDir, childDir);
  if (!isInsideRoot(childRelativePath)) {
    throw new ObjectiveBoardError(`Invalid sub-objective path for ${task.id}: ${childRelative} must stay inside the objective root.`);
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
