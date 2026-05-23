import { logger } from "../logger.js";
import type { ToolContext } from "./types.js";

/** Resolves a siteId from tool args, falling back to the configured default. */
export function resolveSiteId(ctx: ToolContext, args: { siteId?: string }): string {
  const siteId = args.siteId ?? ctx.config.siteId;
  if (!siteId) {
    throw new Error(
      "siteId is required — set OMADA_SITE_ID in .env or pass `siteId` to the tool. " +
        "Run `list_sites` to discover available siteIds.",
    );
  }
  return siteId;
}

/** A CallToolResult with text-only content. The index signature matches the
 *  MCP SDK's CallToolResult so the object is assignable without a cast. */
export interface TextToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  [k: string]: unknown;
}

/**
 * Runs a tool body, returning a text CallToolResult. On error, logs to stderr
 * and returns `isError: true` with a readable message — never leaks a stack.
 */
export async function runTool(name: string, body: () => Promise<string>): Promise<TextToolResult> {
  try {
    const text = await body();
    return { content: [{ type: "text", text }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`${name} failed`, { error: message });
    return { isError: true, content: [{ type: "text", text: `${name} failed: ${message}` }] };
  }
}

/** Render a millisecond epoch as an ISO timestamp, or `—` when absent/zero. */
export function fmtTime(ms: number | undefined): string {
  if (!ms || ms <= 0) return "—";
  return new Date(ms).toISOString();
}

/** Render bytes as a short human-readable string. */
export function fmtBytes(bytes: number | undefined): string {
  if (bytes === undefined) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}
