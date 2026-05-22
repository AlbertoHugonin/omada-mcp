import { existsSync } from "node:fs";
import { z } from "zod";
import { CAPABILITY_PROFILES, type CapabilityProfile } from "./capability.js";
import type { LogLevel } from "./logger.js";

/** Loads a `.env` file from the working directory when present. */
function loadDotEnvIfPresent(): void {
  const path = `${process.cwd()}/.env`;
  if (existsSync(path)) {
    // process.loadEnvFile throws if the file is missing; guarded by existsSync.
    process.loadEnvFile(path);
  }
}

/** Env var holding "true"/"false"-ish text; missing or blank yields `def`. */
function envBoolean(def: boolean) {
  return z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v.trim() === "") {
        return def;
      }
      return ["true", "1", "yes", "on"].includes(v.trim().toLowerCase());
    });
}

/** Env var holding a positive integer; missing or blank yields `def`. */
function envInt(def: number) {
  return z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === "" ? def : Number(v)))
    .pipe(z.number().int().positive());
}

const EnvSchema = z.object({
  OMADA_BASE_URL: z.string().min(1),
  OMADA_CLIENT_ID: z.string().min(1),
  OMADA_CLIENT_SECRET: z.string().min(1),
  OMADA_OMADAC_ID: z.string().min(1),
  OMADA_SITE_ID: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined)),
  OMADA_VERIFY_TLS: envBoolean(true),
  OMADA_TIMEOUT_MS: envInt(30_000),
  OMADA_CAPABILITY_PROFILE: z.enum(CAPABILITY_PROFILES).default("safe-read"),
  MCP_TRANSPORT: z.enum(["stdio", "http"]).default("stdio"),
  MCP_HTTP_ENABLE: envBoolean(false),
  MCP_HTTP_BIND: z.string().min(1).default("127.0.0.1"),
  MCP_HTTP_PORT: envInt(3000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export interface Config {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  omadacId: string;
  siteId: string | undefined;
  verifyTls: boolean;
  timeoutMs: number;
  capabilityProfile: CapabilityProfile;
  transport: "stdio" | "http";
  httpEnable: boolean;
  httpBind: string;
  httpPort: number;
  logLevel: LogLevel;
}

/**
 * Parses and validates configuration from the environment (and an optional
 * `.env`). Throws a single, readable error listing every problem. Credentials
 * are read here and nowhere else.
 */
export function loadConfig(): Config {
  loadDotEnvIfPresent();

  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(env)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  const env = parsed.data;

  let baseUrl: string;
  try {
    baseUrl = new URL(env.OMADA_BASE_URL).toString().replace(/\/+$/, "");
  } catch {
    throw new Error(
      `Invalid configuration:\n  - OMADA_BASE_URL: "${env.OMADA_BASE_URL}" is not a valid URL`,
    );
  }

  return {
    baseUrl,
    clientId: env.OMADA_CLIENT_ID,
    clientSecret: env.OMADA_CLIENT_SECRET,
    omadacId: env.OMADA_OMADAC_ID,
    siteId: env.OMADA_SITE_ID,
    verifyTls: env.OMADA_VERIFY_TLS,
    timeoutMs: env.OMADA_TIMEOUT_MS,
    capabilityProfile: env.OMADA_CAPABILITY_PROFILE,
    transport: env.MCP_TRANSPORT,
    httpEnable: env.MCP_HTTP_ENABLE,
    httpBind: env.MCP_HTTP_BIND,
    httpPort: env.MCP_HTTP_PORT,
    logLevel: env.LOG_LEVEL,
  };
}
