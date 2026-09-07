import { readFileSync } from "node:fs";
import { Agent, fetch as undiciFetch } from "undici";
import { logger } from "../logger.js";

/** A transport-level failure: network error, timeout, or non-envelope response. */
export class OmadaHttpError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly bodySnippet?: string,
  ) {
    super(message);
    this.name = "OmadaHttpError";
  }
}

/** A well-formed Omada response carrying a non-zero `errorCode`. */
export class OmadaApiError extends Error {
  constructor(
    readonly errorCode: number,
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = "OmadaApiError";
  }
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  method?: HttpMethod;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface HttpClientOptions {
  verifyTls: boolean;
  timeoutMs: number;
  tlsCaFile?: string;
  tlsCertSha256?: string;
}

function normalizeFingerprint(value: string): string {
  return value.replace(/:/g, "").toUpperCase();
}

interface Envelope {
  errorCode: number;
  msg: string;
  result: unknown;
}

function asEnvelope(value: unknown): Envelope | undefined {
  if (
    value !== null &&
    typeof value === "object" &&
    "errorCode" in value &&
    typeof (value as Record<string, unknown>).errorCode === "number"
  ) {
    const obj = value as Record<string, unknown>;
    return {
      errorCode: obj.errorCode as number,
      msg: typeof obj.msg === "string" ? obj.msg : "",
      result: obj.result,
    };
  }
  return undefined;
}

export class HttpClient {
  private readonly dispatcher: Agent;

  constructor(private readonly options: HttpClientOptions) {
    // A dedicated dispatcher keeps controller TLS policy local to this client.
    // A pinned fingerprint may intentionally replace hostname validation for
    // legacy/self-signed Omada certificates without SAN, while the certificate
    // chain still remains verified through rejectUnauthorized + the configured CA.
    const expectedFingerprint = options.tlsCertSha256
      ? normalizeFingerprint(options.tlsCertSha256)
      : undefined;
    const ca = options.tlsCaFile ? readFileSync(options.tlsCaFile) : undefined;
    this.dispatcher = new Agent({
      connect: {
        rejectUnauthorized: options.verifyTls,
        ...(ca ? { ca } : {}),
        ...(expectedFingerprint
          ? {
              checkServerIdentity: (_hostname, cert) => {
                const actual = normalizeFingerprint(cert.fingerprint256 ?? "");
                return actual === expectedFingerprint
                  ? undefined
                  : new Error("Omada TLS certificate fingerprint mismatch");
              },
            }
          : {}),
      },
    });
  }

  /**
   * Performs a request, unwraps the Omada `{errorCode,msg,result}` envelope and
   * returns `result`. Throws `OmadaApiError` on a non-zero errorCode and
   * `OmadaHttpError` on transport failures or non-envelope responses.
   */
  async requestResult(url: string, options: RequestOptions = {}): Promise<unknown> {
    const { method = "GET", query, body } = options;

    const target = new URL(url);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          target.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
    let payload: string | undefined;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }

    let response: Awaited<ReturnType<typeof undiciFetch>>;
    try {
      response = await undiciFetch(target, {
        method,
        headers,
        body: payload,
        dispatcher: this.dispatcher,
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new OmadaHttpError(`request to ${target.pathname} failed: ${reason}`, undefined);
    }

    const text = await response.text();
    logger.debug(`${method} ${target.pathname} -> HTTP ${response.status}`);

    let parsed: unknown;
    try {
      parsed = text.length > 0 ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }

    const envelope = asEnvelope(parsed);
    if (envelope) {
      if (envelope.errorCode === 0) {
        return envelope.result;
      }
      throw new OmadaApiError(
        envelope.errorCode,
        envelope.msg || `Omada API error ${envelope.errorCode}`,
        response.status,
      );
    }

    throw new OmadaHttpError(
      `unexpected non-envelope response from ${target.pathname} (HTTP ${response.status})`,
      response.status,
      text.slice(0, 300),
    );
  }
}
