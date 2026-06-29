import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function resolveBoardFragmentPath(name: string): string {
  const path = join(dirname(fileURLToPath(import.meta.url)), "fragments", name);
  if (!existsSync(path)) {
    throw new Error(`Missing board fragment: ${name} at ${path}. Run bun run build.`);
  }
  return path;
}

export function readBoardFragment(name: string): string {
  return readFileSync(resolveBoardFragmentPath(name), "utf8");
}

export function injectBoardFragment(
  name: string,
  tokens: Record<string, string>,
): string {
  let content = readBoardFragment(name);
  for (const [token, value] of Object.entries(tokens)) {
    if (!content.includes(token)) {
      throw new Error(`Board fragment ${name} is missing placeholder ${token}`);
    }
    content = content.replaceAll(token, value);
  }
  return content;
}
