export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let currentLevel: LogLevel = "info";
const secrets = new Set<string>();

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/**
 * Register a secret value so it is masked if it ever reaches a log line.
 * Short values are ignored to avoid masking common substrings.
 */
export function registerSecret(value: string | undefined): void {
  if (value && value.length >= 6) {
    secrets.add(value);
  }
}

function redact(text: string): string {
  let out = text;
  for (const secret of secrets) {
    if (out.includes(secret)) {
      out = out.split(secret).join("[redacted]");
    }
  }
  return out;
}

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[currentLevel]) {
    return;
  }
  let line = `[omada-mcp] ${level}: ${message}`;
  if (meta && Object.keys(meta).length > 0) {
    line += ` ${JSON.stringify(meta)}`;
  }
  // stdout is reserved for the MCP JSON-RPC stream; logs go to stderr.
  process.stderr.write(`${redact(line)}\n`);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit("error", message, meta),
};
