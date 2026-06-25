// @ts-nocheck
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const versionPath = join(__dirname, "../../version.json");

export const DEFAULT_REPO_LINKS = {
  portUrl: "https://github.com/wstrege-kenosha/Cursor-Curator",
  portLabel: "wstrege-kenosha/Cursor-Curator",
  upstreamUrl: "https://github.com/tolibear/goalbuddy",
  upstreamLabel: "tolibear/goalbuddy",
  cursorPortVersion: null,
  upstreamVersion: null,
};

export function githubSlugFromUrl(url) {
  try {
    const parts = new URL(String(url)).pathname.split("/").filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  } catch {
    /* ignore invalid URL */
  }
  return DEFAULT_REPO_LINKS.portLabel;
}

export function readBoardRepoLinks() {
  try {
    const version = JSON.parse(readFileSync(versionPath, "utf8"));
    const portUrl = version.portUrl || DEFAULT_REPO_LINKS.portUrl;
    const upstreamUrl = version.upstreamUrl || DEFAULT_REPO_LINKS.upstreamUrl;
    const portLabel = githubSlugFromUrl(portUrl);
    const upstreamLabel = githubSlugFromUrl(upstreamUrl);
    return {
      portUrl,
      portLabel,
      portApiSlug: portLabel,
      upstreamUrl,
      upstreamLabel,
      cursorPortVersion: version.cursorPortVersion || null,
      upstreamVersion: version.upstreamVersion || null,
    };
  } catch {
    return {
      ...DEFAULT_REPO_LINKS,
      portApiSlug: DEFAULT_REPO_LINKS.portLabel,
    };
  }
}
