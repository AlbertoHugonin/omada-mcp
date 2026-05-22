import type { Config } from "../config.js";
import { logger, registerSecret } from "../logger.js";
import type { HttpClient } from "./http.js";
import { parseApiResult, tokenResultSchema } from "./types.js";

/**
 * Performs the OAuth2 client-credentials flow, caches the access token and
 * refreshes it shortly before expiry. Credentials come only from config.
 */
export class TokenManager {
  private cached: { token: string; expiresAt: number } | undefined;
  private inflight: Promise<string> | undefined;

  constructor(
    private readonly http: HttpClient,
    private readonly config: Config,
  ) {}

  /** Returns a valid access token, fetching or refreshing as needed. */
  async getAccessToken(): Promise<string> {
    if (this.cached && Date.now() < this.cached.expiresAt) {
      return this.cached.token;
    }
    // Coalesce concurrent callers onto a single in-flight token request.
    if (!this.inflight) {
      this.inflight = this.fetchToken().finally(() => {
        this.inflight = undefined;
      });
    }
    return this.inflight;
  }

  /** Drops the cached token so the next call fetches a fresh one. */
  invalidate(): void {
    this.cached = undefined;
  }

  private async fetchToken(): Promise<string> {
    logger.debug("requesting Open API access token");
    const raw = await this.http.requestResult(`${this.config.baseUrl}/openapi/authorize/token`, {
      method: "POST",
      query: { grant_type: "client_credentials" },
      body: {
        omadacId: this.config.omadacId,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      },
    });

    const token = parseApiResult(tokenResultSchema, raw, "POST /openapi/authorize/token");
    registerSecret(token.accessToken);
    registerSecret(token.refreshToken);

    // Refresh slightly before the real expiry to avoid mid-request expiration.
    const safetyMarginMs = 60_000;
    const lifetimeMs = Math.max(token.expiresIn * 1000 - safetyMarginMs, 0);
    this.cached = { token: token.accessToken, expiresAt: Date.now() + lifetimeMs };
    logger.info("acquired Open API access token", { expiresInSec: token.expiresIn });
    return token.accessToken;
  }
}
