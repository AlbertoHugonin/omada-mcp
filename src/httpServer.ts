import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer as createNodeHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Config } from "./config.js";
import { logger } from "./logger.js";
import type { OmadaClient } from "./omada/client.js";
import { SERVER_NAME, SERVER_VERSION } from "./server.js";
import { registerTools } from "./tools/registry.js";

const MCP_PATH = "/mcp";
const HEALTH_PATH = "/healthz";

interface SessionState {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function apiKeyMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function buildMcpServer(client: OmadaClient, config: Config): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerTools(server, { client, config });
  return server;
}

/**
 * Starts a stateful Streamable HTTP MCP endpoint for remote callers such as Jarvis.
 * Every MCP request requires X-API-Key; healthz intentionally exposes only a static
 * liveness response and does not require authentication.
 */
export async function startHttpServer(client: OmadaClient, config: Config): Promise<void> {
  if (!config.httpEnable) {
    throw new Error("MCP_TRANSPORT=http requires MCP_HTTP_ENABLE=true");
  }
  if (!config.httpApiKey || config.httpApiKey.length < 16) {
    throw new Error("MCP_TRANSPORT=http requires MCP_HTTP_API_KEY with at least 16 characters");
  }

  const sessions = new Map<string, SessionState>();

  const newSession = async (): Promise<SessionState> => {
    let state: SessionState;
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId: string) => {
        sessions.set(sessionId, state);
        logger.debug("MCP HTTP session initialized", { sessionId });
      },
      onsessionclosed: (sessionId: string) => {
        sessions.delete(sessionId);
        logger.debug("MCP HTTP session closed", { sessionId });
      },
    });
    const server = buildMcpServer(client, config);
    state = { transport, server };
    await server.connect(transport);
    return state;
  };

  const httpServer = createNodeHttpServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      try {
        const host = req.headers.host ?? `${config.httpBind}:${config.httpPort}`;
        const url = new URL(req.url ?? "/", `http://${host}`);

        if (url.pathname === HEALTH_PATH) {
          sendJson(res, 200, { status: "ok" });
          return;
        }
        if (url.pathname !== MCP_PATH) {
          sendJson(res, 404, { error: "Not Found" });
          return;
        }

        const apiKey = firstHeader(req.headers["x-api-key"]);
        if (!apiKeyMatches(apiKey, config.httpApiKey as string)) {
          res.setHeader("WWW-Authenticate", "ApiKey");
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }

        const sessionId = firstHeader(req.headers["mcp-session-id"]);
        let state: SessionState;
        if (sessionId) {
          const existing = sessions.get(sessionId);
          if (!existing) {
            sendJson(res, 404, {
              jsonrpc: "2.0",
              error: { code: -32001, message: "MCP session not found" },
              id: null,
            });
            return;
          }
          state = existing;
        } else {
          state = await newSession();
        }

        await state.transport.handleRequest(req, res);
      } catch (error) {
        logger.error("MCP HTTP request failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        if (!res.headersSent) {
          sendJson(res, 500, {
            jsonrpc: "2.0",
            error: { code: -32000, message: "Internal server error" },
            id: null,
          });
        } else if (!res.writableEnded) {
          res.end();
        }
      }
    })();
  });

  httpServer.on("clientError", (_error, socket) => {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(config.httpPort, config.httpBind, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  logger.info(`${SERVER_NAME} ${SERVER_VERSION} started on Streamable HTTP`, {
    endpoint: `http://${config.httpBind}:${config.httpPort}${MCP_PATH}`,
    health: `http://${config.httpBind}:${config.httpPort}${HEALTH_PATH}`,
    profile: config.capabilityProfile,
    controller: config.baseUrl,
    authentication: "X-API-Key",
  });

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.info("shutting down MCP HTTP server", { signal, sessions: sessions.size });
    const states = [...sessions.values()];
    sessions.clear();
    await Promise.allSettled(states.map(async (state) => state.server.close()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }
}
