import { main as boardMain } from "../../board/local-objective-board.mjs";
import type { CuratorCliContext } from "../curator-context.mjs";

export async function runBoard(ctx: CuratorCliContext): Promise<void> {
  const goal = ctx.positionalObjectivePath();
  const boardArgv = [
    process.argv[0],
    "local-objective-board",
    "--objective",
    goal,
    ...ctx.args.slice(2).filter((a) => a !== "board"),
  ];
  const saved = process.argv;
  process.argv = boardArgv;
  try {
    await boardMain();
  } finally {
    process.argv = saved;
  }
}
