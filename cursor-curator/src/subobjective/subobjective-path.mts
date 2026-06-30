import { join, resolve } from "node:path";

export function childDirSegmentFromRelative(childRelative: string): string {
  const normalized = String(childRelative || "").replace(/\\/g, "/");
  const match = normalized.match(/subobjectives\/([^/]+)/);
  return match?.[1] ?? "";
}

export function subobjectiveSlugFromPath(childRelative: string): string | null {
  const normalized = String(childRelative || "").replace(/\\/g, "/");
  if (normalized.startsWith("db:")) {
    return normalized.slice(3);
  }
  const match = normalized.match(/subobjectives\/([^/]+)/);
  return match?.[1] ?? null;
}

export function normalizeSubobjectivePath(childRelative: string): string {
  const segment = childDirSegmentFromRelative(childRelative);
  if (segment) {
    return `subobjectives/${segment}`;
  }
  return String(childRelative || "").replace(/\\/g, "/").replace(/\/state\.json$/, "");
}

export function resolveChildObjectiveDir(objectiveDir: string, childRelative: string): string | null {
  const segment = childDirSegmentFromRelative(childRelative) || subobjectiveSlugFromPath(childRelative);
  if (!segment || segment.includes("/")) {
    return null;
  }
  return join(resolve(objectiveDir), "subobjectives", segment);
}

export function childDirSegmentOrSlug(childRelative: string): string {
  return childDirSegmentFromRelative(childRelative) || subobjectiveSlugFromPath(childRelative) || "";
}
