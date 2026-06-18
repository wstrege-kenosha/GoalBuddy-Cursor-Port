import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { main } from "../surfaces/local-goal-board/scripts/local-goal-board.mjs";

export * from "../surfaces/local-goal-board/scripts/local-goal-board.mjs";

const __filename = fileURLToPath(import.meta.url);

function isDirectRun() {
  if (!process.argv[1]) return false;
  return realpathSync(process.argv[1]) === realpathSync(__filename);
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
