import type { Config } from "../config.js";
import { logger } from "../logger.js";
import { TokenManager } from "./auth.js";
import { HttpClient, OmadaHttpError, type RequestOptions } from "./http.js";
import { paginatedSchema, parseApiResult, type Site, siteSchema } from "./types.js";

/** Typed, thin wrapper over the Omada Open API. */
export class OmadaClient {
  private readonly http: HttpClient;
  private readonly tokens: TokenManager;

  constructor(private readonly config: Config) {
    this.http = new HttpClient({
      verifyTls: config.verifyTls,
      timeoutMs: config.timeoutMs,
    });
    this.tokens = new TokenManager(this.http, config);
  }

  /**
   * Authenticated request against an `/openapi/...` path. The Open API expects
   * a non-standard `Authorization: AccessToken=<token>` header. Retries once,
   * after refreshing the token, on an HTTP 401.
   */
  private async authedRequest(path: string, options: RequestOptions = {}): Promise<unknown> {
    const url = `${this.config.baseUrl}${path}`;
    const send = async (): Promise<unknown> => {
      const token = await this.tokens.getAccessToken();
      return this.http.requestResult(url, {
        ...options,
        headers: { ...options.headers, Authorization: `AccessToken=${token}` },
      });
    };

    try {
      return await send();
    } catch (error) {
      if (error instanceof OmadaHttpError && error.status === 401) {
        logger.warn("received HTTP 401; refreshing token and retrying once");
        this.tokens.invalidate();
        return send();
      }
      throw error;
    }
  }

  /** Lists all sites on the controller. Doubles as an auth/connectivity check. */
  async listSites(): Promise<Site[]> {
    const raw = await this.authedRequest(`/openapi/v1/${this.config.omadacId}/sites`, {
      query: { page: 1, pageSize: 100 },
    });
    const page = parseApiResult(
      paginatedSchema(siteSchema),
      raw,
      "GET /openapi/v1/{omadacId}/sites",
    );
    return page.data;
  }
}
