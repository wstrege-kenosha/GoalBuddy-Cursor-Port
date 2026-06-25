import { parse as parseYaml } from "yaml";

function rewriteSubobjectivePaths(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteSubobjectivePaths(entry));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }

  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(record)) {
    if (key === "path" && typeof entry === "string") {
      next[key] = entry.replace(/state\.yaml$/i, "state.json");
      continue;
    }
    next[key] = rewriteSubobjectivePaths(entry);
  }

  return next;
}

export function parseStateYamlV2(text: string): unknown {
  return parseYaml(text);
}

export function convertYamlV2DocumentToV3(document: unknown): unknown {
  if (typeof document !== "object" || document === null) {
    return document;
  }

  const record = { ...(document as Record<string, unknown>) };
  if (record.version === 2) {
    record.version = 3;
  }

  return rewriteSubobjectivePaths(record);
}

export function convertStateYamlV2TextToV3(text: string): unknown {
  return convertYamlV2DocumentToV3(parseStateYamlV2(text));
}
