import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateReceipt } from "../../receipt/objective-receipt.mjs";
import type { CuratorCliContext } from "../curator-context.mjs";

export function runReceiptValidate(ctx: CuratorCliContext): void {
  const json = ctx.hasFlag("--json");
  const role = ctx.flagValue("--role");
  const expectedTaskId = ctx.flagValue("--task");
  const positional = ctx.args.slice(1).filter((arg) => !arg.startsWith("-") && arg !== "receipt");
  const target = positional[0];
  if (!target) {
    console.error("Usage: curator receipt <file|json> [--role scout|approval_gate|worker] [--task T###] [--json]");
    process.exit(2);
  }

  let input: string = target;
  if (existsSync(resolve(target))) {
    input = readFileSync(resolve(target), "utf8");
  }

  const result = validateReceipt(input, { role, expectedTaskId });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok && result.receipt) {
    console.log(`Receipt valid for ${result.role} task ${result.receipt.task_id}.`);
    for (const warning of result.warnings) console.log(`warning: ${warning}`);
  } else {
    for (const error of result.errors) console.error(error);
    for (const warning of result.warnings) console.log(`warning: ${warning}`);
  }
  process.exit(result.ok ? 0 : 1);
}
