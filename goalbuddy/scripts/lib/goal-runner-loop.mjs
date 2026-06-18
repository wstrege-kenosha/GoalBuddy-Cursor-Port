import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { checkCompletionReadiness } from "./goal-completion.mjs";
import { appendSessionNote } from "./goal-session.mjs";
import {
  applyReceiptToState,
  buildAgentHandoffPrompt,
  loadAgentInstructions,
  parseReceiptFromText,
} from "./goal-state-write.mjs";
import { resolveGoalStatePath } from "../../mcp/path-utils.mjs";
import {
  toolGetActiveTask,
  toolParallelPlan,
  toolRenderTaskPrompt,
  toolValidateState,
} from "../../mcp/tools.mjs";

const AGENT_FILES = {
  scout: "goal-scout",
  judge: "goal-judge",
  worker: "goal-worker",
};

export async function runGoalLoop(options) {
  const workspaceRoot = resolve(options.workspaceRoot || process.cwd());
  const goal = options.goal;
  const maxTurns = Number(options.maxTurns) > 0 ? Number(options.maxTurns) : 1;
  const dryRun = options.dryRun === true;
  const parallel = options.parallel === true;
  const json = options.json === true;
  const sessionLog = options.sessionLog !== false;
  const cursorHome = resolve(options.cursorHome || process.env.CURSOR_HOME || join(homedir(), ".cursor"));
  const skillRoot = resolve(options.skillRoot || join(cursorHome, "skills", "goalbuddy"));
  const executeAgent = options.executeAgent;
  const log = options.log || ((line) => console.log(line));

  const previousWorkspace = process.env.GOALBUDDY_WORKSPACE;
  process.env.GOALBUDDY_WORKSPACE = workspaceRoot;

  if (!goal) throw new Error("goal slug or path is required.");
  if (!executeAgent && !dryRun) {
    process.env.GOALBUDDY_WORKSPACE = previousWorkspace;
    throw new Error("executeAgent is required unless --dry-run is set.");
  }

  const slug = basename(resolve(goalStateDir(goal, workspaceRoot)));
  const turns = [];
  let stopReason = "max_turns";

  try {
  for (let turn = 1; turn <= maxTurns; turn += 1) {
    const statePath = resolveGoalStatePath(goal, workspaceRoot);
    const validation = toolValidateState({ goal });
    if (!validation.ok) {
      stopReason = "validation_error";
      turns.push({ turn, phase: "preflight", ok: false, validation });
      break;
    }

    const active = toolGetActiveTask({ goal });
    const taskType = String(active.task.type || "pm").toLowerCase();
    const taskId = active.task.id;

    if (taskType === "pm") {
      stopReason = "pm_task_manual";
      turns.push({ turn, phase: "pm_task", ok: false, task_id: taskId, message: "PM tasks require manual /goal handling." });
      break;
    }

    const promptPayload = toolRenderTaskPrompt({ goal, task_id: taskId });
    const agentName = AGENT_FILES[taskType];
    if (!agentName) {
      stopReason = "unknown_task_type";
      turns.push({ turn, phase: "prompt", ok: false, task_type: taskType });
      break;
    }

    const agentInstructions = loadAgentInstructionsWithFallback(cursorHome, skillRoot, agentName);
    const handoffPrompt = buildAgentHandoffPrompt({
      agentInstructions,
      taskPromptPayload: promptPayload,
    });
    const model = promptPayload.metadata.recommended_cursor_model || "composer-2.5-fast";

    log(`[turn ${turn}] ${taskId} ${taskType} model=${model}`);

    let agentText = "";
    if (dryRun) {
      agentText = options.mockAgentText || "";
      if (!agentText) {
        stopReason = "dry_run_no_mock";
        turns.push({ turn, phase: "agent", ok: false, task_id: taskId, dry_run: true });
        break;
      }
    } else if (parallel && taskType === "worker") {
      const plan = toolParallelPlan({ goal });
      const spawnPlan = plan.spawn_plan || [];
      if (spawnPlan.length > 1) {
        const results = await Promise.all(spawnPlan.map(async (entry) => {
          const entryPrompt = buildAgentHandoffPrompt({
            agentInstructions: loadAgentInstructionsWithFallback(
              cursorHome,
              skillRoot,
              entry.cursor_task_subagent_type || agentName,
            ),
            taskPromptPayload: entry.task_prompt,
          });
          return executeAgent({
            prompt: entryPrompt,
            model: entry.task_prompt?.metadata?.recommended_cursor_model || model,
            cwd: workspaceRoot,
            taskId: entry.task_id,
            role: entry.role,
          });
        }));
        const failed = results.find((result) => !result.ok);
        if (failed) {
          stopReason = "parallel_agent_error";
          turns.push({ turn, phase: "parallel_agent", ok: false, results });
          break;
        }
        agentText = results.map((result) => result.text).join("\n");
      } else {
        const result = await executeAgent({ prompt: handoffPrompt, model, cwd: workspaceRoot, taskId, role: taskType });
        if (!result.ok) {
          stopReason = "agent_error";
          turns.push({ turn, phase: "agent", ok: false, task_id: taskId, error: result.error, status: result.status });
          break;
        }
        agentText = result.text;
      }
    } else {
      const result = await executeAgent({ prompt: handoffPrompt, model, cwd: workspaceRoot, taskId, role: taskType });
      if (!result.ok) {
        stopReason = "agent_error";
        turns.push({ turn, phase: "agent", ok: false, task_id: taskId, error: result.error, status: result.status });
        break;
      }
      agentText = result.text;
    }

    const parsed = parseReceiptFromText(agentText);
    if (!parsed) {
      stopReason = "missing_receipt";
      turns.push({ turn, phase: "receipt_parse", ok: false, task_id: taskId });
      break;
    }

    const applyResult = applyReceiptToState(statePath, parsed.envelope, {
      role: taskType,
      expectedTaskId: taskId,
      dryRun: options.skipStateWrite === true,
    });
    if (!applyResult.ok) {
      stopReason = "receipt_apply_failed";
      turns.push({ turn, phase: "apply", ok: false, task_id: taskId, errors: applyResult.errors });
      break;
    }

    const postValidation = toolValidateState({ goal });
    if (!postValidation.ok) {
      stopReason = "post_validation_error";
      turns.push({ turn, phase: "post_validate", ok: false, task_id: taskId, validation: postValidation });
      break;
    }

    if (sessionLog && !dryRun) {
      appendSessionNote({
        workspaceRoot,
        goal_slug: slug,
        task_id: taskId,
        summary: `run turn ${turn}: ${applyResult.receipt.summary}`,
      });
    }

    turns.push({
      turn,
      phase: "complete",
      ok: true,
      task_id: taskId,
      task_type: taskType,
      receipt_result: applyResult.receipt.result,
      updates: applyResult.updates,
    });

    if (applyResult.receipt.result === "blocked") {
      stopReason = "blocked";
      break;
    }

    const completion = checkCompletionReadiness(statePath);
    if (completion.ready) {
      stopReason = "goal_complete";
      break;
    }

    const refreshed = toolGetActiveTask({ goal });
    if (!refreshed.active_task) {
      stopReason = "no_active_task";
      break;
    }
  }

  const report = {
    ok: ["goal_complete", "max_turns", "no_active_task"].includes(stopReason) && turns.every((turn) => turn.ok !== false || turn.phase === "complete"),
    goal,
    slug,
    workspace_root: workspaceRoot,
    max_turns: maxTurns,
    turns_completed: turns.length,
    stop_reason: stopReason,
    dry_run: dryRun,
    turns,
  };

  if (json) {
    return report;
  }

  for (const turn of turns) {
    log(`turn ${turn.turn} ${turn.phase} ${turn.ok ? "ok" : "fail"} ${turn.task_id || ""}`);
  }
  log(`stop: ${stopReason}`);
  return report;
  } finally {
    if (previousWorkspace === undefined) {
      delete process.env.GOALBUDDY_WORKSPACE;
    } else {
      process.env.GOALBUDDY_WORKSPACE = previousWorkspace;
    }
  }
}

function goalStateDir(goal, workspaceRoot) {
  const statePath = resolveGoalStatePath(goal, workspaceRoot);
  return dirname(statePath);
}

function loadAgentInstructionsWithFallback(cursorHome, skillRoot, agentName) {
  const installedPath = join(cursorHome, "agents", `${agentName}.md`);
  if (existsSync(installedPath)) {
    return loadAgentInstructions(cursorHome, agentName);
  }
  const vendoredPath = join(skillRoot, "agents-src", `${agentName}.md`);
  if (existsSync(vendoredPath)) {
    return readFileSync(vendoredPath, "utf8");
  }
  throw new Error(`Agent instructions not found for ${agentName}`);
}

export function readGoalStatus(goal, workspaceRoot) {
  const statePath = resolveGoalStatePath(goal, workspaceRoot);
  const text = readFileSync(statePath, "utf8");
  const match = text.match(/^goal:\s*[\s\S]*?^\s{2}status:\s*(.+?)\s*$/m);
  return match ? match[1].trim() : null;
}

export function buildMcpServersForRunner(skillRoot, workspaceRoot = process.cwd()) {
  const serverPath = join(resolve(skillRoot), "mcp", "server.mjs");
  if (!existsSync(serverPath)) return {};
  return {
    goalbuddy: {
      command: process.execPath,
      args: [serverPath],
      env: {
        GOALBUDDY_WORKSPACE: workspaceRoot,
      },
    },
  };
}
