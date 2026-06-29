export function areAllowedFilesDisjoint(left: string[], right: string[]): boolean {
  return left.every((leftPattern) => right.every((rightPattern) => !patternsOverlap(leftPattern, rightPattern)));
}

function patternsOverlap(left: string, right: string): boolean {
  const a = normalizePattern(left);
  const b = normalizePattern(right);
  const aHasGlob = hasGlob(a);
  const bHasGlob = hasGlob(b);
  if (a === b) return true;
  if (a.endsWith("/**") && b.startsWith(a.slice(0, -3))) return true;
  if (b.endsWith("/**") && a.startsWith(b.slice(0, -3))) return true;
  if (!aHasGlob && !bHasGlob) return false;
  if (!aHasGlob) return globToRegExp(b).test(a);
  if (!bHasGlob) return globToRegExp(a).test(b);
  if (hasUnsupportedGlob(a) || hasUnsupportedGlob(b)) return literalPrefixesMayOverlap(a, b);
  return literalPrefixesMayOverlap(a, b);
}

function literalPrefixesMayOverlap(left: string, right: string): boolean {
  const a = literalPrefix(left);
  const b = literalPrefix(right);
  if (!a || !b) return true;
  return a.startsWith(b) || b.startsWith(a);
}

function literalPrefix(pattern: string): string {
  const match = /[*?[\]]/.exec(pattern);
  return match ? pattern.slice(0, match.index) : pattern;
}

function hasUnsupportedGlob(pattern: string): boolean {
  return /[\[\]]/.test(pattern);
}

function globToRegExp(pattern: string): RegExp {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`^${source}$`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function hasGlob(pattern: string): boolean {
  return /[*?[\]]/.test(pattern);
}

function normalizePattern(pattern: string): string {
  return String(pattern || "").replace(/\\/g, "/").replace(/^\.\//, "");
}
