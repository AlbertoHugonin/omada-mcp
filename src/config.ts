import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { CAPABILITY_PROFILES, type CapabilityProfile } from "./capability.js";
import type { LogLevel } from "./logger.js";

/**
 * Locates and loads a `.env` file. Tries (in order):
 *   1. `OMADA_DOTENV_PATH` if set in the environment — the explicit override.
 *      Useful when an MCP client launches the server but doesn't reliably
 *      set the working directory (Claude Desktop, for example).
 *   2. `<cwd>/.env` — works for `npm start` or running from the repo root.
 *   3. `<repo-root>/.env` — resolved relative to the compiled script's
 *      location (`dist/config.js` → `..` → `.env`). This is the path the
 *      server falls back to when launched by absolute path with no `cwd`.
 *
 * Silently returns if no candidate exists — env vars may have been set
 * directly (e.g. via the MCP client's `env` block).
 */
function loadDotEnvIfPresent(): void {
  const candidates: string[] = [];

  if (process.env.OMADA_DOTENV_PATH) {
    candidates.push(process.env.OMADA_DOTENV_PATH);
  }
  candidates.push(resolve(process.cwd(), ".env"));
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // dist/config.js → repo root; src/config.ts (running via tsx) → repo root.
    candidates.push(resolve(here, "..", ".env"));
  } catch {
    // import.meta.url unavailable (very unlikely under ESM Node) — ignore.
  }

  for (const path of candidates) {
    if (existsSync(path)) {
      process.loadEnvFile(path);
      return;
    }
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

function envOptionalString() {
  return z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));
}

const EnvSchema = z.object({
  OMADA_BASE_URL: z.string().min(1),
  OMADA_CLIENT_ID: z.string().min(1),
  OMADA_CLIENT_SECRET: z.string().min(1),
  OMADA_OMADAC_ID: z.string().min(1),
  OMADA_SITE_ID: envOptionalString(),
  OMADA_VERIFY_TLS: envBoolean(true),
  OMADA_TLS_CA_FILE: envOptionalString(),
  OMADA_TLS_CERT_SHA256: envOptionalString(),
  OMADA_TIMEOUT_MS: envInt(30_000),
  OMADA_CAPABILITY_PROFILE: z.enum(CAPABILITY_PROFILES).default("safe-read"),
  MCP_TRANSPORT: z.enum(["stdio", "http"]).default("stdio"),
  MCP_HTTP_ENABLE: envBoolean(false),
  MCP_HTTP_BIND: z.string().min(1).default("127.0.0.1"),
  MCP_HTTP_PORT: envInt(3000),
  MCP_HTTP_API_KEY: envOptionalString(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export interface Config {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  omadacId: string;
  siteId: string | undefined;
  verifyTls: boolean;
  tlsCaFile: string | undefined;
  tlsCertSha256: string | undefined;
  timeoutMs: number;
  capabilityProfile: CapabilityProfile;
  transport: "stdio" | "http";
  httpEnable: boolean;
  httpBind: string;
  httpPort: number;
  httpApiKey: string | undefined;
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

  const tlsCertSha256 = env.OMADA_TLS_CERT_SHA256?.replace(/:/g, "").toUpperCase();
  if (tlsCertSha256 && !/^[0-9A-F]{64}$/.test(tlsCertSha256)) {
    throw new Error(
      "Invalid configuration:\n  - OMADA_TLS_CERT_SHA256: expected a SHA-256 certificate fingerprint",
    );
  }
  if (tlsCertSha256 && !env.OMADA_VERIFY_TLS) {
    throw new Error(
      "Invalid configuration:\n  - OMADA_TLS_CERT_SHA256: requires OMADA_VERIFY_TLS=true",
    );
  }

  return {
    baseUrl,
    clientId: env.OMADA_CLIENT_ID,
    clientSecret: env.OMADA_CLIENT_SECRET,
    omadacId: env.OMADA_OMADAC_ID,
    siteId: env.OMADA_SITE_ID,
    verifyTls: env.OMADA_VERIFY_TLS,
    tlsCaFile: env.OMADA_TLS_CA_FILE,
    tlsCertSha256,
    timeoutMs: env.OMADA_TIMEOUT_MS,
    capabilityProfile: env.OMADA_CAPABILITY_PROFILE,
    transport: env.MCP_TRANSPORT,
    httpEnable: env.MCP_HTTP_ENABLE,
    httpBind: env.MCP_HTTP_BIND,
    httpPort: env.MCP_HTTP_PORT,
    httpApiKey: env.MCP_HTTP_API_KEY,
    logLevel: env.LOG_LEVEL,
  };
}
