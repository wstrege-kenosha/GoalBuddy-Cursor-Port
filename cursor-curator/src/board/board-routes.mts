import type { IncomingMessage, ServerResponse } from "node:http";
import { readBoardSettings, SETTINGS_VERSION, writeBoardSettings } from "./board-settings.mjs";
import { safeBoardPayload } from "./board-watchers.mjs";
import { buildHubPayloadForServer, hubPageHtml } from "../hub/objective-hub.mjs";
import { resolveWorkspaceForObjective } from "../mcp/path-utils.mjs";
import {
  boardSummary,
  boardTrailingSlashUrl,
  preferredBoard,
  routeBoardRequest,
  sendUnregisteredBoardPath,
  type BoardRecord,
  type BoardSummary,
} from "./board-registry.mjs";
import {
  readJsonRequest,
  redirect,
  sendError,
  sendEvent,
  sendJson,
  sendMethodNotAllowed,
  serveStatic,
} from "./board-http.mjs";

export interface BoardRouteContext {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  boards: Map<string, BoardRecord>;
  baseUrl: string;
  initialBoard: BoardRecord | null;
  addBoard: (objectiveDir: string) => BoardSummary;
}

type BoardRouteHandler = (ctx: BoardRouteContext) => boolean | Promise<boolean>;

const hubRoutes: BoardRouteHandler[] = [
  handlePostRegisterBoard,
  handleOpenRedirect,
  handleHubPage,
  handleApiHub,
  handleApiBoardsList,
  handleApiSettings,
  handleTrailingSlashRedirect,
  handleScopedBoardRoute,
];

export async function dispatchBoardRequest(ctx: BoardRouteContext): Promise<void> {
  for (const handler of hubRoutes) {
    if (await handler(ctx)) {
      return;
    }
  }
}

function hubWorkspaceRoots(boards: Iterable<BoardRecord>): string[] {
  const seen = new Set<string>();
  const roots: string[] = [];
  for (const board of boards) {
    const workspaceRoot = resolveWorkspaceForObjective(board.root);
    const key = workspaceRoot.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    roots.push(workspaceRoot);
  }
  return roots.length ? roots : [process.cwd()];
}

function hubPayloadForBoards(ctx: BoardRouteContext) {
  return buildHubPayloadForServer(
    [...ctx.boards.values()].map((board) => board.root),
    {
      roots: hubWorkspaceRoots(ctx.boards.values()),
      baseUrl: ctx.baseUrl,
    },
  );
}

async function handlePostRegisterBoard(ctx: BoardRouteContext): Promise<boolean> {
  if (ctx.request.method !== "POST" || ctx.url.pathname !== "/api/boards") {
    return false;
  }
  const payload = await readJsonRequest(ctx.request);
  sendJson(ctx.response, ctx.addBoard(String(payload.objectiveDir || "")));
  return true;
}

function handleOpenRedirect(ctx: BoardRouteContext): boolean {
  if (ctx.url.pathname !== "/open") {
    return false;
  }
  const board = preferredBoard(ctx.boards, readBoardSettings());
  if (!board) {
    ctx.response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
    ctx.response.end("No Cursor Curator boards are registered.");
    return true;
  }
  redirect(ctx.response, `${ctx.baseUrl}${board.boardPath}`);
  return true;
}

async function handleHubPage(ctx: BoardRouteContext): Promise<boolean> {
  const hubPaths = new Set(["/", "/hub", "/boards"]);
  if (!hubPaths.has(ctx.url.pathname)) {
    return false;
  }
  sendHubPage(ctx.response, ctx);
  return true;
}

function handleApiHub(ctx: BoardRouteContext): boolean {
  if (ctx.url.pathname !== "/api/hub") {
    return false;
  }
  sendJson(ctx.response, hubPayloadForBoards(ctx));
  return true;
}

function handleApiBoardsList(ctx: BoardRouteContext): boolean {
  if (ctx.url.pathname !== "/api/boards" || ctx.request.method !== "GET") {
    return false;
  }
  sendJson(ctx.response, {
    boards: [...ctx.boards.values()].map((board) => boardSummary(board, ctx.baseUrl)),
  });
  return true;
}

async function handleApiSettings(ctx: BoardRouteContext): Promise<boolean> {
  if (ctx.url.pathname !== "/api/settings") {
    return false;
  }
  if (ctx.request.method === "GET") {
    sendJson(ctx.response, { version: SETTINGS_VERSION, settings: readBoardSettings() });
    return true;
  }
  if (ctx.request.method === "PUT") {
    const payload = await readJsonRequest(ctx.request);
    sendJson(ctx.response, {
      version: SETTINGS_VERSION,
      settings: writeBoardSettings(payload.settings || payload),
    });
    return true;
  }
  sendMethodNotAllowed(ctx.response, "GET, PUT");
  return true;
}

function handleTrailingSlashRedirect(ctx: BoardRouteContext): boolean {
  const slashUrl = boardTrailingSlashUrl(ctx.url.pathname, ctx.boards, ctx.baseUrl);
  if (!slashUrl) {
    return false;
  }
  redirect(ctx.response, slashUrl);
  return true;
}

function handleScopedBoardRoute(ctx: BoardRouteContext): boolean {
  const route = routeBoardRequest(ctx.url.pathname, ctx.boards, ctx.initialBoard);
  if (!route.board) {
    sendUnregisteredBoardPath(ctx.response, ctx.url.pathname, ctx.boards, ctx.baseUrl);
    return true;
  }

  switch (route.pathname) {
    case "/api/board":
      sendJson(ctx.response, safeBoardPayload(route.board.root));
      return true;
    case "/events":
      handleBoardEvents(ctx.request, ctx.response, route.board);
      return true;
    default:
      break;
  }

  serveStatic(route.board.appDir, route.pathname, ctx.response);
  return true;
}

function handleBoardEvents(
  request: IncomingMessage,
  response: ServerResponse,
  board: BoardRecord,
): void {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.write("retry: 1000\n\n");
  board.clients.add(response);
  sendEvent(response, board.lastPayload);
  request.on("close", () => board.clients.delete(response));
}

function sendHubPage(response: ServerResponse, ctx: BoardRouteContext): void {
  if (response.headersSent) return;
  try {
    const payload = hubPayloadForBoards(ctx);
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(hubPageHtml(payload));
  } catch (error) {
    sendError(response, error);
  }
}
